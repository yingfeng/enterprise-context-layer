/**
 * JsonEditor — JSON 编辑器 + 内联流程图预览。
 *
 * - Code 模式（默认）：Monaco JSON 编辑器（完整编辑能力）
 * - 检测到 JSON 中的流程图结构时，工具栏显示"流程图"预览按钮
 * - 点击后在右侧打开流程图预览面板（可折叠），与代码编辑并排显示
 * - 流程图随代码实时自动检测，用户可随时切换编辑与可视化
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import RawMarkdownEditor from '../lib/editor/RawMarkdownEditor'
import { extractFlow, type FlowResult } from '../lib/json-to-flow'

// ── Props ──

interface Props {
  content: string
  onChange: (content: string) => void
  readOnly?: boolean
  fileName?: string
}

// ── Custom Flowchart Node ──

const FLOW_NODE_COLORS: Record<string, string> = {
  start: '#22c55e',
  end: '#ef4444',
  decision: '#f59e0b',
}

function FlowNode(props: NodeProps) {
  const data = props.data as { label: string; type?: string }
  const bg = (data.type && FLOW_NODE_COLORS[data.type]) ? FLOW_NODE_COLORS[data.type] : '#3b82f6'

  return (
    <div
      style={{
        padding: '8px 16px',
        minWidth: 80,
        maxWidth: 180,
        textAlign: 'center',
        background: bg,
        color: '#fff',
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.3,
        borderRadius: data.type === 'decision' ? 4 : 8,
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        cursor: 'default',
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top}
        style={{ width: 6, height: 6, background: '#fff', border: '2px solid #333', borderRadius: '50%' }} />
      <Handle type="source" position={Position.Bottom}
        style={{ width: 6, height: 6, background: '#fff', border: '2px solid #333', borderRadius: '50%' }} />
      {data.label}
    </div>
  )
}

function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props
  const edgeData = data as { label?: string }
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
          stroke: selected ? 'var(--nim-primary)' : 'var(--nim-text-muted)',
          strokeWidth: selected ? 3 : 1.5,
          opacity: 0.6,
        }}
        markerEnd={MarkerType.ArrowClosed}
      />
      {edgeData?.label && (
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
            background: 'var(--nim-bg-tertiary)',
            color: 'var(--nim-text-faint)',
            border: '1px solid var(--nim-border)',
            whiteSpace: 'nowrap',
          }}
        >
          {edgeData.label}
        </div>
      )}
    </>
  )
}

const nodeTypes = { flowNode: FlowNode } as const
const edgeTypes = { flowEdge: FlowEdge } as const

// ── Helpers ──

function buildFlowNodes(result: FlowResult) {
  const N = result.nodes.length
  const centerX = 200
  const startY = 30
  const colGap = 140
  const rowGap = 70
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
      data: { label: n.data.label, type: n.data.type || 'process' },
    }
  })
}

function buildFlowEdges(result: FlowResult) {
  return result.edges.map((e, i) => ({
    id: `fe-${i}`,
    source: e.source,
    target: e.target,
    type: 'flowEdge',
    data: { label: e.label || '' },
    markerEnd: MarkerType.ArrowClosed,
  }))
}

// ── Component ──

export default function JsonEditor({ content, onChange, readOnly = false, fileName }: Props) {
  const [showFlowPanel, setShowFlowPanel] = useState(false)

  // Auto-detect flow structure from JSON content
  const flowDetection = useMemo<{ result: FlowResult | null; error: string | null }>(() => {
    try {
      const result = extractFlow(content)
      return { result, error: null }
    } catch (e: unknown) {
      return { result: null, error: (e as Error).message }
    }
  }, [content])

  const hasFlow = flowDetection.result !== null

  // Re-run detection when opening panel
  useEffect(() => {
    if (showFlowPanel && !hasFlow) {
      // Keep panel closed if no flow detected
      setShowFlowPanel(false)
    }
  }, [showFlowPanel, hasFlow])

  // Build React Flow layout
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
      {/* Toolbar */}
      <div className="nim-editor-toolbar" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderBottom: '1px solid var(--nim-border)',
        background: 'var(--nim-toolbar-bg)', flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, color: 'var(--nim-text-muted)', marginRight: 8, fontFamily: 'monospace' }}>
          {fileName || '*.json'}
        </div>

        {/* Flow preview toggle — only shown when flow structure detected */}
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
            检测到流程图: {flowDetection.result.detectedPath} · {flowDetection.result.nodes.length} 节点 · {flowDetection.result.edges.length} 边
            {!showFlowPanel && <span style={{ marginLeft: 6, opacity: 0.6 }}>← 点击按钮预览</span>}
          </span>
        )}
        {flowDetection.error && (
          <span style={{ fontSize: 11, color: 'var(--nim-error)' }}>
            JSON 格式错误: {flowDetection.error}
          </span>
        )}
      </div>

      {/* Editor area: code + optional flow panel side-by-side */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {/* Code editor */}
        <div style={{
          flex: 1,
          minWidth: showFlowPanel ? '40%' : '100%',
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
          <div style={{
            width: '55%', minWidth: 300, flexShrink: 0,
            borderLeft: '1px solid var(--nim-border)',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            position: 'relative',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '4px 12px', fontSize: 11, color: 'var(--nim-text-muted)',
              borderBottom: '1px solid var(--nim-border)',
              background: 'var(--nim-toolbar-bg)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontWeight: 600 }}>📊 流程图预览</span>
              <span style={{ fontSize: 10, color: 'var(--nim-text-faint)' }}>
                路径: {flowDetection.result?.detectedPath}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowFlowPanel(false)}
                className="nim-mode-btn"
                style={{
                  padding: '2px 6px', border: '1px solid transparent',
                  borderRadius: 3, cursor: 'pointer', fontSize: 11,
                  background: 'transparent', color: 'var(--nim-text-faint)',
                  fontFamily: 'inherit',
                }}
              >
                ✕
              </button>
            </div>

            {/* Flow graph */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {nodes.length > 0 ? (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  minZoom={0.1}
                  maxZoom={3}
                  style={{ background: 'var(--nim-bg)' }}
                >
                  <Background color="var(--nim-border)" gap={20} size={1} />
                  <Controls
                    showInteractive={false}
                    style={{
                      background: 'var(--nim-bg-secondary)',
                      border: '1px solid var(--nim-border)',
                      borderRadius: 6,
                      transform: 'scale(0.8)',
                      transformOrigin: 'bottom left',
                    }}
                  />
                  <MiniMap
                    nodeColor={(n) => {
                      const t = (n.data as { type?: string })?.type
                      return FLOW_NODE_COLORS[t ?? ''] ?? '#3b82f6'
                    }}
                    style={{
                      background: 'var(--nim-bg-secondary)',
                      border: '1px solid var(--nim-border)',
                      borderRadius: 6,
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
        )}
      </div>
    </div>
  )
}
