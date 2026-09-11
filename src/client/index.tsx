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
  IconRefresh,
  IconSearch,
} from './icons.js'

export const inject = ['slots', 'sidebarRightTabs']

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

      // 默认展开首层目录
      setExpandedPaths(prev => {
        if (prev.size > 0) return prev
        const initial = new Set<string>()
        for (const item of res.items) {
          if (item.isDirectory) initial.add(item.path)
        }
        return initial
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
  }

  const handleCollapseAll = () => {
    setExpandedPaths(new Set())
  }

  // 复制相对路径
  const handleCopyPath = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(path).then(() => {
      showToastMsg(`已复制路径: ${path}`)
    })
  }

  // 一键 @ 引用到当前对话框输入框
  const handleMention = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    const mentionText = `@${path} `

    // 1. 尝试探测并注入到当前激活会话的主输入框 (Textarea)
    try {
      const input = document.querySelector('textarea') as HTMLTextAreaElement | null
      if (input) {
        const start = input.selectionStart ?? input.value.length
        const end = input.selectionEnd ?? input.value.length
        const prev = input.value
        input.value = prev.slice(0, start) + mentionText + prev.slice(end)
        input.selectionStart = input.selectionEnd = start + mentionText.length

        // 分发 input 事件通知 React 状态同步
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.focus()
      }
    } catch {}

    // 2. 写入剪贴板作为兜底
    void navigator.clipboard.writeText(mentionText.trim()).then(() => {
      showToastMsg(`已插入并复制引用: @${path}`)
    })
  }

  // 过滤树
  const filteredItems = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.items

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

    const res: FileItem[] = []
    for (const rootNode of data.items) {
      const matched = filterNode(rootNode)
      if (matched) res.push(matched)
    }
    return res
  }, [data, query])

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

      {/* Tree Content */}
      <div className="dsh-files-body">
        {loading && !data ? (
          <div className="dsh-files-centered">
            <div className="dsh-files-spinner" />
            <span>加载工作区文件…</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="dsh-files-empty">
            <div className="dsh-files-empty-icon"><IconFolder size={26} /></div>
            <div className="dsh-files-empty-title">{query ? '未搜索到匹配的文件' : '工作区为空'}</div>
            <div className="dsh-files-empty-detail">
              {query ? '请尝试更换搜索关键字' : '当前工作目录下暂无可显示的文件。'}
            </div>
          </div>
        ) : (
          <div className="dsh-files-tree">
            {filteredItems.map(item => (
              <FileTreeNode
                key={item.path}
                item={item}
                depth={0}
                query={query}
                isSearchMode={Boolean(query.trim())}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
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
  onMention: (e: React.MouseEvent, path: string) => void
  onCopyPath: (e: React.MouseEvent, path: string) => void
}): JSX.Element {
  const { item, depth, query, isSearchMode, expandedPaths, onToggleExpand, onOpenFile, onMention, onCopyPath } = props
  const isExpanded = isSearchMode ? true : expandedPaths.has(item.path)

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
        </div>
        {isExpanded && item.children?.map(child => (
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
          onClick={e => onMention(e, item.path)}
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
.dsh-files-row-actions {
  display: none;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.dsh-files-row:hover .dsh-files-row-actions {
  display: flex;
}
.dsh-files-row:hover .dsh-files-size {
  display: none;
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
