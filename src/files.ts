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

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.turbo',
  '.next',
  'dist',
  'build',
  '.pnpm-store',
])

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return !rel.startsWith('..') && !rel.includes(':')
}

export async function scanWorkspaceTree(
  cwd: string,
  options: { maxDepth?: number; showHidden?: boolean; showIgnored?: boolean } = {},
): Promise<WorkspaceFilesResult> {
  const root = resolve(cwd)
  const maxDepth = options.maxDepth ?? 8
  const showHidden = options.showHidden ?? false
  const showIgnored = options.showIgnored ?? false

  let totalFiles = 0
  let totalDirs = 0

  async function walk(dirPath: string, currentDepth: number): Promise<FileItem[]> {
    if (currentDepth > maxDepth) return []

    let dirents: import('node:fs').Dirent[]
    try {
      dirents = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return []
    }

    // Sort: directories first, then files alphabetically
    dirents.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

    const items: FileItem[] = []

    for (const ent of dirents) {
      const name = ent.name

      // Hidden file filter (starts with .)
      if (!showHidden && name.startsWith('.') && name !== '.gitignore' && name !== '.env') {
        if (!showIgnored) continue
      }

      // Ignored directory filter
      if (!showIgnored && ent.isDirectory() && DEFAULT_IGNORED_DIRS.has(name)) {
        continue
      }

      const fullPath = join(dirPath, name)
      if (!isWithin(root, fullPath)) continue

      const relPath = relative(root, fullPath).replace(/\\/g, '/')

      if (ent.isDirectory()) {
        totalDirs += 1
        const children = await walk(fullPath, currentDepth + 1)
        items.push({
          name,
          path: relPath,
          isDirectory: true,
          children,
        })
      } else {
        totalFiles += 1
        let size: number | undefined
        let mtime: number | undefined
        try {
          const st = await fs.stat(fullPath)
          size = st.size
          mtime = st.mtimeMs
        } catch {}

        items.push({
          name,
          path: relPath,
          isDirectory: false,
          size,
          mtime,
        })
      }
    }

    return items
  }

  const items = await walk(root, 1)

  return {
    root,
    items,
    totalFiles,
    totalDirs,
  }
}
