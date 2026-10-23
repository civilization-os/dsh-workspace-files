/**
 * Browser entry for the enhanced workspace files explorer plugin.
 * High-performance virtualized flat-row rendering with DSH Design Tokens and UI Motion.
 * Overrides DSH official 'files' tab using 'priority: extension'.
 */
import type { Context } from '@deepseek-ai/cordis'
import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  FileGlyphIcon,
  IconAt,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconCollapseAll,
  IconCopy,
  IconExpandAll,
  IconExplorer,
  IconExternalApp,
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
  const title = info?.tab?.title || '文件'
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
    ctx.effect(() => sidebarRightTabs.register({
      id: OFFICIAL_FILES_TAB_ID,
      kind: 'files',
      priority: 'extension',
      title: () => '文件',
      guide: [{
        order: 10,
        title: () => '文件',
        description: () => '浏览、搜索与一键引用项目文件',
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

  const registerSettingsCard = (targetCtx: any) => {
    if (!targetCtx?.slots) return
    targetCtx.effect?.(() => targetCtx.slots.inject('settings.plugin.item', function* () {
      yield targetCtx.slots.register({
        name: 'settings.plugin.item',
        key: 'workspace-files',
      }, WorkspaceFilesSettingsCard)
      yield targetCtx.slots.register({
        name: 'settings.plugin.item',
        key: '@civilization/dsh-workspace-files',
      }, WorkspaceFilesSettingsCard)
    }), 'dsh-workspace-files: settings card')
  }

  if (slots) {
    registerSettingsCard(ctx)
  }
  if ((ctx as any).inject) {
    (ctx as any).inject(['settingsScope'], (scoped: any) => {
      registerSettingsCard(scoped)
    })
  }
}

/* ── Workspace Files Configuration Store ── */
export interface WorkspaceFilesConfig {
  maxDepth: number
  showHidden: boolean
}

const CONFIG_STORAGE_KEY = 'dsh_workspace_files_config'

export function loadWorkspaceFilesConfig(): WorkspaceFilesConfig {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONFIG_STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        maxDepth: typeof parsed.maxDepth === 'number' && parsed.maxDepth > 0 ? parsed.maxDepth : 16,
        showHidden: Boolean(parsed.showHidden),
      }
    }
  } catch {}
  return { maxDepth: 16, showHidden: false }
}

export function saveWorkspaceFilesConfig(cfg: WorkspaceFilesConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg))
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dsh-workspace-files:config-change', { detail: cfg }))
    }
    fetch('/dsh-workspace-files/api/config.set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cfg),
    }).catch(() => {})
  } catch {}
}

