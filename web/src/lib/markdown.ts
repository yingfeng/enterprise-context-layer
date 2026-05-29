// Self-contained Markdown to HTML renderer
// All parsing is hand-written — no external dependencies

// ─── Syntax Highlighting ───────────────────────────────────────────
const languages: Record<string, string[]> = {
  js: ['const','let','var','function','return','if','else','for','while','class','import','export','from','async','await','new','this','typeof','throw','try','catch','switch','case','break','continue','default','delete','do','in','instanceof','of','super','yield'],
  ts: ['const','let','var','function','return','if','else','for','while','class','import','export','from','async','await','new','this','typeof','interface','type','enum','implements','extends','abstract','private','protected','public','readonly','static'],
  py: ['def','return','if','elif','else','for','while','import','from','class','async','await','with','as','try','except','finally','raise','yield','lambda','pass','None','True','False','break','continue','global','nonlocal','assert','del','elif','except'],
  go: ['func','return','if','else','for','range','import','package','type','struct','interface','map','chan','defer','go','select','case','switch','break','continue','var','const','fallthrough','default'],
  rust: ['fn','let','mut','return','if','else','for','while','loop','match','impl','trait','struct','enum','pub','use','mod','as','where','async','await','ref','move','unsafe','dyn','self','super','crate'],
  json: ['true','false','null'],
  html: ['html','head','body','div','span','p','a','img','ul','ol','li','table','tr','td','th','form','input','button','script','style','link','meta','nav','header','footer','section','article','main','aside','h1','h2','h3','h4','h5','h6'],
  sql: ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AND','OR','NOT','IN','LIKE','BETWEEN','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','AS','NULL','IS','DISTINCT','COUNT','SUM','AVG','MAX','MIN'],
  yaml: ['true','false','null','yes','no','on','off'],
  sh: ['if','then','else','elif','fi','for','while','do','done','case','esac','function','return','exit','echo','export','source','cd','ls','rm','mv','cp','mkdir','chmod','grep','sed','awk','cat','find','xargs','pipe'],
}

// ─── Simple inline TeX renderer ────────────────────────────────────
// Renders basic LaTeX to styled HTML (subset)
function renderLatexInline(expr: string): string {
  let s = expr.trim()
  // Fractions: \frac{a}{b}
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="frac"><span class="frac-n">$1</span><span class="frac-d">$2</span></span>')
  // Greek letters
  const greek: Record<string,string> = {alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ','omicron':'ο',pi:'π',rho:'ρ',sigma:'σ',tau:'τ',upsilon:'υ',phi:'φ',chi:'χ',psi:'ψ',omega:'ω'}
  for (const [cmd,ch] of Object.entries(greek)) {
    s = s.replace(new RegExp(`\\\\${cmd}`, 'g'), ch)
  }
  // Superscript: x^2
  s = s.replace(/\^(\{[^}]+\}|[^^\s]+)/g, '<sup>$1</sup>')
  // Subscript: x_2
  s = s.replace(/_(\{[^}]+\}|[^_\s]+)/g, '<sub>$1</sub>')
  // Sum, integral
  s = s.replace(/\\sum/g, '∑').replace(/\\int/g, '∫').replace(/\\infty/g, '∞')
  s = s.replace(/\\pi/g, 'π').replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
  s = s.replace(/\\rightarrow/g, '→').replace(/\\leftarrow/g, '←').replace(/\\Rightarrow/g, '⇒')
  s = s.replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\\pm/g, '±')
  // Parentheses
  s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
  return s
}

