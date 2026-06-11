/**
 * JsonEditor — JSON 编辑器 + 内联流程图预览。
 *
 * 流程图支持 fireworks-tech-graph 风格的多种节点形状和箭头样式：
 * - 形状: rect / hexagon / diamond / circle / double_rect / cylinder / document / speech / terminal
 * - 箭头: 7 种 flowType (control/write/read/data/async/feedback/neutral)，每种有独立颜色和箭头标记
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  getBezierPath,
  type NodeProps,
  type EdgeProps,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import RawMarkdownEditor from '../lib/editor/RawMarkdownEditor'
import { extractFlow, type FlowResult } from '../lib/json-to-flow'
import { STYLE_PROFILES, FlowStyleContext, useFlowStyle } from '../lib/flow-styles'
import type { FlowType } from '../lib/flow-styles'

// ── Props ──

interface Props {
  content: string
  onChange: (content: string) => void
  readOnly?: boolean
  fileName?: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Node Shapes — SVG-based shape rendering
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useNodeStyle() {
  const s = useFlowStyle()
  return s
}

function getTypeColor(s: ReturnType<typeof useNodeStyle>, dataType?: string) {
  return (dataType && s.node.typeColors[dataType]) || s.node.stroke
}

// ── Rect (default) ──

function RectShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: s.node.radius,
      background: s.node.fill, border: `${s.node.strokeWidth}px solid ${b}`,
      boxShadow: s.node.shadow, color: s.node.textPrimary,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      fontFamily: s.node.fontFamily, fontWeight: 600, fontSize: 12,
      position: 'relative',
    }}>
      {children}
    </div>
  )
}

// ── Hexagon ──

function HexagonShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  const inset = w * 0.12
  const path = `M ${inset} 0 L ${w - inset} 0 L ${w} ${h/2} L ${w - inset} ${h} L ${inset} ${h} L 0 ${h/2} Z`
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        {s.node.shadow && (
          <filter id="hex-shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" />
          </filter>
        )}
      </defs>
      <path d={path} fill={s.node.fill} stroke={b} strokeWidth={s.node.strokeWidth}
        filter={s.node.shadow ? 'url(#hex-shadow)' : undefined} />
      <foreignObject x={0} y={4} width={w} height={h - 8}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          height: '100%', color: s.node.textPrimary, fontFamily: s.node.fontFamily,
          fontWeight: 600, fontSize: 12, textAlign: 'center', padding: '0 8px',
        }}>
          {children}
        </div>
      </foreignObject>
    </svg>
  )
}

// ── Diamond ──

function DiamondShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  const sw = w * 0.7, sh = h * 0.7
  const path = `M ${w/2} 0 L ${w} ${h/2} L ${w/2} ${h} L 0 ${h/2} Z`
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        {s.node.shadow && (
          <filter id="diamond-shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" />
          </filter>
        )}
      </defs>
      <path d={path} fill={s.node.fill} stroke={b} strokeWidth={s.node.strokeWidth}
        filter={s.node.shadow ? 'url(#diamond-shadow)' : undefined} />
      <foreignObject x={w * 0.08} y={h * 0.15} width={w * 0.84} height={h * 0.7}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          height: '100%', color: s.node.textPrimary, fontFamily: s.node.fontFamily,
          fontWeight: 600, fontSize: 10, textAlign: 'center', lineHeight: 1.2,
        }}>
          {children}
        </div>
      </foreignObject>
    </svg>
  )
}

// ── Circle ──

function CircleShape({ children, size, b, s }: { children: React.ReactNode; size: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: s.node.fill, border: `${s.node.strokeWidth}px solid ${b}`,
      boxShadow: s.node.shadow, color: s.node.textPrimary,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      fontFamily: s.node.fontFamily, fontWeight: 600, fontSize: 11,
      textAlign: 'center', padding: 8, lineHeight: 1.2,
    }}>
      {children}
    </div>
  )
}

// ── Double Rect (LLM/Model) ──

function DoubleRectShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: s.node.radius + 3,
        border: `${s.node.strokeWidth * 0.7}px solid ${b}`,
        opacity: 0.4,
      }} />
      <div style={{
        position: 'absolute', inset: 5, borderRadius: s.node.radius,
        background: s.node.fill, border: `${s.node.strokeWidth}px solid ${b}`,
        boxShadow: s.node.shadow, color: s.node.textPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        fontFamily: s.node.fontFamily, fontWeight: 600, fontSize: 12,
      }}>
        {children}
      </div>
    </div>
  )
}

// ── Cylinder (Database) ──

function CylinderShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  const ellipseR = 8
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          {s.node.shadow && <filter id="cyl-shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" /></filter>}
        </defs>
        {/* top ellipse */}
        <ellipse cx={w/2} cy={ellipseR} rx={w/2 - 2} ry={ellipseR}
          fill={s.node.fill} stroke={b} strokeWidth={s.node.strokeWidth}
          filter={s.node.shadow ? 'url(#cyl-shadow)' : undefined} />
        {/* body */}
        <rect x={2} y={ellipseR} width={w - 4} height={h - 2 * ellipseR}
          fill={s.node.fill} stroke="none" />
        {/* bottom ellipse arc */}
        <path d={`M 2 ${h - ellipseR} L 2 ${ellipseR} A ${w/2 - 2} ${ellipseR} 0 0 0 ${w - 2} ${ellipseR} L ${w - 2} ${h - ellipseR}`}
          fill="none" stroke={b} strokeWidth={s.node.strokeWidth} />
        {/* right side line */}
        <line x1={w - 2} y1={ellipseR} x2={w - 2} y2={h - ellipseR} stroke={b} strokeWidth={s.node.strokeWidth} />
        {/* bottom fill */}
        <path d={`M 2 ${h - ellipseR} A ${w/2 - 2} ${ellipseR} 0 0 0 ${w - 2} ${h - ellipseR}`}
          fill={s.node.fill} stroke={b} strokeWidth={s.node.strokeWidth} />
      </svg>
      <foreignObject x={0} y={ellipseR + 4} width={w} height={h - 2 * ellipseR - 8}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          height: '100%', color: s.node.textPrimary, fontFamily: s.node.fontFamily,
          fontWeight: 600, fontSize: 12, textAlign: 'center', padding: '0 8px',
        }}>
          {children}
        </div>
      </foreignObject>
    </div>
  )
}

