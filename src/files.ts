import { promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export interface FileItem {
  name: string
  path: string          // relative to workspace root, e.g. "src/client/index.tsx"
  isDirectory: boolean
  size?: number
  mtime?: number
  children?: FileItem[]
}

export interface WorkspaceFilesResult {
  root: string
  items: FileItem[]
  totalFiles: number
  totalDirs: number
}

// 常见大型构建产物、虚拟环境、开发缓存与三方依赖黑名单目录
const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.pnpm-store',
  '.turbo',
  '.next',
  '.nuxt',
  '.output',
  'dist',
  'build',
  'out',
  '.cache',
  '.idea',
  '.vscode',
  '.husky',
  'venv',
  '.venv',
  'env',
  '__pycache__',
  'target',      // Rust / Cargo / Maven
  '.gradle',
  '.cargo',
  'vendor',      // PHP / Go
  'coverage',
  'tmp',
  'temp',
  'logs',
  '.dsh',
])

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return !rel.startsWith('..') && !rel.includes(':')
}

// 快速解析工作区根目录的 .gitignore，避免深入被 git 忽略的庞大目录
async function loadGitIgnoreNames(rootDir: string): Promise<Set<string>> {
  const names = new Set<string>()
  try {
    const gitignorePath = join(rootDir, '.gitignore')
    const content = await fs.readFile(gitignorePath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || line.startsWith('!')) continue
      const clean = line.replace(/^\/+/, '').replace(/\/+$/, '')
      if (clean && !clean.includes('*') && !clean.includes('?') && !clean.includes('/')) {
        names.add(clean)
      }
    }
  } catch {}
  return names
}

export async function scanWorkspaceTree(
  cwd: string,
  options: { maxDepth?: number; showHidden?: boolean; showIgnored?: boolean } = {},
): Promise<WorkspaceFilesResult> {
  const root = resolve(cwd)
  const maxDepth = options.maxDepth ?? 16
  const showHidden = options.showHidden ?? false
  const showIgnored = options.showIgnored ?? false

  const gitIgnoredNames = showIgnored ? new Set<string>() : await loadGitIgnoreNames(root)

  let totalFiles = 0
  let totalDirs = 0
  let totalNodes = 0
  const MAX_NODES_SAFETY_LIMIT = 30000 // 防爆保护阈值

  async function walk(dirPath: string, currentDepth: number): Promise<FileItem[]> {
    if (currentDepth > maxDepth || totalNodes >= MAX_NODES_SAFETY_LIMIT) return []

    let dirents: import('node:fs').Dirent[]
    try {
      dirents = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return []
    }

    const dirTasks: Array<Promise<FileItem | null>> = []
    const fileItems: FileItem[] = []

    for (const ent of dirents) {
      if (totalNodes >= MAX_NODES_SAFETY_LIMIT) break

      const name = ent.name

      // 隐藏文件/文件夹过滤（以 . 开头）
      if (!showHidden && name.startsWith('.') && name !== '.gitignore' && name !== '.env') {
        if (!showIgnored) continue
      }

      // 忽略目录及 .gitignore 规则过滤
      if (!showIgnored) {
        if (ent.isDirectory() && DEFAULT_IGNORED_DIRS.has(name)) continue
        if (gitIgnoredNames.has(name)) continue
      }

      const fullPath = join(dirPath, name)
      if (!isWithin(root, fullPath)) continue

      const relPath = relative(root, fullPath).replace(/\\/g, '/')

      if (ent.isDirectory()) {
        totalDirs += 1
        totalNodes += 1
        dirTasks.push(
          walk(fullPath, currentDepth + 1).then(children => ({
            name,
            path: relPath,
            isDirectory: true,
            children,
          })),
        )
      } else {
        totalFiles += 1
        totalNodes += 1
        fileItems.push({
          name,
          path: relPath,
          isDirectory: false,
        })
      }
    }

    // 并行处理子目录
    const dirResults = await Promise.all(dirTasks)
    const validDirs = dirResults.filter((d): d is FileItem => d !== null)

    // 目录优先，按自然字母排序
    validDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    fileItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

    return [...validDirs, ...fileItems]
  }

  const items = await walk(root, 1)

  return {
    root,
    items,
    totalFiles,
    totalDirs,
  }
}