// ─── Simple Mermaid renderer (subset) ─────────────────────────────
function renderMermaid(code: string): string {
  const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('%%')).map(l => l.trim())
  const nodes: Record<string,{text:string;shape:string}> = {}
  const edges: {from:string;to:string;label:string}[] = []
  
  for (const line of lines) {
    if (/^(flowchart|graph)\s+(TD|LR|BT|RL)/i.test(line)) continue
    
    // Strip node decorations to get clean IDs for edge parsing
    const clean = line.replace(/\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\}/g, '')
    
    // Check for edge
    const edgeM = clean.match(/^(\w+)\s*--?>\s*(\w+)/)
    if (edgeM) {
      const from = edgeM[1], to = edgeM[2]
      const label = line.match(/\|([^|]+)\|/)?.[1] || ''
      edges.push({ from, to, label })
    }
    
    // Extract node definition
    const nodeM = line.match(/^(\w+)(\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})/)
    if (nodeM) {
      const id = nodeM[1]
      const text = (nodeM[3]||nodeM[4]||nodeM[5]||id).replace(/['"]/g,'')
      const shape = nodeM[2]?.startsWith('[') ? 'rect' : nodeM[2]?.startsWith('(') ? 'round' : 'rect'
      if (!nodes[id]) nodes[id] = { text, shape }
      // Also add dest node if inline
      if (edgeM) {
        const dest = edgeM[2]
        if (!nodes[dest]) nodes[dest] = { text: dest, shape: 'rect' }
      }
    } else if (!edgeM) {
      // Plain node reference: just "B"
      const plain = line.match(/^(\w+)$/)
      if (plain && !nodes[plain[1]]) nodes[plain[1]] = { text: plain[1], shape: 'rect' }
    }
  }
  
  // Auto-layout - simple grid
  const ids = Object.keys(nodes)
  const positions: Record<string,{x:number;y:number}> = {}
  const cols = 3
  ids.forEach((id, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    positions[id] = { x: 120 + col * 180, y: 40 + row * 100 }
  })
  
  const bg3 = '#16213e', accent = '#4fc3f7', fg = '#e0e0f0', fg2 = '#8899cc'
  const svgNodes: string[] = []
  const svgEdges: string[] = []
  for (const [id, n] of Object.entries(nodes)) {
    const p = positions[id]; if (!p) continue
    if (n.shape === 'rect') svgNodes.push(`<rect x="${p.x-70}" y="${p.y-20}" width="140" height="40" rx="6" fill="${bg3}" stroke="${accent}" stroke-width="2"/>`)
    else svgNodes.push(`<rect x="${p.x-70}" y="${p.y-20}" width="140" height="40" rx="20" fill="${bg3}" stroke="${accent}" stroke-width="2"/>`)
    svgNodes.push(`<text x="${p.x}" y="${p.y+5}" text-anchor="middle" fill="${fg}" font-size="13" font-family="sans-serif">${escapeHtml(n.text)}</text>`)
  }
  for (const e of edges) {
    const fp = positions[e.from], tp = positions[e.to]
    if (!fp || !tp) continue
    const fx = fp.x, fy = fp.y + 20, tx = tp.x, ty = tp.y - 20
    svgEdges.push(`<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${fg2}" stroke-width="2" marker-end="url(#arrow)"/>`)
    if (e.label) svgEdges.push(`<text x="${(fx+tx)/2}" y="${(fy+ty)/2-5}" text-anchor="middle" fill="${fg2}" font-size="11" font-family="sans-serif">${escapeHtml(e.label)}</text>`)
  }
  
  const maxX = ids.length > 0 ? Math.max(...ids.map(id => positions[id]?.x || 0)) + 100 : 400
  const maxY = ids.length > 0 ? Math.max(...ids.map(id => positions[id]?.y || 0)) + 60 : 100
  return `<svg width="${Math.max(maxX,400)}" height="${Math.max(maxY,100)}" viewBox="0 0 ${Math.max(maxX,400)} ${Math.max(maxY,100)}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="${fg2}"/></marker></defs>
    <rect width="100%" height="100%" fill="transparent"/>
    ${svgEdges.join('\n')}
    ${svgNodes.join('\n')}
  </svg>`
}

