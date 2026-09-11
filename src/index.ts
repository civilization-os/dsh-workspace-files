import type { Context } from '@deepseek-ai/cordis'
import { scanWorkspaceTree } from './files.js'

export const name = '@civilization/dsh-workspace-files'
export const inject = ['webServer']

async function readJsonBody(req: any): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8') })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
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

export function apply(ctx: Context): void {
  const webServer = (ctx as any).webServer
  if (!webServer) return

  const handleRpc = async (req: any, res: any, prefix: string) => {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { message: 'Method Not Allowed' } })
      return
    }

    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined

    if (method !== 'files.tree') {
      writeJson(res, 404, { ok: false, error: { message: `Unknown method: ${method}` } })
      return
    }

    try {
      const body = await readJsonBody(req)
      const cwd = resolveCwd(ctx, body)
      const result = await scanWorkspaceTree(cwd, {
        showHidden: Boolean(body.showHidden),
        showIgnored: Boolean(body.showIgnored),
        maxDepth: typeof body.maxDepth === 'number' ? body.maxDepth : 8,
      })
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

