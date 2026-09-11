/**
 * Browser entry for the enhanced workspace files explorer plugin.
 * Overrides DSH official 'files' tab using 'priority: extension'.
 */
import type { Context } from '@deepseek-ai/cordis'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileGlyphIcon,
  IconAt,
  IconCheck,
  IconClose,
  IconCollapseAll,
  IconCopy,
  IconExpandAll,
  IconFolder,
  IconList,
  IconRefresh,
  IconSearch,
  IconTree,
} from './icons.js'

export const inject = ['slots', 'sidebarRightTabs']

let globalCtx: Context | null = null

const OFFICIAL_FILES_TAB_ID = '@civilization/dsh-workspace-files'

export interface FileItem {
  name: string
  path: string
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

function FolderGuideGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <IconFolder size={size} />
    </span>
  )
}

function WorkspaceFilesTabTitle({ useTabInfo }: any): JSX.Element {
  const info = useTabInfo ? useTabInfo() : null
  const title = info?.tab?.title || '工作区文件'
  return (
    <>
      <IconFolder size={15} />
      <span>{title}</span>
    </>
  )
}

function WorkspaceFilesTabBody(props: any): JSX.Element {
  const { sessionId, useSessions, useTabInfo } = props
  const tabInfo = useTabInfo ? useTabInfo() : null
  const tabActions = tabInfo?.tab?.actions

  const sessionCwd = useSessions ? useSessions((sessions: any) => sessions?.byId?.[sessionId]?.cwd) : undefined

  return (
    <WorkspaceFilesView
      sessionId={sessionId}
      cwd={sessionCwd}
      onOpenFile={(filePath: string) => {
        if (tabActions?.openResource && sessionId) {
          const normalized = filePath.replace(/\\/g, '/').replace(/^\.?\//, '')
          tabActions.openResource(`dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encodeURIComponent(normalized)}`)
        }
      }}
    />
  )
}

export function apply(ctx: Context): void {
  globalCtx = ctx
  const sidebarRightTabs = (ctx as any).sidebarRightTabs
  const slots = (ctx as any).slots

  if (sidebarRightTabs && slots) {
    // 关键：kind: 'files', priority: 'extension'（Rank 3 > builtin 2），完美接管官方文件标签页
    ctx.effect(() => sidebarRightTabs.register({
      id: OFFICIAL_FILES_TAB_ID,
      kind: 'files',
      priority: 'extension',
      title: () => '工作区文件',
      guide: [{
        order: 10,
        title: () => '工作区文件',
        description: () => '浏览、搜索与一键引用工作区文件',
        icon: FolderGuideGlyph,
      }],
    }), 'dsh-workspace-files: override official files tab')

    ctx.effect(() => slots.inject('sidebar.right.pane.tab', () => slots.register({
      name: 'sidebar.right.pane.tab',
      key: OFFICIAL_FILES_TAB_ID,
    }, WorkspaceFilesTabBody)), 'dsh-workspace-files: official tab body')

    ctx.effect(() => slots.inject('sidebar.right.pane.tab.title', () => slots.register({
      name: 'sidebar.right.pane.tab.title',
      key: OFFICIAL_FILES_TAB_ID,
    }, WorkspaceFilesTabTitle)), 'dsh-workspace-files: official tab title')
  }
}

/* ── Main Workspace Files View ── */
function WorkspaceFilesView({
  sessionId,
  cwd,
  onOpenFile,
}: {
  sessionId?: string
  cwd?: string
  onOpenFile: (path: string) => void
}): JSX.Element {
  const [data, setData] = useState<WorkspaceFilesResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const [showHidden, setShowHidden] = useState(false)

  const toastTimer = useRef<number | null>(null)

  const showToastMsg = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }, [])

  const loadTree = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const res = await call<WorkspaceFilesResult>('files.tree', { sessionId, cwd, showHidden })
      setData(res)

      // 默认折叠，并从 localStorage 恢复已记录的展开状态
      setExpandedPaths(prev => {
        if (prev.size > 0) return prev
        const stored = loadStoredExpandedPaths(res.root || cwd)
        if (stored !== null) return stored
        // 默认全部关闭，不展开任何目录
        return new Set<string>()
      })
    } catch (err: any) {
      setError(err?.message || '无法加载工作区文件')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [sessionId, cwd, showHidden])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const handleToggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      saveStoredExpandedPaths(data?.root || cwd, next)
      return next
    })
  }

  const handleExpandAll = () => {
    if (!data) return
    const all = new Set<string>()
    function collect(items: FileItem[]) {
      for (const it of items) {
        if (it.isDirectory) {
          all.add(it.path)
          if (it.children) collect(it.children)
        }
      }
    }
    collect(data.items)
    setExpandedPaths(all)
    saveStoredExpandedPaths(data.root || cwd, all)
  }

  const handleCollapseAll = () => {
    const empty = new Set<string>()
    setExpandedPaths(empty)
    saveStoredExpandedPaths(data?.root || cwd, empty)
  }

  // 复制相对路径
  const handleCopyPath = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(path).then(() => {
      showToastMsg(`已复制路径: ${path}`)
    })
  }

  // 一键 @ 引用到当前对话框输入框（优先插入官方原生交互式 Chip 胶囊）
  const handleMention = (e: React.MouseEvent, itemOrPath: string | FileItem) => {
    e.stopPropagation()
    const itemObj: FileItem = typeof itemOrPath === 'string'
      ? { name: itemOrPath.split('/').pop() || itemOrPath, path: itemOrPath, isDirectory: false }
      : itemOrPath

    const mentionText = formatMentionText(itemObj.path, itemObj.isDirectory)

    // 1. 优先尝试向会话输入框插入官方原生 ReferenceChipNode 胶囊卡片
    let inserted = false
    try {
      inserted = tryInsertNativeReferenceChip(globalCtx, sessionId, itemObj)
    } catch (err) {
      console.warn('[dsh-workspace-files] 原生 Chip 插入失败:', err)
    }

    // 2. 若原生 Chip 插入未成功，无缝降级为规范纯文本插入
    if (!inserted) {
      try {
        inserted = insertMentionToComposer(mentionText)
      } catch (err) {
        console.warn('[dsh-workspace-files] 降级纯文本插入失败:', err)
      }
    }

    // 写入剪贴板作为双重保障
    const displayName = itemObj.isDirectory ? `${itemObj.name}/` : itemObj.name
    void navigator.clipboard.writeText(mentionText.trim()).then(() => {
      if (inserted) {
        showToastMsg(`已引用${itemObj.isDirectory ? '目录' : '文件'}: ${displayName}`)
      } else {
        showToastMsg(`已复制引用: ${mentionText.trim()}`)
      }
    })
  }

  const [searchViewMode, setSearchViewMode] = useState<'flat' | 'tree'>('flat')
  const [searchExpandedPaths, setSearchExpandedPaths] = useState<Set<string>>(() => new Set())

  // 过滤树与扁平结果
  const { filteredTreeItems, flatSearchResults } = useMemo(() => {
    if (!data) return { filteredTreeItems: [], flatSearchResults: [] }
    const q = query.trim().toLowerCase()
    if (!q) return { filteredTreeItems: data.items, flatSearchResults: [] }

    // 扁平结果列表
    const flat: Array<{ item: FileItem; parentDir: string }> = []
    function traverseFlat(items: FileItem[], parentDir: string) {
      for (const it of items) {
        const match = it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q)
        if (match) {
          flat.push({ item: it, parentDir })
        }
        if (it.isDirectory && it.children) {
          traverseFlat(it.children, it.path)
        }
      }
    }
    traverseFlat(data.items, '')

    // 树形过滤集合
    function filterNode(node: FileItem): FileItem | null {
      const selfMatch = node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)
      if (node.isDirectory) {
        const filteredChildren: FileItem[] = []
        for (const child of node.children || []) {
          const matchedChild = filterNode(child)
          if (matchedChild) filteredChildren.push(matchedChild)
        }
        if (selfMatch || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
        return null
      }
      return selfMatch ? node : null
    }

    const tree: FileItem[] = []
    for (const rootNode of data.items) {
      const matched = filterNode(rootNode)
      if (matched) tree.push(matched)
    }

    return { filteredTreeItems: tree, flatSearchResults: flat }
  }, [data, query])

  // 搜索关键字变化时，自动展开匹配的目录树节点，并允许用户后续自由折叠/展开
  useEffect(() => {
    if (!query.trim() || !data) return
    const q = query.trim().toLowerCase()
    const autoExpand = new Set<string>()
    function collect(items: FileItem[]) {
      for (const it of items) {
        if (it.isDirectory) {
          const selfMatch = it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q)
          const childMatch = it.children?.some(c => c.name.toLowerCase().includes(q) || c.path.toLowerCase().includes(q))
          if (selfMatch || childMatch) autoExpand.add(it.path)
          if (it.children) collect(it.children)
        }
      }
    }
    collect(data.items)
    setSearchExpandedPaths(autoExpand)
  }, [query, data])

  const isSearchActive = Boolean(query.trim())

  return (
    <div className="dsh-files-root">
      <GlobalFilesStyle />

      {/* Header */}
      <header className="dsh-files-header">
        <div className="dsh-files-header-info">
          <div className="dsh-files-title-row">
            <span className="dsh-files-title">工作区文件</span>
            {data && (
              <span className="dsh-files-stats-badge">
                {data.totalFiles} 文件 · {data.totalDirs} 目录
              </span>
            )}
          </div>
          <div className="dsh-files-root-path" title={data?.root || cwd}>
            {data?.root || cwd || '当前会话没有工作目录'}
          </div>
        </div>
      </header>

      {/* Search & Actions Toolbar */}
      <div className="dsh-files-toolbar">
        <div className="dsh-files-search-wrap">
          <span className="dsh-files-search-icon"><IconSearch size={13} /></span>
          <input
            type="text"
            className="dsh-files-search-input"
            placeholder="搜索工作区文件 (支持路径筛选)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setQuery('')
            }}
          />
          {query && (
            <button
              type="button"
              className="dsh-files-clear-btn"
              onClick={() => setQuery('')}
              title="清除搜索"
            >
              <IconClose size={12} />
            </button>
          )}
        </div>

        <div className="dsh-files-toolbar-btns">
          {isSearchActive ? (
            <button
              type="button"
              className="dsh-files-tool-btn is-active"
              onClick={() => setSearchViewMode(searchViewMode === 'flat' ? 'tree' : 'flat')}
              title={searchViewMode === 'flat' ? '当前为扁平列表，点击切换为树形视图' : '当前为树形视图，点击切换为扁平列表'}
            >
              {searchViewMode === 'flat' ? <IconTree size={13} /> : <IconList size={13} />}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="dsh-files-tool-btn"
                onClick={handleExpandAll}
                title="全部展开"
              >
                <IconExpandAll size={13} />
              </button>
              <button
                type="button"
                className="dsh-files-tool-btn"
                onClick={handleCollapseAll}
                title="全部折叠"
              >
                <IconCollapseAll size={13} />
              </button>
            </>
          )}

          <button
            type="button"
            className={`dsh-files-tool-btn ${showHidden ? 'is-active' : ''}`}
            onClick={() => setShowHidden(!showHidden)}
            title={showHidden ? '隐藏点号开头的文件' : '显示点号开头的文件'}
          >
            <span style={{ fontSize: 11, fontWeight: 700 }}>.*</span>
          </button>
          <button
            type="button"
            className="dsh-files-tool-btn"
            onClick={() => void loadTree(true)}
            disabled={loading}
            title="刷新文件树"
          >
            <IconRefresh size={13} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="dsh-files-banner-error">
          <span>{error}</span>
          <button type="button" className="dsh-files-banner-close" onClick={() => setError(null)}>
            <IconClose size={12} />
          </button>
        </div>
      )}

      {/* Tree / Search Results Content */}
      <div className="dsh-files-body">
        {loading && !data ? (
          <div className="dsh-files-centered">
            <div className="dsh-files-spinner" />
            <span>加载工作区文件…</span>
          </div>
        ) : isSearchActive && flatSearchResults.length === 0 ? (
          <div className="dsh-files-empty">
            <div className="dsh-files-empty-icon"><IconFolder size={26} /></div>
            <div className="dsh-files-empty-title">未搜索到匹配的文件</div>
            <div className="dsh-files-empty-detail">请尝试更换搜索关键字，或按 Esc 清除搜索。</div>
          </div>
        ) : !isSearchActive && (!data || data.items.length === 0) ? (
          <div className="dsh-files-empty">
            <div className="dsh-files-empty-icon"><IconFolder size={26} /></div>
            <div className="dsh-files-empty-title">工作区为空</div>
            <div className="dsh-files-empty-detail">当前工作目录下暂无可显示的文件。</div>
          </div>
        ) : isSearchActive && searchViewMode === 'flat' ? (
          /* ── 扁平搜索结果列表 ── */
          <div className="dsh-files-search-container">
            <div className="dsh-files-search-header">
              <span className="dsh-files-search-count">找到 {flatSearchResults.length} 个匹配项</span>
              <button
                type="button"
                className="dsh-files-view-toggle-btn"
                onClick={() => setSearchViewMode('tree')}
                title="切换为可折叠的树形视图"
              >
                <IconTree size={12} />
                <span>切为树形</span>
              </button>
            </div>
            <div className="dsh-files-flat-list">
              {flatSearchResults.map(({ item, parentDir }) => (
                <div
                  key={item.path}
                  className="dsh-files-flat-row"
                  onClick={() => !item.isDirectory && onOpenFile(item.path)}
                  title={`点击打开: ${item.path}`}
                >
                  <span className="dsh-files-flat-icon">
                    {item.isDirectory ? <IconFolder size={14} /> : <FileGlyphIcon filename={item.name} size={14} />}
                  </span>
                  <div className="dsh-files-flat-info">
                    <div className="dsh-files-flat-top">
                      <span className="dsh-files-flat-name">
                        <HighlightText text={item.name} query={query} />
                        {item.isDirectory && '/'}
                      </span>
                      {item.size !== undefined && (
                        <span className="dsh-files-size">{formatFileSize(item.size)}</span>
                      )}
                    </div>
                    {parentDir && (
                      <div className="dsh-files-flat-parent" title={parentDir}>
                        {parentDir}
                      </div>
                    )}
                  </div>
                  <div className="dsh-files-row-actions">
                    <button
                      type="button"
                      className="dsh-files-action-btn dsh-files-action-at"
                      onClick={e => handleMention(e, item)}
                      title={`一键 @ 引用此${item.isDirectory ? '目录' : '文件'}到当前会话`}
                    >
                      <IconAt size={13} />
                      <span className="dsh-files-action-at-text">@引用</span>
                    </button>
                    <button
                      type="button"
                      className="dsh-files-action-btn"
                      onClick={e => handleCopyPath(e, item.path)}
                      title="复制相对路径"
                    >
                      <IconCopy size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── 树形视图（普通模式或搜索树模式） ── */
          <div className="dsh-files-tree">
            {isSearchActive && (
              <div className="dsh-files-search-header">
                <span className="dsh-files-search-count">树形匹配（自由折叠/展开）</span>
                <button
                  type="button"
                  className="dsh-files-view-toggle-btn"
                  onClick={() => setSearchViewMode('flat')}
                  title="切换为扁平搜索结果列表"
                >
                  <IconList size={12} />
                  <span>切为列表</span>
                </button>
              </div>
            )}
            {filteredTreeItems.map(item => (
              <FileTreeNode
                key={item.path}
                item={item}
                depth={0}
                query={query}
                isSearchMode={isSearchActive}
                expandedPaths={isSearchActive ? searchExpandedPaths : expandedPaths}
                onToggleExpand={(path: string) => {
                  if (isSearchActive) {
                    setSearchExpandedPaths(prev => {
                      const next = new Set(prev)
                      if (next.has(path)) next.delete(path)
                      else next.add(path)
                      return next
                    })
                  } else {
                    handleToggleExpand(path)
                  }
                }}
                onOpenFile={onOpenFile}
                onMention={handleMention}
                onCopyPath={handleCopyPath}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="dsh-files-toast">
          <IconCheck size={12} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}

/* ── Tree Node Component ── */
function FileTreeNode(props: {
  item: FileItem
  depth: number
  query: string
  isSearchMode: boolean
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onOpenFile: (path: string) => void
  onMention: (e: React.MouseEvent, item: FileItem) => void
  onCopyPath: (e: React.MouseEvent, path: string) => void
}): JSX.Element {
  const { item, depth, query, isSearchMode, expandedPaths, onToggleExpand, onOpenFile, onMention, onCopyPath } = props
  const isExpanded = expandedPaths.has(item.path)

  if (item.isDirectory) {
    const childCount = item.children?.length ?? 0
    return (
      <div className="dsh-files-dir-block">
        <div
          className="dsh-files-dir-row"
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          onClick={() => onToggleExpand(item.path)}
        >
          <span className="dsh-files-chevron" data-collapsed={!isExpanded ? 'true' : undefined}>▾</span>
          <span className="dsh-files-folder-icon">
            <IconFolder size={14} open={isExpanded} />
          </span>
          <span className="dsh-files-folder-name" title={item.path}>
            <HighlightText text={item.name} query={query} />
          </span>
          <span className="dsh-files-count-badge">{childCount}</span>

          <div className="dsh-files-row-actions">
            <button
              type="button"
              className="dsh-files-action-btn dsh-files-action-at"
              onClick={e => onMention(e, item)}
              title="一键 @ 引用此目录到当前会话"
            >
              <IconAt size={13} />
              <span className="dsh-files-action-at-text">@引用</span>
            </button>
            <button
              type="button"
              className="dsh-files-action-btn"
              onClick={e => onCopyPath(e, item.path)}
              title="复制目录路径"
            >
              <IconCopy size={12} />
            </button>
          </div>
        </div>
        {isExpanded && item.children && (
          <div className="dsh-files-children">
            {item.children.map(child => (
              <FileTreeNode
                key={child.path}
                item={child}
                depth={depth + 1}
                query={query}
                isSearchMode={isSearchMode}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                onOpenFile={onOpenFile}
                onMention={onMention}
                onCopyPath={onCopyPath}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File item row
  return (
    <div
      className="dsh-files-row"
      style={{ paddingLeft: `${depth * 14 + 10}px` }}
      onClick={() => onOpenFile(item.path)}
      title={`点击打开: ${item.path}`}
    >
      <FileGlyphIcon filename={item.name} size={14} />
      <span className="dsh-files-name">
        <HighlightText text={item.name} query={query} />
      </span>

      {item.size !== undefined && (
        <span className="dsh-files-size" title={`大小: ${item.size} 字节`}>
          {formatFileSize(item.size)}
        </span>
      )}

      {/* Row Hover Actions */}
      <div className="dsh-files-row-actions">
        <button
          type="button"
          className="dsh-files-action-btn dsh-files-action-at"
          onClick={e => onMention(e, item)}
          title="一键 @ 引用此文件到当前会话"
        >
          <IconAt size={13} />
          <span className="dsh-files-action-at-text">@引用</span>
        </button>
        <button
          type="button"
          className="dsh-files-action-btn"
          onClick={e => onCopyPath(e, item.path)}
          title="复制相对路径"
        >
          <IconCopy size={12} />
        </button>
      </div>
    </div>
  )
}

/* ── Helpers ── */
function HighlightText({ text, query }: { text: string; query: string }): JSX.Element {
  const q = query.trim().toLowerCase()
  if (!q) return <span>{text}</span>
  const index = text.toLowerCase().indexOf(q)
  if (index === -1) return <span>{text}</span>

  const before = text.slice(0, index)
  const match = text.slice(index, index + q.length)
  const after = text.slice(index + q.length)

  return (
    <span>
      {before}
      <mark className="dsh-files-highlight">{match}</mark>
      {after}
    </span>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

/**
 * 按照 DSH 官方规范格式化引用路径：
 * - 纯路径无空格：@path
 * - 路径含空格：@"path"
 * - 目录末尾保留斜杠：@folder/ 或 @"folder/"
 */
function formatMentionText(path: string, isDirectory = false): string {
  const cleanPath = path.replace(/\\/g, '/').replace(/^\.?\//, '')
  const finalPath = isDirectory ? (cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`) : cleanPath
  if (/\s/u.test(finalPath)) {
    return `@"${finalPath}" `
  }
  return `@${finalPath} `
}

function getStorageKey(workspaceRoot?: string): string {
  const safe = (workspaceRoot || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `dsh_files_expanded_${safe}`
}

function loadStoredExpandedPaths(workspaceRoot?: string): Set<string> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(getStorageKey(workspaceRoot))
    if (!raw) return null
    const list = JSON.parse(raw)
    if (Array.isArray(list)) return new Set<string>(list)
  } catch {}
  return null
}

function saveStoredExpandedPaths(workspaceRoot: string | undefined, paths: Set<string>): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(getStorageKey(workspaceRoot), JSON.stringify(Array.from(paths)))
  } catch {}
}

/**
 * 尝试通过 DSH 官方 conversation.input 服务直接向会话输入框插入原生的 ReferenceChipNode（官方胶囊卡片）
 */
function tryInsertNativeReferenceChip(ctx: Context | null, sessionId: string | undefined, item: FileItem): boolean {
  if (!ctx || !sessionId) return false
  try {
    const conversation = (ctx as any).conversation || (ctx as any).get?.('conversation')
    const inputService = conversation?.input || (ctx as any)['conversation.input'] || (ctx as any).get?.('conversation.input')
    if (!inputService) return false

    // 获取当前会话的 SessionInputShell
    const shell = inputService.shell?.(sessionId) || inputService.shells?.get?.(sessionId)
    if (!shell) return false

    // 聚焦输入框
    const composerDom = document.querySelector<HTMLElement>('[data-composer-input="true"], [data-composer-input]')
    if (composerDom) composerDom.focus()

    const cleanPath = item.path.replace(/\\/g, '/').replace(/^\.?\//, '')
    const mention = item.isDirectory ? (cleanPath.endsWith('/') ? `@${cleanPath}` : `@${cleanPath}/`) : `@${cleanPath}`
    const label = item.isDirectory ? (item.name.endsWith('/') ? item.name : `${item.name}/`) : item.name

    const reference = {
      source: 'reference',
      ref: mention,
      label,
      appearance: item.isDirectory ? 'folder' : 'file',
      clipboardText: mention,
    }

    const text = shell.projection?.detectText || ''
    let caret = shell.projection?.caret ?? text.length
    let start = caret
    const end = caret

    // 智能消除：若当前光标前是 '@'，回退一个字符将其替换
    if (start > 0 && text[start - 1] === '@') {
      start = start - 1
    }

    const span = {
      draftRev: shell.rev,
      start,
      end,
    }

    if (typeof shell.insertReference === 'function') {
      const ok = shell.insertReference(reference, span)
      if (ok) return true
    }

    // 备用：尝试通过 session actx 派发事件
    const actx = shell.deps?.actx
    if (actx && typeof actx.bail === 'function') {
      const ok = actx.bail(actx, 'slash/input-insert-reference', { reference, span })
      if (ok === true) return true
    }
  } catch (err) {
    console.debug('[dsh-workspace-files] 插入原生 Chip 异常，降级纯文本:', err)
  }
  return false
}

/**
 * 将引用文本注入到 DSH 当前会话的主输入框。
 * 兼容 DSH 官方基于 Lexical 的 ComposerContentEditable (div[data-composer-input])
 * 以及传统的 textarea / input，并自动消除用户手动输入的冗余 '@'。
 */
function insertMentionToComposer(mentionText: string): boolean {
  if (typeof document === 'undefined') return false

  // 1. 查找 DSH 官方输入框（Lexical contenteditable 容器优先）
  const candidates = [
    document.querySelector<HTMLElement>('[data-composer-input="true"]'),
    document.querySelector<HTMLElement>('[data-composer-input]'),
    document.querySelector<HTMLElement>('[data-composer-card] [contenteditable="true"]'),
    document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]'),
    document.querySelector<HTMLTextAreaElement>('textarea:not([readonly]):not(.dsh-files-search-input)'),
  ].filter(Boolean) as HTMLElement[]

  const target = candidates[0]
  if (!target) return false

  target.focus()

  // 策略 A: contenteditable (DSH 官方 Lexical 编辑器)
  if (target.getAttribute('contenteditable') === 'true' || target.isContentEditable) {
    const sel = window.getSelection()
    if (sel) {
      let isInTarget = false
      if (sel.rangeCount > 0) {
        const anchor = sel.anchorNode
        if (anchor && (anchor === target || target.contains(anchor))) {
          isInTarget = true
        }
      }
      if (!isInTarget) {
        const range = document.createRange()
        range.selectNodeContents(target)
        range.collapse(false) // 光标定位到文本最末尾
        sel.removeAllRanges()
        sel.addRange(range)
      } else {
        // 智能消除：若光标前一个字符是已键入的 '@'，将其纳入选区进行覆盖替换，避免出现 '@@file'
        const range = sel.getRangeAt(0)
        if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
          const nodeText = range.startContainer.textContent || ''
          const offset = range.startOffset
          if (offset > 0 && nodeText[offset - 1] === '@') {
            range.setStart(range.startContainer, offset - 1)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        }
      }
    }

    // 原生 execCommand('insertText') 会直接触发 Lexical 的 input/beforeinput 事件流并更新 React 状态
    let success = false
    try {
      success = document.execCommand('insertText', false, mentionText)
    } catch {}

    if (!success) {
      try {
        const evt = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: mentionText,
        })
        target.dispatchEvent(evt)
        success = true
      } catch {}
    }

    return success
  }

  // 策略 B: 普通 textarea / input
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    let start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const prev = target.value

    // 智能消除：若前面紧随 '@'，覆盖它
    if (start > 0 && prev[start - 1] === '@') {
      start = start - 1
    }

    let success = false
    try {
      target.selectionStart = start
      target.selectionEnd = end
      success = document.execCommand('insertText', false, mentionText)
    } catch {}

    if (!success) {
      const next = prev.slice(0, start) + mentionText + prev.slice(end)
      const proto = target instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      if (setter) {
        setter.call(target, next)
      } else {
        target.value = next
      }

      target.selectionStart = target.selectionEnd = start + mentionText.length
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: mentionText }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
      success = true
    }
    return success
  }

  return false
}

async function call<T = any>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  let response: Response | null = await fetch(`/dsh-workspace-files/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null)

  if (!response || !response.ok) {
    response = await fetch(`/sidebar/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null)
  }

  if (!response) {
    throw new Error('网络请求失败：无法连接到工作区文件服务')
  }

  const envelope = (await response.json().catch(() => null)) as {
    ok?: boolean
    value?: T
    error?: { message?: string }
  } | null

  if (!response.ok || envelope?.ok !== true || envelope.value === undefined) {
    throw new Error(envelope?.error?.message ?? `HTTP ${response.status}`)
  }
  return envelope.value
}

/* ── CSS Styles ── */
function GlobalFilesStyle(): JSX.Element {
  return (
    <style>{`
.dsh-files-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #17233c);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  position: relative;
}

/* ── Header ── */
.dsh-files-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(118,137,166,.18));
}
.dsh-files-header-info {
  flex: 1;
  min-width: 0;
}
.dsh-files-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-files-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-files-stats-badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.1));
  padding: 1px 6px;
  border-radius: 99px;
}
.dsh-files-root-path {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}

/* ── Toolbar & Search ── */
.dsh-files-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(118,137,166,.15));
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dsh-files-search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
.dsh-files-search-icon {
  position: absolute;
  left: 7px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  pointer-events: none;
  display: flex;
}
.dsh-files-search-input {
  box-sizing: border-box;
  width: 100%;
  height: 25px;
  padding: 0 22px 0 26px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(118,137,166,.25));
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.06));
  color: inherit;
  font-size: 11.5px;
  outline: none;
  transition: all 0.15s ease;
}
.dsh-files-search-input:focus {
  background: var(--dsw-alias-bg-base, #ffffff);
  border-color: var(--dsw-alias-brand-primary, #4b70e2);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 15%, transparent);
}
.dsh-files-clear-btn {
  position: absolute;
  right: 5px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  cursor: pointer;
  padding: 2px;
  display: flex;
}
.dsh-files-clear-btn:hover {
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-files-toolbar-btns {
  display: flex;
  align-items: center;
  gap: 2px;
}
.dsh-files-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  cursor: pointer;
  transition: all 0.12s ease;
}
.dsh-files-tool-btn:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.1));
}
.dsh-files-tool-btn.is-active {
  color: var(--dsw-alias-brand-primary, #4b70e2);
  background: var(--dsw-alias-interactive-bg-active, rgba(75,112,226,.15));
}
.dsh-files-tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Tree Body ── */
.dsh-files-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}
.dsh-files-dir-block {
  display: flex;
  flex-direction: column;
}
.dsh-files-dir-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  user-select: none;
  position: relative;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  transition: background 0.12s ease;
}
.dsh-files-dir-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.08));
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-files-chevron {
  font-size: 10px;
  transition: transform 0.15s ease;
  display: inline-block;
  opacity: 0.8;
}
.dsh-files-chevron[data-collapsed='true'] {
  transform: rotate(-90deg);
}
.dsh-files-folder-icon {
  display: flex;
}
.dsh-files-folder-name {
  flex: 1;
  min-width: 0;
  font-weight: 500;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-files-count-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 99px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.1));
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}

/* ── File Row ── */
.dsh-files-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  user-select: none;
  position: relative;
  transition: background 0.12s ease;
}
.dsh-files-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.08));
}
.dsh-files-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-files-size {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  flex-shrink: 0;
  margin-right: 4px;
}