// ─── Basics ────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function escapeAttr(s: string): string {
  return s.replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function highlightCode(code: string, lang: string): string {
  const keywords = languages[lang.toLowerCase()]
  if (!keywords) return escapeHtml(code)
  const kwSet = new Set(keywords)
  return escapeHtml(code).replace(/\b([a-zA-Z_]\w*)\b/g, m => kwSet.has(m) ? `<span class="hl-kw">${m}</span>` : m)
    .replace(/\/\/.*$/gm, m => `<span class="hl-comment">${m}</span>`)
    .replace(/"([^"]*)"/g, m => `<span class="hl-string">${m}</span>`)
    .replace(/'([^']*)'/g, m => `<span class="hl-string">${m}</span>`)
    .replace(/\b(\d+\.?\d*)\b/g, m => `<span class="hl-num">${m}</span>`)
}

// ─── Block-level parsing ──────────────────────────────────────────
interface Token { type: string; content: string; lang?: string }

function tokenizeBlocks(md: string): Token[] {
  const lines = md.split('\n')
  const tokens: Token[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]; const trimmed = line.trim()
    if (trimmed === '') { i++; continue }

    // Mermaid code block — check by literal string, not regex
    if (line.trimStart().startsWith('```') && line.trimStart().slice(3).trim().toLowerCase() === 'mermaid') {
      const codeLines: string[] = []; i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(lines[i]); i++ }
      i++
      tokens.push({ type: 'mermaid', content: codeLines.join('\n') })
      continue
    }

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const codeLines: string[] = []; i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(lines[i]); i++ }
      i++
      tokens.push({ type: 'code', content: codeLines.join('\n'), lang })
      continue
    }

    // Heading
    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) { tokens.push({ type: `h${hMatch[1].length}`, content: hMatch[2] }); i++; continue }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) { tokens.push({ type: 'hr', content: '' }); i++; continue }

    // Blockquote (including callout)
    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) { quoteLines.push(lines[i].replace(/^>\s?/, '')); i++ }
      tokens.push({ type: 'blockquote', content: quoteLines.join('\n') })
      continue
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^[\s|:|-]+$/.test(lines[i + 1])) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes('|')) { tableLines.push(lines[i]); i++ }
      tokens.push({ type: 'table', content: tableLines.join('\n') })
      continue
    }

    // LaTeX block $$...$$
    if (/^\$\$/.test(trimmed)) {
      const texLines: string[] = []; i++
      while (i < lines.length && !lines[i].trim().startsWith('$$')) { texLines.push(lines[i]); i++ }
      i++
      tokens.push({ type: 'latex-block', content: texLines.join('\n') })
      continue
    }

    // List
    if (/^\s*[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const listLines: string[] = []
      while (i < lines.length) {
        const t = lines[i].trimStart()
        if (/^[-*+]\s+/.test(t) || /^\d+\.\s+/.test(t)) { listLines.push(t); i++ }
        else if (t === '' || t.startsWith('#') || t.startsWith('```') || t.startsWith('$$')) break
        else { i++; break }
      }
      tokens.push({ type: 'list', content: listLines.join('\n') })
      continue
    }

    // Paragraph
    const paraLines: string[] = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (t === '' || t.startsWith('#') || t.startsWith('```') || t.startsWith('$$') || t.startsWith('> ') || /^[-*+]\s+/.test(t) || /^\d+\.\s+/.test(t) || /^\s*[-*_]+\s*$/.test(t)) break
      paraLines.push(lines[i]); i++
    }
    if (paraLines.length > 0) tokens.push({ type: 'p', content: paraLines.join('\n') })
  }
  return tokens
}

