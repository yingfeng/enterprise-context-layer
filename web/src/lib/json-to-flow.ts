/**
 * json-to-flow — 从任意 JSON 中自动检测流程图结构（nodes + edges）。
 *
 * 支持的 JSON 模式：
 *   1. { nodes: [{id,label}], edges: [{source,target,label}] }  (React Flow 原生格式)
 *   2. { flow/pipeline/workflow/graph: { nodes: [...], edges: [...] } }
 *   3. { steps: [{id,name,next?}, ...] }  — 通过 next 字段推断边
 *   4. 顶层为对象数组，每个对象有 id，按数组顺序连接
 */

export interface FlowNodeData {
  label: string
  type?: 'start' | 'process' | 'decision' | 'end'
  [key: string]: unknown
}

export interface FlowEdgeData {
  source: string
  target: string
  label?: string
}

export interface FlowResult {
  nodes: { id: string; data: FlowNodeData }[]
  edges: { source: string; target: string; label?: string }[]
  detectedPath: string
}

/** 检查一个值是否是纯对象 */
function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 从对象数组中提取 id，判断是否像节点列表 */
function looksLikeNodeArray(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every(
    item => isObject(item) && (typeof item.id === 'string' || typeof item.id === 'number'),
  )
}

/** 递归扫描对象，寻找 nodes+edges 结构 */
function scanForNodesEdges(obj: unknown, path: string, depth: number): FlowResult | null {
  if (depth > 8) return null
  if (!obj || typeof obj !== 'object') return null

  // 模式 1: 直接有 nodes 和 edges 数组
  if (isObject(obj)) {
    const raw = obj as Record<string, unknown>
    const nodesRaw = raw.nodes
    const edgesRaw = raw.edges
    if (Array.isArray(nodesRaw) && Array.isArray(edgesRaw) && nodesRaw.length > 0 && edgesRaw.length > 0) {
      const nodes = nodesRaw.map((n: unknown) => {
        if (!isObject(n)) return null
        const id = String(n.id ?? n.name ?? '')
        const label = String(n.label ?? n.name ?? n.id ?? id)
        const type = (typeof n.type === 'string' && ['start', 'end', 'process', 'decision'].includes(n.type) ? n.type : 'process') as FlowNodeData['type']
        return { id, data: { label, type } }
      }).filter(Boolean) as { id: string; data: FlowNodeData }[]

      const edges = edgesRaw.map((e: unknown) => {
        if (!isObject(e)) return null
        const source = String(e.source ?? e.from ?? '')
        const target = String(e.target ?? e.to ?? '')
        if (!source || !target) return null
        return { source, target, label: e.label ? String(e.label) : undefined }
      }).filter(Boolean) as { source: string; target: string; label?: string }[]

      if (nodes.length > 0 && edges.length > 0) {
        return { nodes, edges, detectedPath: path || '(root)' }
      }
    }

    // 模式 2: 嵌套的 flow/pipeline/workflow/graph key
    for (const key of ['flow', 'pipeline', 'workflow', 'graph', 'dag']) {
      if (key in raw && isObject(raw[key])) {
        const result = scanForNodesEdges(raw[key], path ? `${path}.${key}` : key, depth + 1)
        if (result) return result
      }
    }

    // 模式 3: steps/stages/tasks 数组模式，通过 next 字段推断边
    for (const key of ['steps', 'stages', 'tasks', 'nodes']) {
      const arr = raw[key]
      if (Array.isArray(arr) && looksLikeNodeArray(arr)) {
        const nodes = arr.map((item: unknown, i: number) => {
          const obj = item as Record<string, unknown>
          const id = String(obj.id ?? i)
          const label = String(obj.label ?? obj.name ?? obj.title ?? obj.id ?? `Step ${i + 1}`)
          const type = (typeof obj.type === 'string' && ['start', 'end', 'process', 'decision'].includes(obj.type) ? obj.type : 'process') as FlowNodeData['type']
          return { id, data: { label, type } }
        })

        const edges: { source: string; target: string; label?: string }[] = []
        for (const item of arr) {
          const obj = item as Record<string, unknown>
          const id = String(obj.id ?? '')
          // 通过 next 字段
          if (obj.next && typeof obj.next === 'string') {
            edges.push({ source: id, target: obj.next })
          }
          if (Array.isArray(obj.next)) {
            for (const nxt of obj.next) {
              if (typeof nxt === 'string') edges.push({ source: id, target: nxt })
            }
          }
        }

        if (nodes.length > 0) {
          return { nodes, edges, detectedPath: path ? `${path}.${key}` : key }
        }
      }
    }
  }

  // 模式 4: 递归子对象
  if (isObject(obj)) {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (isObject(val) || Array.isArray(val)) {
        const result = scanForNodesEdges(val, path ? `${path}.${key}` : key, depth + 1)
        if (result) return result
      }
    }
  }

  return null
}

/**
 * 尝试从 JSON 中提取流程图结构。
 * @param input 已解析的 JSON 对象或 JSON 字符串
 * @returns FlowResult 或 null
 */
export function extractFlow(input: string | unknown): FlowResult | null {
  const parsed: unknown = typeof input === 'string' ? JSON.parse(input) : input
  return scanForNodesEdges(parsed, '', 0)
}
