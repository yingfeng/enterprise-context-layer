import { extractHeadings } from '../lib/markdown'

interface Props {
  markdown: string
  onNavigate?: (id: string) => void
}

export default function OutlinePanel({ markdown, onNavigate }: Props) {
  const headings = extractHeadings(markdown)
  if (headings.length === 0) return null

  return (
    <div className="outline-panel">
      <div className="outline-hdr">Outline</div>
      {headings.map(h => (
        <div key={h.id}
          className="outline-item"
          style={{ paddingLeft: (h.level - 1) * 16 + 12 }}
          onClick={() => { if (onNavigate) onNavigate(h.id) }}>
          {h.text}
        </div>
      ))}
    </div>
  )
}