// ─── Inline parsing ────────────────────────────────────────────────
function renderInline(text: string): string {
  let result = ''; let pos = 0
  while (pos < text.length) {
    // Image
    if (text.startsWith('![', pos)) {
      const end = text.indexOf(')', pos + 2)
      if (end !== -1) {
        const altEnd = text.indexOf('](', pos + 2)
        if (altEnd !== -1 && altEnd < end) {
          const alt = text.slice(pos + 2, altEnd)
          const urlAndSize = text.slice(altEnd + 2, end)
          const [url, size] = urlAndSize.split(' =')
          const sizeAttr = size ? ` style="max-width:${size}"` : ''
          result += `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy"${sizeAttr} />`
          pos = end + 1; continue
        }
      }
    }
    // Link
    if (text.startsWith('[', pos)) {
      const closeB = text.indexOf(']', pos + 1)
      if (closeB !== -1 && text[closeB + 1] === '(') {
        const endP = text.indexOf(')', closeB + 2)
        if (endP !== -1) {
          result += `<a href="${escapeAttr(text.slice(closeB + 2, endP))}">${renderInline(text.slice(pos + 1, closeB))}</a>`
          pos = endP + 1; continue
        }
      }
    }
    // Inline LaTeX $...$
    if (text[pos] === '$') {
      const end = text.indexOf('$', pos + 1)
      if (end !== -1 && text[pos + 1] !== '$') {
        result += `<span class="inline-tex">${renderLatexInline(text.slice(pos + 1, end))}</span>`
        pos = end + 1; continue
      }
    }
    // Strikethrough
    if (text.startsWith('~~', pos)) {
      const end = text.indexOf('~~', pos + 2)
      if (end !== -1) { result += `<del>${renderInline(text.slice(pos + 2, end))}</del>`; pos = end + 2; continue }
    }
    // Bold **
    if (text.startsWith('**', pos)) {
      const end = text.indexOf('**', pos + 2)
      if (end !== -1) { result += `<strong>${renderInline(text.slice(pos + 2, end))}</strong>`; pos = end + 2; continue }
    }
    // Bold __
    if (text.startsWith('__', pos)) {
      const end = text.indexOf('__', pos + 2)
      if (end !== -1) { result += `<strong>${renderInline(text.slice(pos + 2, end))}</strong>`; pos = end + 2; continue }
    }
    // Italic *
    if (text[pos] === '*' && text[pos + 1] !== '*') {
      const end = text.indexOf('*', pos + 1)
      if (end !== -1 && text[end + 1] !== '*') { result += `<em>${renderInline(text.slice(pos + 1, end))}</em>`; pos = end + 1; continue }
    }
    // Italic _
    if (text[pos] === '_' && text[pos + 1] !== '_') {
      const end = text.indexOf('_', pos + 1)
      if (end !== -1 && text[end + 1] !== '_') { result += `<em>${renderInline(text.slice(pos + 1, end))}</em>`; pos = end + 1; continue }
    }
    // Inline code
    if (text[pos] === '`') {
      const end = text.indexOf('`', pos + 1)
      if (end !== -1) { result += `<code>${escapeHtml(text.slice(pos + 1, end))}</code>`; pos = end + 1; continue }
    }
    // Escape
    if (text[pos] === '<') { result += '&lt;'; pos++ }
    else if (text[pos] === '>') { result += '&gt;'; pos++ }
    else if (text[pos] === '&') { result += '&amp;'; pos++ }
    else { result += text[pos]; pos++ }
  }
  return result
}

// ─── Block renderers ────────────────────────────────────────────────
function renderTable(tableStr: string): string {
  const rows = tableStr.split('\n').filter(Boolean); if (rows.length < 2) return tableStr
  const headerCells = rows[0].split('|').filter(c => c.trim())
  const alignRow = rows[1].split('|').filter(c => c.trim())
  const aligns: ('left'|'center'|'right')[] = alignRow.map(c => {
    const t = c.trim()
    if (t.startsWith(':') && t.endsWith(':')) return 'center'
    if (t.endsWith(':')) return 'right'
    return 'left'
  })
  let html = '<div class="table-wrapper"><table>'
  html += '<thead><tr>' + rows[0].split('|').map((c,i) => {
    const t = c.trim()
    if (!t && (i === 0 || i === rows[0].split('|').length - 1)) return ''
    const ai = i - (rows[0].trimStart().startsWith('|') ? 1 : 0)
    return `<th style="text-align:${aligns[ai]||'left'}">${renderInline(t)}</th>`
  }).join('') + '</tr></thead><tbody>'
  for (let r = 2; r < rows.length; r++) {
    html += '<tr>' + rows[r].split('|').map((c,i) => {
      const t = c.trim()
      if (!t && (i === 0 || i === rows[r].split('|').length - 1)) return ''
      const ai = i - (rows[r].trimStart().startsWith('|') ? 1 : 0)
      return `<td style="text-align:${aligns[ai]||'left'}">${renderInline(t)}</td>`
    }).join('') + '</tr>'
  }
  html += '</tbody></table></div>'
  return html
}

