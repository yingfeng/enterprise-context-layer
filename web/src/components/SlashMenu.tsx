import { useEffect, useState } from 'react'

const items = [
  { name: 'heading', label: 'Heading', icon: 'H', desc: '## Heading' },
  { name: 'bold', label: 'Bold', icon: 'B', desc: '**bold**' },
  { name: 'italic', label: 'Italic', icon: 'I', desc: '*italic*' },
  { name: 'list', label: 'List', icon: '•', desc: '- item' },
  { name: 'quote', label: 'Quote', icon: '❝', desc: '> quote' },
  { name: 'code', label: 'Code', icon: '<>', desc: '`code`' },
  { name: 'codeblock', label: 'Code Block', icon: '📄', desc: '```code```' },
  { name: 'link', label: 'Link', icon: '🔗', desc: '[text](url)' },
  { name: 'strikethrough', label: 'Strikethrough', icon: 'S̶', desc: '~~text~~' },
  { name: 'hr', label: 'Divider', icon: '—', desc: '---' },
]

interface Props {
  show: boolean
  x: number
  y: number
  onSelect: (name: string) => void
  onClose: () => void
}

export default function SlashMenu({ show, x, y, onSelect, onClose }: Props) {
  const [sel, setSel] = useState(0)

  useEffect(() => {
    if (!show) return
    setSel(0)
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, items.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && items[sel]) { e.preventDefault(); onSelect(items[sel].name) }
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [show, sel, onSelect, onClose])

  if (!show) return null

  return (
    <div className="slash-menu" style={{ left: Math.max(4, x), top: Math.max(4, y) }}>
      <div className="slash-items">
        {items.map((item, i) => (
          <div key={item.name} className={`slash-item ${i === sel ? 'active' : ''}`}
            onMouseDown={e => { e.preventDefault(); onSelect(item.name) }}
            onMouseEnter={() => setSel(i)}>
            <span className="slash-icon">{item.icon}</span>
            <span className="slash-label">{item.label}</span>
            <span className="slash-desc">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
