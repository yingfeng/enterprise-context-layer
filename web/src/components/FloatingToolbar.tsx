import { editorActions } from '../lib/editor-shortcuts'

interface Props {
  show: boolean
  x: number
  y: number
  onAction: (action: typeof editorActions[0]) => void
}

export default function FloatingToolbar({ show, x, y, onAction }: Props) {
  if (!show) return null
  return (
    <div className="float-toolbar" style={{ left: Math.max(4, x), top: Math.max(4, y) }}>
      {editorActions.slice(0, 5).map(a => (
        <button key={a.name} className="float-btn" onMouseDown={e => { e.preventDefault(); onAction(a) }} title={a.label}>
          {a.icon}
        </button>
      ))}
    </div>
  )
}