// ─── Callout parsing ──────────────────────────────────────────────
function renderCallout(content: string): string {
  const firstLine = content.split('\n')[0].trim()
  const match = firstLine.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/i)
  if (match) {
    const type = match[1].toUpperCase()
    const icons: Record<string,string> = { NOTE:'ℹ️', TIP:'💡', WARNING:'⚠️', CAUTION:'🚨', IMPORTANT:'❗' }
    const rest = content.split('\n').slice(1).join('\n').trim()
    return `<div class="callout callout-${type.toLowerCase()}"><span class="callout-icon">${icons[type]||'ℹ️'}</span><div class="callout-body">${rest ? renderMarkdown(rest) : ''}</div></div>`
  }
  return `<blockquote>${renderMarkdown(content)}</blockquote>`
}

function renderListItem(item: string): { html: string; taskList: boolean } {
  const taskMatch = item.match(/^[-*+]\s+\[([ x])\]\s+(.+)/)
  if (taskMatch) {
    const checked = taskMatch[1] === 'x'
    return { html: `<li class="task-item"><input type="checkbox" ${checked?'checked':''} disabled /><span>${renderInline(taskMatch[2])}</span></li>`, taskList: true }
  }
  const content = item.replace(/^[-*+]\s+/,'').replace(/^\d+\.\s+/,'')
  return { html: `<li>${renderInline(content)}</li>`, taskList: false }
}

// ─── Main render ──────────────────────────────────────────────────
export function renderMarkdown(md: string): string {
  const tokens = tokenizeBlocks(md)
  const parts: string[] = []
  for (const tok of tokens) {
    switch (tok.type) {
      case 'h1': parts.push(`<h1>${renderInline(tok.content)}</h1>`); break
      case 'h2': parts.push(`<h2>${renderInline(tok.content)}</h2>`); break
      case 'h3': parts.push(`<h3>${renderInline(tok.content)}</h3>`); break
      case 'h4': parts.push(`<h4>${renderInline(tok.content)}</h4>`); break
      case 'h5': parts.push(`<h5>${renderInline(tok.content)}</h5>`); break
      case 'h6': parts.push(`<h6>${renderInline(tok.content)}</h6>`); break
      case 'p': parts.push(`<p>${renderInline(tok.content)}</p>`); break
      case 'hr': parts.push('<hr />'); break
      case 'blockquote': parts.push(renderCallout(tok.content)); break
      case 'latex-block': {
        const rendered = renderLatexInline(tok.content)
        parts.push(`<div class="latex-block">${rendered}</div>`)
        break
      }
      case 'mermaid': {
        const svg = renderMermaid(tok.content)
        // Debug: if SVG doesn't contain rect or text, show raw content
        if (svg.includes('<rect')) {
          parts.push(`<div class="mermaid-block">${svg}</div>`)
        } else {
          parts.push(`<div class="mermaid-block"><pre style="color:var(--danger);font-size:12px">Mermaid parse failed. Raw content:</pre><pre>${escapeHtml(tok.content)}</pre></div>`)
        }
        break
      }
      case 'code': {
        const lang = tok.lang || ''
        const highlighted = lang ? highlightCode(tok.content, lang) : escapeHtml(tok.content)
        const header = lang ? `<div class="code-hdr"><span class="code-lang">${escapeHtml(lang)}</span><span class="code-copy" onclick="(()=>{let t=this.nextElementSibling?.textContent;if(t)navigator.clipboard.writeText(t)})()">Copy</span></div>` : ''
        parts.push(`<div class="code-block">${header}<pre><code class="lang-${escapeHtml(lang)}">${highlighted}</code></pre></div>`)
        break
      }
      case 'table': parts.push(renderTable(tok.content)); break
      case 'list': {
        const items = tok.content.split('\n').filter(Boolean)
        let hasTasks = false
        const listHtml = items.map(item => { const r = renderListItem(item); if (r.taskList) hasTasks = true; return r.html }).join('')
        parts.push(hasTasks ? `<ul class="task-list">${listHtml}</ul>` : `<ul>${listHtml}</ul>`)
        break
      }
    }
  }
  return parts.join('\n')
}

