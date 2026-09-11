import type { Context } from '@deepseek-ai/cordis'
import { scanWorkspaceTree } from './files.js'

export const inject = []

interface SessionScope {
  sessionId?: string
  cwd?: string
  root?: string
}

function resolveCwd(ctx: Context, scope: SessionScope): string {
  if (scope.cwd?.trim()) return scope.cwd.trim()
  if (scope.root?.trim()) return scope.root.trim()
  if (scope.sessionId) {
    try {
      const sessions = ctx.get('sessions' as any) as any
      const session = sessions?.byId?.[scope.sessionId]
      if (session?.cwd) return session.cwd
    } catch {}
  }
  return process.cwd()
}

export function apply(ctx: Context): void {
  const router = ctx.get('router' as any) as any
  if (!router) return

  const handler = async (koaCtx: any) => {
    const path = String(koaCtx.params.method || koaCtx.params[0] || '')
    const body = koaCtx.request?.body ?? {}
    const scope: SessionScope = {
      sessionId: body.sessionId,
      cwd: body.cwd,
      root: body.root,
    }

    const cwd = resolveCwd(ctx, scope)

    try {
      if (path === 'files.tree') {
        const result = await scanWorkspaceTree(cwd, {
          showHidden: Boolean(body.showHidden),
          showIgnored: Boolean(body.showIgnored),
          maxDepth: typeof body.maxDepth === 'number' ? body.maxDepth : 8,
        })
        koaCtx.body = { ok: true, value: result }
        return
      }

      koaCtx.status = 404
      koaCtx.body = { ok: false, error: { message: `Unknown method: ${path}` } }
    } catch (err: any) {
      koaCtx.status = 500
      koaCtx.body = { ok: false, error: { message: err?.message || String(err) } }
    }
  }

  try {
    router.post('/dsh-workspace-files/api/:method', handler)
    router.post('/sidebar/api/files.:method', handler)
  } catch {}
}
