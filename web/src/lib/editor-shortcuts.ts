import { wrapSelection, toggleLineWrapper } from './markdown'

export interface EditorAction {
  name: string
  label: string
  icon: string
  shortcut?: string
  action: (text: string, selStart: number, selEnd: number) => { text: string; cursor: number } | null
}

export const editorActions: EditorAction[] = [
  { name: 'bold', label: 'Bold', icon: 'B', shortcut: 'Ctrl+B',
    action: (t, s, e) => wrapSelection(t, s, e, { before: '**', after: '**' }) },
  { name: 'italic', label: 'Italic', icon: 'I', shortcut: 'Ctrl+I',
    action: (t, s, e) => wrapSelection(t, s, e, { before: '*', after: '*' }) },
  { name: 'strikethrough', label: 'Strikethrough', icon: 'S̶', shortcut: 'Ctrl+Shift+S',
    action: (t, s, e) => wrapSelection(t, s, e, { before: '~~', after: '~~' }) },
  { name: 'code', label: 'Inline Code', icon: '<>', shortcut: 'Ctrl+E',
    action: (t, s, e) => wrapSelection(t, s, e, { before: '`', after: '`' }) },
  { name: 'link', label: 'Link', icon: '🔗', shortcut: 'Ctrl+K',
    action: (t, s, e) => {
      const sel = t.slice(s, e) || 'url'
      return wrapSelection(t, s, e, { before: '[', after: `](${sel === 'url' ? '' : sel})`, placeholder: 'text' })
    }},
  { name: 'heading', label: 'Heading', icon: 'H',
    action: (t, s, e) => toggleLineWrapper(t, s, e, '## ') },
  { name: 'list', label: 'List', icon: '•',
    action: (t, s, e) => toggleLineWrapper(t, s, e, '- ') },
  { name: 'quote', label: 'Quote', icon: '❝',
    action: (t, s, e) => toggleLineWrapper(t, s, e, '> ') },
  { name: 'codeblock', label: 'Code Block', icon: '📄',
    action: (t, s, e) => {
      const sel = t.slice(s, e) || ''
      const block = sel ? `\`\`\`\n${sel}\n\`\`\`` : '```\n\n```'
      return { text: t.slice(0, s) + block + t.slice(e), cursor: s + block.length }
    }},
]

export function handleEditorKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  text: string,
  selStart: number,
  selEnd: number,
  onChange: (text: string) => void,
  undo: () => void,
  redo: () => void
): boolean {
  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo(); else undo()
    return true
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault(); redo(); return true
  }
  // Shortcuts
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); apply(0); return true }
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); apply(1); return true }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') { e.preventDefault(); apply(2); return true }
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); apply(3); return true }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); apply(4); return true }
  // Tab
  if (e.key === 'Tab') {
    e.preventDefault()
    onChange(text.slice(0, selStart) + '  ' + text.slice(selStart))
    return true
  }
  return false

  function apply(idx: number) {
    const result = editorActions[idx].action(text, selStart, selEnd)
    if (result) onChange(result.text)
  }
}
