import type { JSX } from 'react'

export function IconFolder({ size = 15, open = false }: { size?: number; open?: boolean }): JSX.Element {
  if (open) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, color: 'var(--dsw-alias-brand-primary, #4b70e2)' }}>
        <path d="M1.5 3.5A1.5 1.5 0 013 2h3l1.5 2H13a1.5 1.5 0 011.5 1.5v1H2.5l-1 7.5A1.5 1.5 0 003 15h10.5a1.5 1.5 0 001.5-1.5L14 6.5H2.5" fill="currentColor" fillOpacity="0.18" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, color: 'var(--dsw-alias-brand-primary, #4b70e2)' }}>
      <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
    </svg>
  )
}

export function IconSearch({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="14.5" y2="14.5" />
    </svg>
  )
}

export function IconAt({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M8 1a7 7 0 106.914 8.093.75.75 0 00-1.488-.186A5.5 5.5 0 1113.5 8c0 .64-.207 1.2-.6 1.597-.39.395-.94.653-1.65.653-.61 0-1.156-.25-1.5-.67-.344.42-.89.67-1.5.67A2.25 2.25 0 016 8a2.25 2.25 0 012.25-2.25c.61 0 1.156.25 1.5.67.344-.42.89-.67 1.5-.67.71 0 1.26.258 1.65.653.393.397.6 1.057.6 1.847A7.001 7.001 0 018 1zm0 5.75A1.25 1.25 0 108 9.25 1.25 1.25 0 008 6.75z" />
    </svg>
  )
}

export function IconCopy({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
    </svg>
  )
}

export function IconExpandAll({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 2 8 6 12 2" />
      <polyline points="4 8 8 12 12 8" />
    </svg>
  )
}

export function IconCollapseAll({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 6 8 2 12 6" />
      <polyline points="4 12 8 8 12 8" />
    </svg>
  )
}

export function IconRefresh({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M8 2.5a5.5 5.5 0 105.006 3.238.75.75 0 011.378-.592A7 7 0 118 1v1.5a.75.75 0 01-1.28.53L4.47 1.28a.75.75 0 010-1.06l2.25-1.75A.75.75 0 018-.75V1a7 7 0 010 1.5z" />
    </svg>
  )
}

export function IconClose({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  )
}

export function IconCheck({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
    </svg>
  )
}

export function FileGlyphIcon({ filename, size = 14 }: { filename: string; size?: number }): JSX.Element {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  // Color tokens
  let color = 'var(--dsw-alias-label-tertiary, #8c9ba5)'
  let badge = ''

  if (ext === 'ts' || ext === 'tsx') {
    color = '#3178c6'
    badge = ext === 'tsx' ? 'TSX' : 'TS'
  } else if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    color = '#f7df1e'
    badge = 'JS'
  } else if (ext === 'json') {
    color = '#cbcb41'
    badge = '{}'
  } else if (ext === 'md' || ext === 'markdown') {
    color = '#42a5f5'
    badge = 'M↓'
  } else if (ext === 'drawio' || ext === 'dio') {
    color = '#f08705'
    badge = 'D'
  } else if (ext === 'css' || ext === 'scss' || ext === 'less') {
    color = '#42a5f5'
    badge = '#'
  } else if (ext === 'html' || ext === 'htm') {
    color = '#e44d26'
    badge = '<>'
  } else if (ext === 'py') {
    color = '#3776ab'
    badge = 'PY'
  } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'svg' || ext === 'gif' || ext === 'webp') {
    color = '#26a69a'
    badge = 'IMG'
  } else if (ext === 'yml' || ext === 'yaml') {
    color = '#cb171e'
    badge = 'Y'
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: 9,
        fontWeight: 700,
        fontFamily: 'monospace',
        color,
        flexShrink: 0,
      }}
      title={filename}
    >
      {badge || '•'}
    </span>
  )
}