/* ── Hover Actions on Rows ── */
.dsh-files-row-actions {
  display: none;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.dsh-files-row:hover .dsh-files-row-actions,
.dsh-files-dir-row:hover .dsh-files-row-actions,
.dsh-files-flat-row:hover .dsh-files-row-actions {
  display: flex;
}
.dsh-files-row:hover .dsh-files-size,
.dsh-files-dir-row:hover .dsh-files-count-badge,
.dsh-files-flat-row:hover .dsh-files-size {
  display: none;
}

/* ── Flat Search Result List ── */
.dsh-files-search-container {
  display: flex;
  flex-direction: column;
}
.dsh-files-search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 4%, transparent);
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(118,137,166,.15));
}
.dsh-files-search-count {
  font-weight: 500;
}
.dsh-files-view-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(118,137,166,.25));
  background: var(--dsw-alias-container-bg, var(--dsw-alias-bg-base, #ffffff));
  color: var(--dsw-alias-brand-primary, #4b70e2);
  cursor: pointer;
  font-size: 10.5px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  transition: all 0.12s ease;
}
.dsh-files-view-toggle-btn:hover {
  background: var(--dsw-alias-brand-primary, #4b70e2);
  color: #ffffff;
  border-color: var(--dsw-alias-brand-primary, #4b70e2);
}
.dsh-files-flat-list {
  padding: 4px 0;
}
.dsh-files-flat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  cursor: pointer;
  user-select: none;
  position: relative;
  transition: background 0.12s ease;
  min-height: 32px;
}
.dsh-files-flat-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.08));
}
.dsh-files-flat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dsh-files-flat-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dsh-files-flat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.dsh-files-flat-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-files-flat-parent {
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}
.dsh-files-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 20px;
  padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(118,137,166,.25));
  border-radius: 3px;
  background: var(--dsw-alias-container-bg, var(--dsw-alias-bg-base, #ffffff));
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  cursor: pointer;
  transition: all 0.12s ease;
}
.dsh-files-action-btn:hover {
  color: var(--dsw-alias-label-primary, inherit);
  border-color: var(--dsw-alias-border-l3, rgba(118,137,166,.4));
  background: var(--dsw-alias-interactive-bg-hover, rgba(100,120,150,.12));
}
.dsh-files-action-at {
  color: var(--dsw-alias-brand-primary, #4b70e2);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 30%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 8%, transparent);
}
.dsh-files-action-at:hover {
  color: #ffffff;
  background: var(--dsw-alias-brand-primary, #4b70e2);
  border-color: var(--dsw-alias-brand-primary, #4b70e2);
}
.dsh-files-action-at-text {
  font-size: 10px;
  font-weight: 600;
}

/* ── Highlight & Toast ── */
.dsh-files-highlight {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 25%, transparent);
  color: var(--dsw-alias-brand-primary, #4b70e2);
  font-weight: 600;
  border-radius: 2px;
  padding: 0 1px;
}
.dsh-files-toast {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--dsw-alias-label-primary, #17233c);
  color: var(--dsw-alias-bg-base, #ffffff);
  font-size: 11px;
  border-radius: 99px;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
  animation: dsh-files-fade-in 0.15s ease;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
}
@keyframes dsh-files-fade-in {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ── Empty & Centered ── */
.dsh-files-centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 180px;
  gap: 10px;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
}
.dsh-files-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--dsw-alias-border-l2, rgba(118,137,166,.3));
  border-top-color: var(--dsw-alias-brand-primary, #4b70e2);
  border-radius: 50%;
  animation: dsh-files-spin 0.8s linear infinite;
}
@keyframes dsh-files-spin {
  to { transform: rotate(360deg); }
}
.dsh-files-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
}
.dsh-files-empty-icon {
  margin-bottom: 8px;
  opacity: 0.6;
}
.dsh-files-empty-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}
.dsh-files-empty-detail {
  font-size: 11.5px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}
.dsh-files-banner-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  font-size: 11.5px;
  color: var(--dsw-alias-state-error-primary, #e34c59);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #e34c59) 10%, transparent);
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(118,137,166,.2));
}
.dsh-files-banner-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
`}</style>
  )
}