// ── Document (Dog-eared) ──

function DocumentShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  const fold = Math.min(18, w * 0.18, h * 0.22)
  const bodyPath = `M 2 2 L ${w - fold - 2} 2 L ${w - 2} ${fold + 2} L ${w - 2} ${h - 2} L 2 ${h - 2} Z`
  const foldPath = `M ${w - fold - 2} 2 L ${w - fold - 2} ${fold + 2} L ${w - 2} ${fold + 2}`
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          {s.node.shadow && <filter id="doc-shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" /></filter>}
        </defs>
        <path d={bodyPath} fill={s.node.fill} stroke={b} strokeWidth={s.node.strokeWidth}
          filter={s.node.shadow ? 'url(#doc-shadow)' : undefined} />
        <path d={foldPath} fill="none" stroke={b} strokeWidth={s.node.strokeWidth} />
      </svg>
      <foreignObject x={10} y={8} width={w - 20} height={h - 16}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          height: '100%', color: s.node.textPrimary, fontFamily: s.node.fontFamily,
          fontWeight: 600, fontSize: 12, textAlign: 'center',
        }}>
          {children}
        </div>
      </foreignObject>
    </div>
  )
}

// ── Speech Bubble ──

function SpeechShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  const r = s.node.radius
  const tail = 14
  const path = `M ${r + 2} 2 L ${w - r - 2} 2 Q ${w - 2} 2 ${w - 2} ${r + 2} L ${w - 2} ${h - r - 2} Q ${w - 2} ${h - 2} ${w - r - 2} ${h - 2} L ${w/2 + 14} ${h - 2} L ${w/2} ${h - 2 + tail} L ${w/2 - 14} ${h - 2} L ${r + 2} ${h - 2} Q 2 ${h - 2} 2 ${h - r - 2} L 2 ${r + 2} Q 2 2 ${r + 2} 2 Z`
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          {s.node.shadow && <filter id="speech-shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.12)" /></filter>}
        </defs>
        <path d={path} fill={s.node.fill} stroke={b} strokeWidth={s.node.strokeWidth}
          filter={s.node.shadow ? 'url(#speech-shadow)' : undefined} />
      </svg>
      <foreignObject x={10} y={6} width={w - 20} height={h - 16}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          height: '100%', color: s.node.textPrimary, fontFamily: s.node.fontFamily,
          fontWeight: 600, fontSize: 12, textAlign: 'center',
        }}>
          {children}
        </div>
      </foreignObject>
    </div>
  )
}

