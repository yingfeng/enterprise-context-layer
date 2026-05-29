import { useRef, useState, useEffect } from 'react'
import { renderMarkdown, applyQuickConversion } from '../lib/markdown'
import { editorActions, handleEditorKeyDown } from '../lib/editor-shortcuts'
import FloatingToolbar from './FloatingToolbar'
import SlashMenu from './SlashMenu'
import OutlinePanel from './OutlinePanel'

interface Props {
  content: string
  onChange: (content: string) => void
  readOnly?: boolean
  fileName?: string
}

export default function MarkdownEditor({ content, onChange, readOnly, fileName }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [selStart, setSelStart] = useState(0)
  const [selEnd, setSelEnd] = useState(0)
  const [floatShow, setFloatShow] = useState(false)
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 })
  const [slashShow, setSlashShow] = useState(false)
  const [slashPos, setSlashPos] = useState({ x: 0, y: 0 })
  const [showOutline, setShowOutline] = useState(true)
  const [docTitle, setDocTitle] = useState('')

  // Undo/Redo using refs to avoid stale closures
  const histRef = useRef<string[]>([])
  const histIdxRef = useRef(-1)
  const skipRef = useRef(false)

  useEffect(() => {
    const m = content.match(/^#\s+(.+)/m)
    setDocTitle(m ? m[1] : '')
  }, [content])

  // Init history on first content
  useEffect(() => {
    if (content && histRef.current.length === 0) {
      histRef.current = [content]
      histIdxRef.current = 0
    }
  }, [])

  function replaceContent(newText: string) {
    onChange(newText)
    // Push to history
    if (skipRef.current) { skipRef.current = false; return }
    const hist = histRef.current
    const idx = histIdxRef.current
    const newHist = hist.slice(0, idx + 1)
    newHist.push(newText)
    if (newHist.length > 100) newHist.shift()
    histRef.current = newHist
    histIdxRef.current = newHist.length - 1
  }

  function undo() {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    skipRef.current = true
    onChange(histRef.current[histIdxRef.current])
  }

  function redo() {
    if (histIdxRef.current >= histRef.current.length - 1) return
    histIdxRef.current++
    skipRef.current = true
    onChange(histRef.current[histIdxRef.current])
  }

  function applyAction(action: typeof editorActions[0]) {
    const ta = taRef.current
    if (!ta || readOnly) return
    const result = action.action(content, ta.selectionStart, ta.selectionEnd)
    if (!result) return
    replaceContent(result.text)
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = result.cursor })
  }

  function updateSel() {
    const ta = taRef.current
    if (!ta) return
    setSelStart(ta.selectionStart)
    setSelEnd(ta.selectionEnd)
    if (ta.selectionStart !== ta.selectionEnd) {
      const rect = ta.getBoundingClientRect()
      const textBefore = ta.value.slice(0, ta.selectionStart)
      const lines = textBefore.split('\n')
      const lineY = rect.top + lines.length * 18
      setFloatPos({ x: rect.left + 80, y: lineY - 50 })
      setFloatShow(true)
    } else {
      setFloatShow(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Quick conversion: # + space -> heading
    if (e.key === ' ') {
      const ta = taRef.current
      if (!ta) return
      const ls = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1
      const linePrefix = ta.value.slice(ls, ta.selectionStart)
      const conv = applyQuickConversion(ta.value, ta.selectionStart, ta.selectionEnd, e.key)
      if (conv) {
        e.preventDefault()
        replaceContent(conv.text)
        requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = conv.cursor })
        return
      }
    }

    // Slash menu: remove the / and show menu
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const ta = taRef.current
      if (!ta) return
      const rect = ta.getBoundingClientRect()
      const lines = ta.value.slice(0, ta.selectionStart).split('\n')
      setSlashPos({ x: rect.left + 30, y: rect.top + lines.length * 18 - 60 })
      setSlashShow(true)
      return  // don't prevent default - let the / be typed
    }
    if (e.key === 'Escape') { setSlashShow(false); setFloatShow(false) }

    // Override: handle keydowns that the SlashMenu needs
    if (slashShow) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()  // Let SlashMenu handle these
      }
    }

    if (handleEditorKeyDown(e, content, selStart, selEnd, replaceContent, undo, redo)) return
  }

  function onSlashSelect(name: string) {
    setSlashShow(false)
    const ta = taRef.current
    if (!ta) return
    const action = editorActions.find(a => a.name === name)
    if (!action) return
    // Remove the just-typed /
    const text = content.slice(0, ta.selectionStart - 1) + content.slice(ta.selectionStart)
    const result = action.action(text, ta.selectionStart - 1, ta.selectionEnd)
    if (!result) return
    replaceContent(result.text)
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = result.cursor })
  }

  return (
    <div className="editor-container">
      {/* Title */}
      <div className="editor-title-row">
        <input className="editor-title" value={docTitle}
          onChange={e => {
            const t = e.target.value
            if (content.startsWith('# ')) replaceContent(content.replace(/^# .+/m, `# ${t}`))
            else replaceContent(`# ${t}\n\n${content}`)
          }}
          placeholder="Untitled" readOnly={readOnly} />
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <div className="editor-toolbar">
          <div className="toolbar-group">
            {editorActions.slice(0, 5).map(a => (
              <button key={a.name} className="toolbar-btn" onClick={() => applyAction(a)}
                title={`${a.label} (${a.shortcut||''})`}>{a.icon}</button>
            ))}
          </div>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            {editorActions.slice(5).map(a => (
              <button key={a.name} className="toolbar-btn" onClick={() => applyAction(a)} title={a.label}>{a.icon}</button>
            ))}
          </div>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={undo} title="Undo Ctrl+Z">↩</button>
          <button className="toolbar-btn" onClick={redo} title="Redo Ctrl+Y">↪</button>
          <div style={{flex:1}} />
          <button className={`toolbar-btn ${showOutline?'active':''}`} onClick={() => setShowOutline(!showOutline)}>☰</button>
        </div>
      )}

      {/* Editor body */}
      <div className="editor-body">
        <div className="editor-pane edit-pane">
          {!readOnly && fileName && <div className="pane-label">Edit — {fileName}</div>}
          <textarea ref={taRef} className="editor-textarea" value={content}
            onChange={e => replaceContent(e.target.value)}
            onSelect={updateSel}
            onClick={() => setFloatShow(false)}
            onKeyDown={onKeyDown}
            readOnly={readOnly}
            placeholder="Start writing..." spellCheck={false} />
        </div>
        <div className="editor-pane preview-pane">
          <div className="pane-label">Preview</div>
          <div className="preview-scroll">
            <div className="preview-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            {showOutline && <OutlinePanel markdown={content} />}
          </div>
        </div>
      </div>

      <FloatingToolbar show={floatShow} x={floatPos.x} y={floatPos.y} onAction={applyAction} />
      <SlashMenu show={slashShow} x={slashPos.x} y={slashPos.y} onSelect={onSlashSelect} onClose={() => setSlashShow(false)} />
    </div>
  )
}
