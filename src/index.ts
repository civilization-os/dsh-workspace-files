import { spawn } from 'node:child_process'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { scanWorkspaceTree } from './files.js'

export const name = '@civilization/dsh-workspace-files'
export const inject = ['webServer']

export interface Config {
  maxDepth?: number
  showHidden?: boolean
}

export const Config: Schema<Config> = Schema.object({
  maxDepth: Schema.natural().min(1).max(100).default(16).description('工作区文件树扫描的最大文件夹深度（层级）'),
  showHidden: Schema.boolean().default(false).description('默认是否显示以点开头的隐藏文件'),
}).description('工作区文件：浏览与检索工作区文件树')

async function readJsonBody(req: any): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body)
    } catch {}
  }
  if (req.readableEnded || req.complete) {
    return {}
  }

  return new Promise((resolve, reject) => {
    let raw = ''
    let timer: any = null

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      req.off?.('data', onData)
      req.off?.('end', onEnd)
      req.off?.('error', onError)
    }

    const onData = (chunk: Buffer) => { raw += chunk.toString('utf8') }
    const onEnd = () => {
      cleanup()
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    }
    const onError = (err: any) => {
      cleanup()
      reject(err)
    }

    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)

    timer = setTimeout(() => {
      cleanup()
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    }, 1500)
  })
}

function writeJson(res: any, status: number, body: any): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  })
  res.end(data)
}

/**
 * 拒绝工作区之外的目标：files.open 的 path 来自请求体，必须是工作区内的相对/绝对路径，
 * 否则模型或页面脚本可以借宿主进程去打开任意本地路径。
 */
function assertInsideWorkspace(cwd: string, fullPath: string): void {
  const root = resolve(cwd)
  const target = resolve(fullPath)
  const rel = relative(root, target)
  const escaped = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
  if (escaped) throw new Error('Path must stay inside the workspace.')
}

/**
 * 启动系统文件管理器/默认应用。spawn 在命令不存在时会 emit 'error'，
 * 没有监听器就会变成未捕获异常拖垮宿主进程，因此这里必须兜住。
 */
function launch(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', (err: any) => {
    console.warn(`[dsh-workspace-files] failed to launch ${command}:`, err?.message || String(err))
  })
  child.unref()
}

function resolveCwd(ctx: Context, body: Record<string, any>): string {
  if (body.cwd?.trim()) return body.cwd.trim()
  if (body.root?.trim()) return body.root.trim()
  if (body.sessionId) {
    try {
      const sessions = ctx.get('sessions' as any) as any
      const session = sessions?.byId?.[body.sessionId]
      if (session?.cwd) return session.cwd
    } catch {}
  }
  return process.cwd()
}

export const SETTINGS_NS = 'workspace-files'

interface CacheEntry {
  timestamp: number
  result: any
}
const scanCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 20_000 // 20 秒热缓存

export function apply(ctx: Context, config: Config = {}): void {
  const liveConfig = {
    maxDepth: typeof config?.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : 16,
    showHidden: Boolean(config?.showHidden),
  }

  // 设置表单由 DSH 从本插件导出的 Config schema 自动生成（Host 侧 settings.describe()），
  // 无需也不存在插件侧的 settings.register()：DSH 的 settings 服务只提供
  // describe/update/replace/mutate/configure，namespace 就是 profile 里的 entry id。

  const webServer = (ctx as any).webServer
  if (!webServer) return

  const handleRpc = async (req: any, res: any, prefix: string) => {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { message: 'Method Not Allowed' } })
      return
    }

    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined

    if (method === 'config.get') {
      writeJson(res, 200, { ok: true, value: liveConfig })
      return
    }

    if (method === 'config.set') {
      try {
        const body = await readJsonBody(req)
        if (typeof body.maxDepth === 'number' && body.maxDepth > 0) liveConfig.maxDepth = body.maxDepth
        if (typeof body.showHidden === 'boolean') liveConfig.showHidden = body.showHidden
        writeJson(res, 200, { ok: true, value: liveConfig })
      } catch (err: any) {
        writeJson(res, 500, { ok: false, error: { message: err?.message || String(err) } })
      }
      return
    }

    if (method === 'files.open') {
      try {
        const body = await readJsonBody(req)
        const cwd = resolveCwd(ctx, body)
        const rawPath = String(body.path || '')
        if (!rawPath) {
          writeJson(res, 400, { ok: false, error: { message: 'Missing path parameter' } })
          return
        }

        const fullPath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath)
        assertInsideWorkspace(cwd, fullPath)
        const action = body.action || 'reveal'
        const isDirectory = Boolean(body.isDirectory)

        if (process.platform === 'win32') {
          const winPath = fullPath.replace(/\//g, '\\')
          // explorer.exe 自己解析路径，不再经过 cmd.exe 的字符串拼接，避免 & | ^ 等注入
          const args = action === 'reveal' && !isDirectory ? [`/select,${winPath}`] : [winPath]
          launch('explorer.exe', args)
        } else if (process.platform === 'darwin') {
          if (action === 'reveal') {
            launch('open', [isDirectory ? fullPath : '-R', fullPath])
          } else {
            launch('open', [fullPath])
          }
        } else {
          if (action === 'reveal') {
            launch('xdg-open', [isDirectory ? fullPath : resolve(fullPath, '..')])
          } else {
            launch('xdg-open', [fullPath])
          }
        }

        writeJson(res, 200, { ok: true })
      } catch (err: any) {
        writeJson(res, 500, { ok: false, error: { message: err?.message || String(err) } })
      }
      return
    }

    if (method !== 'files.tree') {
      writeJson(res, 404, { ok: false, error: { message: `Unknown method: ${method}` } })
      return
    }

    try {
      const body = await readJsonBody(req)
      const cwd = resolveCwd(ctx, body)
      const showHidden = typeof body.showHidden === 'boolean' ? body.showHidden : liveConfig.showHidden
      const showIgnored = Boolean(body.showIgnored)
      const maxDepth = typeof body.maxDepth === 'number' && body.maxDepth > 0 ? body.maxDepth : liveConfig.maxDepth
      const forceRefresh = Boolean(body.forceRefresh)

      const cacheKey = `${cwd}::${showHidden}::${showIgnored}::${maxDepth}`
      const now = Date.now()

      if (!forceRefresh) {
        const cached = scanCache.get(cacheKey)
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          writeJson(res, 200, { ok: true, value: cached.result, cached: true })
          return
        }
      }

      const result = await scanWorkspaceTree(cwd, {
        showHidden,
        showIgnored,
        maxDepth,
      })

      scanCache.set(cacheKey, { timestamp: now, result })
      writeJson(res, 200, { ok: true, value: result })
    } catch (err: any) {
      writeJson(res, 500, { ok: false, error: { message: err?.message || String(err) } })
    }
  }

  // 注册 /dsh-workspace-files/api/ 前缀
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/dsh-workspace-files/api',
    handler: (req: any, res: any) => handleRpc(req, res, '/dsh-workspace-files/api/'),
  }), 'dsh-workspace-files: /dsh-workspace-files/api routes')
}