// ── Terminal ──

function TerminalShape({ children, w, h, b, s }: { children: React.ReactNode; w: number; h: number; b: string; s: ReturnType<typeof useNodeStyle> }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, borderRadius: s.node.radius, overflow: 'hidden',
      border: `${s.node.strokeWidth}px solid ${b}`, background: s.node.fill, boxShadow: s.node.shadow }}>
      {/* Terminal header bar */}
      <div style={{ height: 18, background: '#1f2937', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
      </div>
      {/* Content */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        height: h - 18, color: s.node.textPrimary, fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontWeight: 600, fontSize: 12, textAlign: 'center', padding: '0 8px',
      }}>
        <span style={{ color: '#10b981' }}>$</span> {children}
      </div>
    </div>
  )
}

// ── Shape Router ──

function renderShape(shape: string | undefined, children: React.ReactNode, w: number, h: number, b: string, s: ReturnType<typeof useNodeStyle>, size: number) {
  switch (shape) {
    case 'hexagon': return <HexagonShape w={w} h={h} b={b} s={s}>{children}</HexagonShape>
    case 'diamond': return <DiamondShape w={w} h={h} b={b} s={s}>{children}</DiamondShape>
    case 'circle': return <CircleShape size={size} b={b} s={s}>{children}</CircleShape>
    case 'double_rect': return <DoubleRectShape w={w} h={h} b={b} s={s}>{children}</DoubleRectShape>
    case 'cylinder': return <CylinderShape w={w} h={h} b={b} s={s}>{children}</CylinderShape>
    case 'document': return <DocumentShape w={w} h={h} b={b} s={s}>{children}</DocumentShape>
    case 'speech': return <SpeechShape w={w} h={h} b={b} s={s}>{children}</SpeechShape>
    case 'terminal': return <TerminalShape w={w} h={h} b={b} s={s}>{children}</TerminalShape>
    default: return <RectShape w={w} h={h} b={b} s={s}>{children}</RectShape>
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FlowNode Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NODE_W = 140
const NODE_H = 52
const NODE_CIRCLE = 60

function FlowNode(props: NodeProps) {
  const s = useFlowStyle()
  const data = props.data as { label: string; type?: string; shape?: string }
  const b = getTypeColor(s, data.type)
  const shape = data.shape || 'rect'

  return (
    <div style={{ position: 'relative' }}>
      {/* Handles — hidden for shapes that have built-in connection points (cylinder, document, speech get standard) */}
      <Handle type="target" position={Position.Top}
        style={{ width: 7, height: 7, background: b, border: '2px solid #fff', borderRadius: '50%', zIndex: 5 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ width: 7, height: 7, background: b, border: '2px solid #fff', borderRadius: '50%', zIndex: 5 }} />

      {renderShape(shape,
        <>
          <div style={{ lineHeight: 1.3 }}>{data.label}</div>
          {data.type && (
            <div style={{ fontSize: 9, opacity: 0.55, marginTop: 2, color: s.node.textSecondary }}>
              {shape !== 'rect' ? `${shape} · ${data.type}` : data.type}
            </div>
          )}
        </>,
        NODE_W, NODE_H, b, s, NODE_CIRCLE,
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FlowEdge — with custom arrow markers per flowType
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FlowEdge(props: EdgeProps) {
  const s = useFlowStyle()
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props
  const edgeData = data as { label?: string; flowType?: FlowType }
  const ft = edgeData.flowType || 'neutral'
  const color = s.edge.colors[ft] || s.edge.colors.neutral
  const dash = s.edge.dashPatterns[ft] || ''

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    curvature: 0.3,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? s.edge.strokeWidth + 1 : s.edge.strokeWidth,
          strokeDasharray: dash,
          opacity: 0.75,
          transition: 'all 0.15s',
        }}
        markerEnd={`url(#arr-${ft})`}
      />
      {edgeData?.label && (
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 3,
            background: s.edge.labelBg,
            opacity: s.edge.labelOpacity,
            color: s.edge.labelColor,
            border: '1px solid ' + s.node.stroke,
            whiteSpace: 'nowrap',
            fontFamily: s.node.fontFamily,
          }}
        >
          {edgeData.label}
        </div>
      )}
    </>
  )
}

// ── SVG Arrow Markers ──

function FlowMarkers() {
  return (
    <defs>
      {(['control', 'write', 'read', 'data', 'async', 'feedback', 'neutral'] as FlowType[]).map(ft => {
        const color = STYLE_PROFILES[0].edge.colors[ft] // marker color = Flat Icon reference
        return (
          <marker key={ft} id={`arr-${ft}`} markerWidth={12} markerHeight={8} refX={10} refY={4} orient="auto">
            <polygon points="0 0,12 4,0 8" fill={color} />
          </marker>
        )
      })}
    </defs>
  )
}

const nodeTypes = { flowNode: FlowNode } as const
const edgeTypes = { flowEdge: FlowEdge } as const

// ── Helpers ──

function buildFlowNodes(result: FlowResult): Node[] {
  const N = result.nodes.length
  const centerX = 200
  const startY = 30
  const colGap = 160
  const rowGap = 85
  const nodesPerRow = Math.max(1, Math.ceil(Math.sqrt(N)))

  return result.nodes.map((n, i) => {
    const row = Math.floor(i / nodesPerRow)
    const col = i % nodesPerRow
    const offsetX = (nodesPerRow - 1) * colGap / 2
    return {
      id: n.id,
      type: 'flowNode',
      position: {
        x: centerX + col * colGap - offsetX,
        y: startY + row * rowGap,
      },
      data: { label: n.data.label, type: n.data.type || 'process', shape: n.data.shape },
    }
  })
}

function buildFlowEdges(result: FlowResult): Edge[] {
  return result.edges.map((e, i) => ({
    id: `fe-${i}`,
    source: e.source,
    target: e.target,
    type: 'flowEdge',
    data: { label: e.label || '', flowType: (e as any).flowType || 'neutral' },
  }))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function JsonEditor({ content, onChange, readOnly = false, fileName }: Props) {
  const [showFlowPanel, setShowFlowPanel] = useState(false)
  const [styleIndex, setStyleIndex] = useState(0)
  const currentStyle = STYLE_PROFILES[styleIndex] ?? STYLE_PROFILES[0]

  const flowDetection = useMemo<{ result: FlowResult | null; error: string | null }>(() => {
    try {
      const result = extractFlow(content)
      return { result, error: null }
    } catch (e: unknown) {
      return { result: null, error: (e as Error).message }
    }
  }, [content])

  const hasFlow = flowDetection.result !== null

  useEffect(() => {
    if (showFlowPanel && !hasFlow) setShowFlowPanel(false)
  }, [showFlowPanel, hasFlow])

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!flowDetection.result) return { flowNodes: [], flowEdges: [] }
    return {
      flowNodes: buildFlowNodes(flowDetection.result),
      flowEdges: buildFlowEdges(flowDetection.result),
    }
  }, [flowDetection.result])

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  useEffect(() => {
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [flowNodes, flowEdges, setNodes, setEdges])

  const handleRawChange = useCallback((value: string) => {
    onChange(value)
  }, [onChange])

  return (
    <div className="nim-editor-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderBottom: '1px solid var(--nim-border)',
        background: 'var(--nim-toolbar-bg)', flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, color: 'var(--nim-text-muted)', marginRight: 8, fontFamily: 'monospace' }}>
          {fileName || '*.json'}
        </div>

        {hasFlow && (
          <button
            onClick={() => setShowFlowPanel(v => !v)}
            className="nim-mode-btn"
            style={{
              padding: '4px 10px',
              border: '1px solid ' + (showFlowPanel ? 'var(--nim-primary)' : 'transparent'),
              borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: showFlowPanel ? 'var(--nim-bg-selected)' : 'transparent',
              color: showFlowPanel ? 'var(--nim-primary)' : 'var(--nim-text-muted)',
              fontFamily: 'inherit',
            }}
          >
            📊 {showFlowPanel ? '隐藏流程图' : '流程图预览'} ▸
          </button>
        )}

        <div style={{ flex: 1 }} />

        {hasFlow && flowDetection.result && (
          <span style={{ fontSize: 11, color: 'var(--nim-text-faint)' }}>
            {flowDetection.result.nodes.length} 节点 · {flowDetection.result.edges.length} 边
            {!showFlowPanel && <span style={{ marginLeft: 6, opacity: 0.6 }}>← 点击预览</span>}
          </span>
        )}
        {flowDetection.error && (
          <span style={{ fontSize: 11, color: 'var(--nim-error)' }}>JSON 格式错误</span>
        )}
      </div>

      {/* ── Editor area: code + optional flow panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {/* Code editor */}
        <div style={{
          flex: 1, minWidth: showFlowPanel ? '40%' : '100%',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <RawMarkdownEditor
            content={content}
            onChange={handleRawChange}
            readOnly={readOnly}
            language="json"
          />
        </div>

        {/* Flow preview panel */}
        {showFlowPanel && (
          <FlowStyleContext.Provider value={currentStyle}>
          <div style={{
            width: '55%', minWidth: 320, flexShrink: 0,
            borderLeft: '1px solid var(--nim-border)',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            position: 'relative',
          }}>
            {/* ── Panel header + style selector ── */}
            <div style={{
              padding: '4px 8px', borderBottom: '1px solid var(--nim-border)',
              background: 'var(--nim-toolbar-bg)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--nim-text)', marginRight: 4 }}>
                📊 流程图
              </span>

              <select
                value={styleIndex}
                onChange={e => setStyleIndex(Number(e.target.value))}
                style={{
                  padding: '2px 6px', fontSize: 11,
                  borderRadius: 4, border: '1px solid var(--nim-border)',
                  background: 'var(--nim-bg)', color: 'var(--nim-text)',
                  fontFamily: 'inherit', cursor: 'pointer', maxWidth: 140,
                }}
                title={currentStyle.description}
              >
                {STYLE_PROFILES.map((sp, i) => (
                  <option key={sp.id} value={i}>{sp.name}</option>
                ))}
              </select>

              {flowDetection.result && (
                <span style={{ fontSize: 10, color: 'var(--nim-text-faint)', marginLeft: 4 }}>
                  {flowDetection.result.detectedPath}
                </span>
              )}

              <div style={{ flex: 1 }} />

              <button onClick={() => setShowFlowPanel(false)}
                className="nim-mode-btn"
                style={{
                  padding: '2px 6px', border: '1px solid transparent',
                  borderRadius: 3, cursor: 'pointer', fontSize: 11,
                  background: 'transparent', color: 'var(--nim-text-faint)', fontFamily: 'inherit',
                }}
              >✕</button>
            </div>

            {/* ── Flow graph ── */}
            <div style={{
              flex: 1, minHeight: 0, position: 'relative',
              background: currentStyle.background,
            }}>
              {nodes.length > 0 ? (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView fitViewOptions={{ padding: 0.3 }}
                  minZoom={0.1} maxZoom={3}
                >
                  {/* SVG markers — render before Background so they load first */}
                  <FlowMarkers />
                  <Background color={currentStyle.gridColor} gap={currentStyle.gridGap} size={1} />
                  <Controls showInteractive={false}
                    style={{
                      background: 'var(--nim-bg-secondary)',
                      border: '1px solid var(--nim-border)', borderRadius: 6,
                      transform: 'scale(0.8)', transformOrigin: 'bottom left',
                    }}
                  />
                  <MiniMap
                    nodeColor={() => currentStyle.node.stroke}
                    maskColor={currentStyle.background}
                    style={{
                      background: 'var(--nim-bg-secondary)',
                      border: '1px solid var(--nim-border)', borderRadius: 6,
                    }}
                  />
                </ReactFlow>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: 'var(--nim-text-faint)', fontSize: 12,
                }}>
                  流程图数据为空
                </div>
              )}
            </div>
          </div>
          </FlowStyleContext.Provider>
        )}
      </div>
    </div>
  )
}