// ─── Extract headings for outline ─────────────────────────────────
export function extractHeadings(md: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = []
  let idCounter = 0
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)/)
    if (m) {
      const text = m[2].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      headings.push({ level: m[1].length, text, id: `h-${idCounter++}` })
    }
  }
  return headings
}

// ─── Editor utilities ─────────────────────────────────────────────
export function wrapSelection(text: string, selStart: number, selEnd: number, wrapper: { before: string; after: string; placeholder?: string }): { text: string; cursor: number } | null {
  const selected = text.slice(selStart, selEnd)
  if (!selected && selStart === selEnd) return null
  const content = selected || wrapper.placeholder || ''
  const newText = text.slice(0, selStart) + wrapper.before + content + wrapper.after + text.slice(selEnd)
  return { text: newText, cursor: selStart + wrapper.before.length + content.length + wrapper.after.length }
}

export function toggleLineWrapper(text: string, selStart: number, selEnd: number, prefix: string): { text: string; cursor: number } | null {
  const lineStart = text.lastIndexOf('\n', selStart - 1) + 1
  const beforeLine = text.slice(0, lineStart)
  const afterLine = text.slice(lineStart)
  const newText = beforeLine + prefix + afterLine
  return { text: newText, cursor: selStart + prefix.length }
}

// Markdown quick conversion
export function applyQuickConversion(text: string, selStart: number, selEnd: number, key: string): { text: string; cursor: number } | null {
  if (key !== ' ') return null
  const lineStart = text.lastIndexOf('\n', selStart - 1) + 1
  const line = text.slice(lineStart, selStart)
  if (line === '#') return { text: text.slice(0, lineStart) + '# ' + text.slice(selStart), cursor: selStart + 1 }
  if (line === '##') return { text: text.slice(0, lineStart) + '## ' + text.slice(selStart), cursor: selStart + 2 }
  if (line === '###') return { text: text.slice(0, lineStart) + '### ' + text.slice(selStart), cursor: selStart + 3 }
  if (line === '####') return { text: text.slice(0, lineStart) + '#### ' + text.slice(selStart), cursor: selStart + 4 }
  if (line === '#####') return { text: text.slice(0, lineStart) + '##### ' + text.slice(selStart), cursor: selStart + 5 }
  if (line === '######') return { text: text.slice(0, lineStart) + '###### ' + text.slice(selStart), cursor: selStart + 6 }
  if (line === '-') return { text: text.slice(0, lineStart) + '- ' + text.slice(selStart), cursor: selStart + 1 }
  if (line === '*') return { text: text.slice(0, lineStart) + '* ' + text.slice(selStart), cursor: selStart + 1 }
  if (line === '>') return { text: text.slice(0, lineStart) + '> ' + text.slice(selStart), cursor: selStart + 1 }
  if (/^\d+$/.test(line)) return { text: text.slice(0, lineStart) + line + '. ' + text.slice(selStart), cursor: selStart + 1 }
  return null
}