function ensureSettingsStyle() {
  if (typeof document === 'undefined') return
  const id = 'dsh-workspace-files-settings-style'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
.dsh-wf-card {
  border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-fill-base, #ffffff);
  border-radius: var(--dsw-radius-md, 8px);
  list-style: none;
  transition: border-color 0.16s, background 0.16s;
  box-sizing: border-box;
}
.dsh-wf-card-open {
  background: var(--dsw-alias-fill-base, #ffffff);
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-wf-header {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  display: flex;
}
.dsh-wf-head-text {
  flex-direction: column;
  flex: 1;
  gap: 3px;
  min-width: 0;
  display: flex;
}
.dsh-wf-name {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-wf-version {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-wf-desc {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.dsh-wf-chevron {
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
}
.dsh-wf-chevron-open {
  transform: rotate(180deg);
}
.dsh-wf-body {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  margin: 0 14px;
  padding: 8px 0 12px;
}
.dsh-wf-row {
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  display: flex;
  justify-content: space-between;
}
.dsh-wf-row + .dsh-wf-row {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-wf-label-box {
  flex-direction: column;
  flex: 1;
  gap: 3px;
  min-width: 0;
  display: flex;
}
.dsh-wf-label {
  font-size: 13px;
  font-weight: 550;
  color: var(--dsw-alias-label-primary);
}
.dsh-wf-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11.5px;
  line-height: 16px;
}
.dsh-wf-ctrl {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-wf-seg {
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm, 6px);
  gap: 2px;
  padding: 2px;
  display: inline-flex;
  background: var(--dsw-alias-fill-base, #ffffff);
}
.dsh-wf-seg-btn {
  font: inherit;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11.5px;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-wf-seg-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-wf-seg-active {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
  color: var(--dsw-alias-state-business-primary);
  font-weight: 600;
}
.dsh-wf-input {
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-fill-base, #ffffff);
  width: 58px;
  text-align: center;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.dsh-wf-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.dsh-wf-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
}
.dsh-wf-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.dsh-wf-toggle-track {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--dsw-alias-border-l1);
  transition: 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 20px;
}
.dsh-wf-toggle input:checked + .dsh-wf-toggle-track {
  background-color: var(--dsw-alias-state-business-primary);
}
.dsh-wf-toggle-thumb {
  position: absolute;
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  transition: 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.18);
}
.dsh-wf-toggle input:checked + .dsh-wf-toggle-track .dsh-wf-toggle-thumb {
  transform: translateX(16px);
}
.dsh-wf-footer {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dsh-wf-saved-hint {
  font-size: 11px;
  color: var(--dsw-alias-state-business-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}
.dsh-wf-btn-reset {
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.12s;
}
.dsh-wf-btn-reset:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
`
  document.head.appendChild(style)
}

export function WorkspaceFilesSettingsCard(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<WorkspaceFilesConfig>(() => loadWorkspaceFilesConfig())
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    ensureSettingsStyle()
  }, [])

  const updateConfig = (patch: Partial<WorkspaceFilesConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    saveWorkspaceFilesConfig(next)
    setSavedTick(true)
    setTimeout(() => setSavedTick(false), 2000)
  }

  const handleDepthSelect = (depth: number) => {
    updateConfig({ maxDepth: depth })
  }

  const handleDepthInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1 && val <= 100) {
      updateConfig({ maxDepth: val })
    }
  }

  const handleToggleHidden = () => {
    updateConfig({ showHidden: !config.showHidden })
  }

  const handleReset = () => {
    const def = { maxDepth: 16, showHidden: false }
    setConfig(def)
    saveWorkspaceFilesConfig(def)
  }

  return (
    <div className={`dsh-wf-card ${open ? 'dsh-wf-card-open' : ''}`}>
      <button
        type="button"
        className="dsh-wf-header"
        onClick={() => setOpen(!open)}
      >
        <FolderGuideGlyph size={22} />
        <div className="dsh-wf-head-text">
          <div className="dsh-wf-name">
            <span>工作区文件树</span>
            <span className="dsh-wf-version">v0.3.2</span>
          </div>
          <div className="dsh-wf-desc">
            全量项目文件树浏览、即时检索与 @-mention 会话一键引用。
          </div>
        </div>
        <span className={`dsh-wf-chevron ${open ? 'dsh-wf-chevron-open' : ''}`}>
          <IconChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.16s' }} />
        </span>
      </button>

      {open && (
        <div className="dsh-wf-body">
          <div className="dsh-wf-row">
            <div className="dsh-wf-label-box">
              <span className="dsh-wf-label">扫描最大深度 (层级)</span>
              <span className="dsh-wf-hint">
                控制文件树深入遍历的最大文件夹嵌套层级，防止庞大项目深度过大产生卡顿。
              </span>
            </div>
            <div className="dsh-wf-ctrl">
              <div className="dsh-wf-seg">
                {[8, 16, 24, 32].map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`dsh-wf-seg-btn ${config.maxDepth === d ? 'dsh-wf-seg-active' : ''}`}
                    onClick={() => handleDepthSelect(d)}
                  >
                    {d} 层
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={100}
                className="dsh-wf-input"
                value={config.maxDepth}
                onChange={handleDepthInput}
                title="手动输入层级深度 (1-100)"
              />
            </div>
          </div>

          <div className="dsh-wf-row">
            <div className="dsh-wf-label-box">
              <span className="dsh-wf-label">显示以点开头的隐藏文件</span>
              <span className="dsh-wf-hint">
                开启后，文件树中将展现如 .env, .editorconfig 等以点开头的配置文件（.git 等缓存黑名单除外）。
              </span>
            </div>
            <div className="dsh-wf-ctrl">
              <label className="dsh-wf-toggle">
                <input
                  type="checkbox"
                  checked={config.showHidden}
                  onChange={handleToggleHidden}
                />
                <span className="dsh-wf-toggle-track">
                  <span className="dsh-wf-toggle-thumb" />
                </span>
              </label>
            </div>
          </div>

          <div className="dsh-wf-footer">
            <div>
              {savedTick && (
                <span className="dsh-wf-saved-hint">
                  <IconCheck size={12} />
                  配置已自动保存并实时同步
                </span>
              )}
            </div>
            <button
              type="button"
              className="dsh-wf-btn-reset"
              onClick={handleReset}
            >
              恢复默认
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── High-Performance Flattened Visible Row Model ── */
export interface VisibleFlatRow {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly depth: number
  readonly isExpanded: boolean
  readonly hasChildren: boolean
  readonly childCount: number
  readonly size?: number
  readonly item: FileItem
}

/**
 * 线性遍历计算可视行。未展开目录的子节点绝不遍历，彻底解决 DOM 节点爆炸问题。
 */
function flattenVisibleTree(
  items: FileItem[],
  expandedPaths: Set<string>,
  depth = 0,
  out: VisibleFlatRow[] = [],
): VisibleFlatRow[] {
  for (const it of items) {
    const isDir = it.isDirectory
    const hasChildren = isDir && Array.isArray(it.children) && it.children.length > 0
    const isExpanded = isDir && expandedPaths.has(it.path)
    const childCount = hasChildren ? it.children!.length : 0

    out.push({
      id: it.path,
      name: it.name,
      path: it.path,
      isDirectory: isDir,
      depth,
      isExpanded,
      hasChildren,
      childCount,
      size: it.size,
      item: it,
    })

    if (isDir && isExpanded && hasChildren) {
      flattenVisibleTree(it.children!, expandedPaths, depth + 1, out)
    }
  }
  return out
}

/**
 * 树形过滤模式：仅保留包含匹配项的分支并保持展开
 */
function filterTreeWithAutoExpand(
  nodes: FileItem[],
  q: string,
): { filteredItems: FileItem[]; autoExpandPaths: Set<string> } {
  const autoExpand = new Set<string>()

  function filterNode(node: FileItem): FileItem | null {
    const matchSelf = node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)
    if (node.isDirectory) {
      const children: FileItem[] = []
      for (const child of node.children || []) {
        const c = filterNode(child)
        if (c) children.push(c)
      }
      if (matchSelf || children.length > 0) {
        autoExpand.add(node.path)
        return { ...node, children }
      }
      return null
    }
    return matchSelf ? node : null
  }

  const result: FileItem[] = []
  for (const it of nodes) {
    const f = filterNode(it)
    if (f) result.push(f)
  }

  return { filteredItems: result, autoExpandPaths: autoExpand }
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
  const [inputQuery, setInputQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const [activeConfig, setActiveConfig] = useState<WorkspaceFilesConfig>(() => loadWorkspaceFilesConfig())
  const [showHidden, setShowHidden] = useState(() => loadWorkspaceFilesConfig().showHidden)
  const [searchViewMode, setSearchViewMode] = useState<'flat' | 'tree'>('flat')

  // 使用 React 并发特性分离高频打字与重度树过滤
  const deferredQuery = useDeferredValue(inputQuery.trim().toLowerCase())

  const toastTimer = useRef<number | null>(null)

  const showToastMsg = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }, [])

  useEffect(() => {
    ensureFilesStyle()
  }, [])

  useEffect(() => {
    const handleCfgChange = (e: any) => {
      if (e.detail) {
        setActiveConfig(e.detail)
        setShowHidden(Boolean(e.detail.showHidden))
      }
    }
    window.addEventListener('dsh-workspace-files:config-change', handleCfgChange)
    return () => window.removeEventListener('dsh-workspace-files:config-change', handleCfgChange)
  }, [])

  const loadTree = useCallback(async (quiet = false, forceRefresh = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const res = await call<WorkspaceFilesResult>('files.tree', {
        sessionId,
        cwd,
        showHidden,
        maxDepth: activeConfig.maxDepth,
        forceRefresh,
      })
      setData(res)

      setExpandedPaths(prev => {
        if (prev.size > 0) return prev
        const stored = loadStoredExpandedPaths(res.root || cwd)
        if (stored !== null) return stored
        return new Set<string>()
      })
    } catch (err: any) {
      setError(err?.message || '无法加载文件列表')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [sessionId, cwd, showHidden, activeConfig.maxDepth])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      saveStoredExpandedPaths(data?.root || cwd, next)
      return next
    })
  }, [data?.root, cwd])

  const handleExpandAll = useCallback(() => {
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
  }, [data, cwd])

  const handleCollapseAll = useCallback(() => {
    const empty = new Set<string>()
    setExpandedPaths(empty)
    saveStoredExpandedPaths(data?.root || cwd, empty)
  }, [data?.root, cwd])

  // 搜索时点击文件夹：跳回树形视图并展开该目录及全部祖先路径，平滑定位
  const handleJumpToFolderInTree = useCallback((dirPath: string) => {
    const parts = dirPath.split('/')
    const toExpand: string[] = []
    let acc = ''
    for (const p of parts) {
      if (!p) continue
      acc = acc ? `${acc}/${p}` : p
      toExpand.push(acc)
    }

    setExpandedPaths(prev => {
      const next = new Set(prev)
      for (const p of toExpand) {
        next.add(p)
      }
      saveStoredExpandedPaths(data?.root || cwd, next)
      return next
    })

    setInputQuery('')
    showToastMsg(`已定位并展开目录: ${dirPath}/`)

    setTimeout(() => {
      try {
        const el = document.querySelector(`[data-tree-path="${dirPath}"]`)
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      } catch {}
    }, 60)
  }, [data?.root, cwd, showToastMsg])

  const handleCopyPath = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(path).then(() => {
      showToastMsg(`已复制路径: ${path}`)
    })
  }, [showToastMsg])

  const handleMention = useCallback((e: React.MouseEvent, itemOrPath: string | FileItem) => {
    e.stopPropagation()
    const itemObj: FileItem = typeof itemOrPath === 'string'
      ? { name: itemOrPath.split('/').pop() || itemOrPath, path: itemOrPath, isDirectory: false }
      : itemOrPath

    const mentionText = formatMentionText(itemObj.path, itemObj.isDirectory)

    let inserted = false
    try {
      inserted = tryInsertNativeReferenceChip(globalCtx, sessionId, itemObj)
    } catch {}

    if (!inserted) {
      try {
        inserted = insertMentionToComposer(mentionText)
      } catch {}
    }

    const displayName = itemObj.isDirectory ? `${itemObj.name}/` : itemObj.name
    void navigator.clipboard.writeText(mentionText.trim()).then(() => {
      if (inserted) {
        showToastMsg(`已引用${itemObj.isDirectory ? '目录' : '文件'}: ${displayName}`)
      } else {
        showToastMsg(`已复制引用: ${mentionText.trim()}`)
      }
    })
  }, [sessionId, showToastMsg])

  const handleRevealInExplorer = useCallback((e: React.MouseEvent, item: FileItem) => {
    e.stopPropagation()
    fetch('/dsh-workspace-files/api/files.open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'reveal',
        path: item.path,
        isDirectory: Boolean(item.isDirectory),
        sessionId,
        cwd,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          showToastMsg(`已在资源管理器中显示: ${item.name}`)
        } else {
          showToastMsg(`打开失败: ${data.error?.message || '未知错误'}`)
        }
      })
      .catch(err => {
        showToastMsg(`请求失败: ${err?.message || String(err)}`)
      })
  }, [sessionId, cwd, showToastMsg])

  const handleOpenDefaultApp = useCallback((e: React.MouseEvent, item: FileItem) => {
    e.stopPropagation()
    fetch('/dsh-workspace-files/api/files.open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'openDefault',
        path: item.path,
        isDirectory: Boolean(item.isDirectory),
        sessionId,
        cwd,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          showToastMsg(`已启动系统应用打开: ${item.name}`)
        } else {
          showToastMsg(`打开失败: ${data.error?.message || '未知错误'}`)
        }
      })
      .catch(err => {
        showToastMsg(`请求失败: ${err?.message || String(err)}`)
      })
  }, [sessionId, cwd, showToastMsg])

  const isSearchActive = Boolean(deferredQuery)

  // 1. 扁平搜索结果计算（限定前 150 项，秒速完成）
  const flatSearchResults = useMemo(() => {
    if (!data || !isSearchActive) return []
    const results: Array<{ item: FileItem; parentDir: string }> = []
    function traverse(items: FileItem[], parentDir: string) {
      for (const it of items) {
        if (it.name.toLowerCase().includes(deferredQuery) || it.path.toLowerCase().includes(deferredQuery)) {
          results.push({ item: it, parentDir })
          if (results.length >= 300) return
        }
        if (it.isDirectory && it.children) {
          traverse(it.children, it.path)
          if (results.length >= 300) return
        }
      }
    }
    traverse(data.items, '')
    return results
  }, [data, deferredQuery, isSearchActive])

  // 2. 扁平可见行计算（常规树与搜索树），O(N_visible) 极速生成
  const visibleFlatRows = useMemo(() => {
    if (!data) return []
    if (!isSearchActive) {
      return flattenVisibleTree(data.items, expandedPaths)
    }

    // 搜索树模式
    const { filteredItems, autoExpandPaths } = filterTreeWithAutoExpand(data.items, deferredQuery)
    return flattenVisibleTree(filteredItems, autoExpandPaths)
  }, [data, isSearchActive, deferredQuery, expandedPaths])

  return (
    <div className="dsh-files-root">
      {/* 1. Header Banner */}
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

      {/* 2. Search Toolbar (Clean Elevated Input + Motion Action Pills) */}
      <div className="dsh-files-toolbar">
        <div className="dsh-files-search-wrap">
          <span className="dsh-files-search-icon"><IconSearch size={13} /></span>
          <input
            type="text"
            className="dsh-files-search-input"
            placeholder="搜索文件或路径 (Esc 清空)..."
            value={inputQuery}
            onChange={e => setInputQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setInputQuery('')
            }}
          />
          {inputQuery && (
            <button
              type="button"
              className="dsh-files-clear-btn"
              onClick={() => setInputQuery('')}
              title="清空搜索"
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
              title={searchViewMode === 'flat' ? '切为树形匹配视图' : '切为扁平列表视图'}
            >
              {searchViewMode === 'flat' ? <IconTree size={13} /> : <IconList size={13} />}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="dsh-files-tool-btn"
                onClick={handleExpandAll}
                title="展开全部目录"
              >
                <IconExpandAll size={13} />
              </button>
              <button
                type="button"
                className="dsh-files-tool-btn"
                onClick={handleCollapseAll}
                title="折叠全部目录"
              >
                <IconCollapseAll size={13} />
              </button>
            </>
          )}

          <button
            type="button"
            className={`dsh-files-tool-btn ${showHidden ? 'is-active' : ''}`}
            onClick={() => setShowHidden(!showHidden)}
            title={showHidden ? '隐藏以点开头的文件' : '显示以点开头的文件'}
          >
            <span style={{ fontSize: 10.5, fontWeight: 700 }}>.*</span>
          </button>
          <button
            type="button"
            className="dsh-files-tool-btn"
            onClick={() => void loadTree(false, true)}
            disabled={loading}
            title="刷新文件树"
          >
            <IconRefresh size={13} />
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="dsh-files-banner-error">
          <span>{error}</span>
          <button type="button" className="dsh-files-banner-close" onClick={() => setError(null)}>
            <IconClose size={12} />
          </button>
        </div>
      )}

      {/* 3. High-Performance Virtualized-Ready Content */}
      <div className="dsh-files-body">
        {loading && !data ? (
          <div className="dsh-files-centered">
            <div className="dsh-files-spinner" />
            <span>正在索引工作区文件…</span>
          </div>
        ) : isSearchActive && flatSearchResults.length === 0 ? (
          <div className="dsh-files-empty">
            <div className="dsh-files-empty-icon"><IconFolder size={28} /></div>
            <div className="dsh-files-empty-title">未匹配到相关文件</div>
            <div className="dsh-files-empty-detail">请尝试更换关键字或按 Esc 恢复完整目录树。</div>
          </div>
        ) : !isSearchActive && (!data || data.items.length === 0) ? (
          <div className="dsh-files-empty">
            <div className="dsh-files-empty-icon"><IconFolder size={28} /></div>
            <div className="dsh-files-empty-title">工作区为空</div>
            <div className="dsh-files-empty-detail">当前工作目录下暂无可展示的文件。</div>
          </div>
        ) : isSearchActive && searchViewMode === 'flat' ? (
          /* ── 扁平搜索结果列表 ── */
          <div className="dsh-files-search-container">
            <div className="dsh-files-search-header">
              <span className="dsh-files-search-count">
                找到 {flatSearchResults.length} 个匹配项
                {flatSearchResults.length > 150 ? '（已展示前 150 项）' : ''}
              </span>
              <button
                type="button"
                className="dsh-files-view-toggle-btn"
                onClick={() => setSearchViewMode('tree')}
                title="切换为树形视图"
              >
                <IconTree size={12} />
                <span>切为树形</span>
              </button>
            </div>
            <div className="dsh-files-flat-list">
              {flatSearchResults.slice(0, 150).map(({ item, parentDir }) => (
                <div
                  key={item.path}
                  className={`dsh-files-flat-row ${item.isDirectory ? 'is-directory' : ''}`}
                  onClick={() => {
                    if (item.isDirectory) {
                      handleJumpToFolderInTree(item.path)
                    } else {
                      onOpenFile(item.path)
                    }
                  }}
                  title={item.isDirectory ? `点击定位并展开目录: ${item.path}/` : `点击预览打开: ${item.path}`}
                >
                  <span className="dsh-files-flat-icon">
                    {item.isDirectory ? <IconFolder size={14} /> : <FileGlyphIcon filename={item.name} size={14} />}
                  </span>
                  <div className="dsh-files-flat-info">
                    <div className="dsh-files-flat-top">
                      <span className="dsh-files-flat-name">
                        <HighlightText text={item.name} query={deferredQuery} />
                        {item.isDirectory && '/'}
                      </span>
                      {item.size !== undefined && (
                        <span className="dsh-files-size">{formatFileSize(item.size)}</span>
                      )}
                      {item.isDirectory && (
                        <span className="dsh-files-jump-hint">跳回展开 ›</span>
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
                      title={`@ 引用${item.isDirectory ? '目录' : '文件'}到会话`}
                    >
                      <IconAt size={12} />
                      <span className="dsh-files-action-at-text">@引用</span>
                    </button>
                    <button
                      type="button"
                      className="dsh-files-action-btn"
                      onClick={e => handleRevealInExplorer(e, item)}
                      title="在文件资源管理器中显示"
                    >
                      <IconExplorer size={12} />
                    </button>
                    <button
                      type="button"
                      className="dsh-files-action-btn"
                      onClick={e => handleOpenDefaultApp(e, item)}
                      title="用系统默认应用打开"
                    >
                      <IconExternalApp size={12} />
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
          /* ── 扁平单层映射可视树（高帧率 0 递归开销） ── */
          <div className="dsh-files-tree">
            {isSearchActive && (
              <div className="dsh-files-search-header">
                <span className="dsh-files-search-count">树形匹配（共 {visibleFlatRows.length} 项）</span>
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
            {visibleFlatRows.map(row => (
              <FileTreeRow
                key={row.id}
                row={row}
                query={deferredQuery}
                onToggleExpand={handleToggleExpand}
                onOpenFile={onOpenFile}
                onMention={handleMention}
                onRevealInExplorer={handleRevealInExplorer}
                onOpenDefaultApp={handleOpenDefaultApp}
                onCopyPath={handleCopyPath}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Animated Toast */}
      {toast && (
        <div className="dsh-files-toast">
          <IconCheck size={12} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}

/* ── Memoized Flat Tree Row Component ── */
interface FileTreeRowProps {
  row: VisibleFlatRow
  query: string
  onToggleExpand: (path: string) => void
  onOpenFile: (path: string) => void
  onMention: (e: React.MouseEvent, item: FileItem) => void
  onRevealInExplorer: (e: React.MouseEvent, item: FileItem) => void
  onOpenDefaultApp: (e: React.MouseEvent, item: FileItem) => void
  onCopyPath: (e: React.MouseEvent, path: string) => void
}

const FileTreeRow = memo(function FileTreeRow(props: FileTreeRowProps): JSX.Element {
  const {
    row,
    query,
    onToggleExpand,
    onOpenFile,
    onMention,
    onRevealInExplorer,
    onOpenDefaultApp,
    onCopyPath,
  } = props

  const indentPx = row.depth * 14 + 8

  if (row.isDirectory) {
    return (
      <div
        className="dsh-files-dir-row"
        data-tree-path={row.path}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={() => onToggleExpand(row.path)}
      >
        <span className={`dsh-files-chevron-wrap ${row.isExpanded ? 'is-expanded' : ''}`}>
          <IconChevronRight size={11} />
        </span>
        <span className="dsh-files-folder-icon">
          <IconFolder size={14} open={row.isExpanded} />
        </span>
        <span className="dsh-files-folder-name" title={row.path}>
          <HighlightText text={row.name} query={query} />
        </span>
        <span className="dsh-files-count-badge">{row.childCount}</span>

        <div className="dsh-files-row-actions">
          <button
            type="button"
            className="dsh-files-action-btn dsh-files-action-at"
            onClick={e => onMention(e, row.item)}
            title="一键 @ 引用此目录到会话"
          >
            <IconAt size={12} />
            <span className="dsh-files-action-at-text">@引用</span>
          </button>
          <button
            type="button"
            className="dsh-files-action-btn"
            onClick={e => onRevealInExplorer(e, row.item)}
            title="在文件资源管理器中打开此目录"
          >
            <IconExplorer size={12} />
          </button>
          <button
            type="button"
            className="dsh-files-action-btn"
            onClick={e => onOpenDefaultApp(e, row.item)}
            title="用系统默认应用打开此目录"
          >
            <IconExternalApp size={12} />
          </button>
          <button
            type="button"
            className="dsh-files-action-btn"
            onClick={e => onCopyPath(e, row.path)}
            title="复制目录路径"
          >
            <IconCopy size={12} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="dsh-files-row"
      data-tree-path={row.path}
      style={{ paddingLeft: `${indentPx}px` }}
      onClick={() => onOpenFile(row.path)}
      title={`点击打开文件: ${row.path}`}
    >
      <span className="dsh-files-file-glyph">
        <FileGlyphIcon filename={row.name} size={14} />
      </span>
      <span className="dsh-files-name">
        <HighlightText text={row.name} query={query} />
      </span>

      {row.size !== undefined && (
        <span className="dsh-files-size" title={`大小: ${row.size} 字节`}>
          {formatFileSize(row.size)}
        </span>
      )}

      <div className="dsh-files-row-actions">
        <button
          type="button"
          className="dsh-files-action-btn dsh-files-action-at"
          onClick={e => onMention(e, row.item)}
          title="一键 @ 引用此文件到会话"
        >
          <IconAt size={12} />
          <span className="dsh-files-action-at-text">@引用</span>
        </button>
        <button
          type="button"
          className="dsh-files-action-btn"
          onClick={e => onRevealInExplorer(e, row.item)}
          title="在文件资源管理器中定位"
        >
          <IconExplorer size={12} />
        </button>
        <button
          type="button"
          className="dsh-files-action-btn"
          onClick={e => onOpenDefaultApp(e, row.item)}
          title="用系统默认应用打开"
        >
          <IconExternalApp size={12} />
        </button>
        <button
          type="button"
          className="dsh-files-action-btn"
          onClick={e => onCopyPath(e, row.path)}
          title="复制相对路径"
        >
          <IconCopy size={12} />
        </button>
      </div>
    </div>
  )
}, (prev, next) => {
  return (
    prev.row.id === next.row.id &&
    prev.row.isExpanded === next.row.isExpanded &&
    prev.row.depth === next.row.depth &&
    prev.row.childCount === next.row.childCount &&
    prev.query === next.query
  )
})

/* ── Helpers ── */
function HighlightText({ text, query }: { text: string; query: string }): JSX.Element {
  if (!query) return <span>{text}</span>
  const index = text.toLowerCase().indexOf(query)
  if (index === -1) return <span>{text}</span>

  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)

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

function findComposerShell(ctx: Context | null, sessionId?: string): any {
  try {
    const composerDom = document.querySelector<HTMLElement>(
      '[data-composer-input="true"], [data-composer-input], [data-composer-card], div[role="textbox"][contenteditable="true"]'
    )
    if (composerDom) {
      const fiberKey = Object.keys(composerDom).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))
      if (fiberKey) {
        let curr = (composerDom as any)[fiberKey]
        let depth = 0
        while (curr && depth < 25) {
          const p = curr.memoizedProps
          if (p) {
            if (p.keyboard && typeof p.keyboard.insertReference === 'function') {
              return p.keyboard
            }
            if (p.shell && typeof p.shell.insertReference === 'function') {
              return p.shell
            }
          }
          curr = curr.return
          depth++
        }
      }
    }
  } catch {}

  if (ctx) {
    try {
      const root: any = (ctx as any).root || ctx
      const conversation = root.conversation || root.get?.('conversation') || (window as any).__dsh_conversation
      const inputService = conversation?.input || root['conversation.input'] || root.get?.('conversation.input')
      if (inputService) {
        if (sessionId) {
          const s = inputService.shell?.(sessionId) || inputService.shells?.get?.(sessionId)
          if (s) return s
        }
        if (inputService.shells instanceof Map && inputService.shells.size > 0) {
          const values = Array.from(inputService.shells.values())
          return values[values.length - 1]
        }
      }
    } catch {}
  }

  return null
}

function tryInsertNativeReferenceChip(ctx: Context | null, sessionId: string | undefined, item: FileItem): boolean {
  if (typeof document === 'undefined') return false
  try {
    const composerDom = document.querySelector<HTMLElement>(
      '[data-composer-input="true"], [data-composer-input], [data-composer-card] [contenteditable="true"], div[role="textbox"][contenteditable="true"]'
    )
    if (composerDom) composerDom.focus()

    const shell = findComposerShell(ctx, sessionId)
    if (!shell) return false

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
    let caret = typeof shell.projection?.caret === 'number' ? shell.projection.caret : text.length
    let start = caret
    const end = caret

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

    const actx = shell.deps?.actx
    if (actx && typeof actx.bail === 'function') {
      const ok = actx.bail(actx, 'slash/input-insert-reference', { reference, span })
      if (ok === true) return true
    }
  } catch {}
  return false
}

function insertMentionToComposer(mentionText: string): boolean {
  if (typeof document === 'undefined') return false

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
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      } else {
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

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    let start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const prev = target.value

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
    throw new Error('网络请求失败：无法连接到文件服务')
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

/* ── Singleton Dynamic CSS Injection (Zero React re-evaluation) ── */
function ensureFilesStyle() {
  if (typeof document === 'undefined') return
  const id = 'dsh-workspace-files-core-style'
  if (document.getElementById(id)) return

  const style = document.createElement('style')
  style.id = id
  style.textContent = `
.dsh-files-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--dsw-alias-fill-base, #ffffff);
  color: var(--dsw-alias-label-primary);
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
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-fill-base, #ffffff);
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
  color: var(--dsw-alias-label-primary);
}
.dsh-files-stats-badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  padding: 1px 7px;
  border-radius: 99px;
}
.dsh-files-root-path {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

/* ── Toolbar & Pure White Input ── */
.dsh-files-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-fill-base, #ffffff);
  flex-shrink: 0;
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
  left: 8px;
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
  display: flex;
}
.dsh-files-search-input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 24px 0 28px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-fill-base, #ffffff);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.dsh-files-search-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-fill-base, #ffffff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.dsh-files-clear-btn {
  position: absolute;
  right: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  padding: 2px;
  display: flex;
  border-radius: 50%;
  transition: all 0.12s ease;
}
.dsh-files-clear-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-files-toolbar-btns {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.dsh-files-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--dsw-radius-xs, 4px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-files-tool-btn:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-files-tool-btn:active:not(:disabled) {
  transform: scale(0.94);
}
.dsh-files-tool-btn.is-active {
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
}
.dsh-files-tool-btn:disabled {
  opacity: 0.35;
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

/* ── Directory Row (with Motion Chevron) ── */
.dsh-files-dir-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding-right: 8px;
  cursor: pointer;
  user-select: none;
  position: relative;
  color: var(--dsw-alias-label-primary);
  border-radius: var(--dsw-radius-xs, 4px);
  margin: 0 4px;
  transition: background 0.12s ease;
}
.dsh-files-dir-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-files-chevron-wrap {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}
.dsh-files-chevron-wrap.is-expanded {
  transform: rotate(90deg);
}
.dsh-files-folder-icon {
  display: flex;
  flex-shrink: 0;
}
.dsh-files-folder-name {
  flex: 1;
  min-width: 0;
  font-weight: 550;
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
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  color: var(--dsw-alias-label-tertiary);
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
  border-radius: var(--dsw-radius-xs, 4px);
  margin: 0 4px;
  transition: background 0.12s ease;
}
.dsh-files-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-files-file-glyph {
  margin-left: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsh-files-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-files-size {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
  flex-shrink: 0;
  margin-right: 4px;
}

/* ── Micro-Interaction Hover Action Pills ── */
.dsh-files-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(4px);
  pointer-events: none;
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  margin-left: auto;
}
.dsh-files-row:hover .dsh-files-row-actions,
.dsh-files-dir-row:hover .dsh-files-row-actions,
.dsh-files-flat-row:hover .dsh-files-row-actions {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.dsh-files-row:hover .dsh-files-size,
.dsh-files-dir-row:hover .dsh-files-count-badge,
.dsh-files-flat-row:hover .dsh-files-size {
  display: none;
}
.dsh-files-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 20px;
  padding: 0 5px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-xs, 3px);
  background: var(--dsw-alias-fill-base, #ffffff);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-files-action-btn:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-files-action-btn:active {
  transform: scale(0.92);
}
.dsh-files-action-at {
  color: var(--dsw-alias-state-business-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
}
.dsh-files-action-at:hover {
  color: var(--dsw-alias-label-primary-inverted, #ffffff);
  background: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-files-action-at-text {
  font-size: 10px;
  font-weight: 600;
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
  color: var(--dsw-alias-label-tertiary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 4%, transparent);
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-files-search-count {
  font-weight: 500;
}
.dsh-files-view-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-fill-base, #ffffff);
  color: var(--dsw-alias-state-business-primary);
  cursor: pointer;
  font-size: 10.5px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: var(--dsw-radius-xs, 4px);
  transition: all 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-files-view-toggle-btn:hover {
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-primary-inverted, #ffffff);
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-files-flat-list {
  padding: 4px 0;
}
.dsh-files-flat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  cursor: pointer;
  user-select: none;
  position: relative;
  transition: background 0.12s ease;
  min-height: 32px;
}
.dsh-files-flat-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
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
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-files-flat-parent {
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-files-jump-hint {
  font-size: 10px;
  color: var(--dsw-alias-state-business-primary);
  opacity: 0;
  transition: opacity 0.12s ease;
  margin-right: 6px;
  font-weight: 500;
  white-space: nowrap;
}
.dsh-files-flat-row:hover .dsh-files-jump-hint {
  opacity: 0.9;
}
.dsh-files-flat-row.is-directory:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
}

/* ── Highlight & Toast ── */
.dsh-files-highlight {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent);
  color: var(--dsw-alias-state-business-primary);
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
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-fill-base, #ffffff);
  font-size: 11px;
  border-radius: 99px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.22);
  animation: dsh-files-fade-in 0.16s cubic-bezier(0.16, 1, 0.3, 1);
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
  color: var(--dsw-alias-label-secondary);
}
.dsh-files-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--dsw-alias-border-l1);
  border-top-color: var(--dsw-alias-state-business-primary);
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
  color: var(--dsw-alias-label-secondary);
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
  color: var(--dsw-alias-label-tertiary);
}
.dsh-files-banner-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  font-size: 11.5px;
  color: var(--dsw-alias-state-danger-primary, #e34c59);
  background: color-mix(in srgb, var(--dsw-alias-state-danger-primary, #e34c59) 10%, transparent);
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
}
.dsh-files-banner-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
`
  document.head.appendChild(style)
}
