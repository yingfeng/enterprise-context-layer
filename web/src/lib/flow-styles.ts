/**
 * flow-styles — Fireworks Tech Graph 风格的 React Flow 适配配置。
 *
 * 定义了 8 种视觉风格（Flat Icon / Dark Terminal / Blueprint / Notion Clean
 * / Glassmorphism / Claude Official / OpenAI / Dark Luxury），
 * 每种风格包含节点/边/背景/文字的完整配色。
 */

import { createContext, useContext } from 'react'

// ── 边流类型 ──

export type FlowType = 'control' | 'write' | 'read' | 'data' | 'async' | 'feedback' | 'neutral'

export const FLOW_TYPES: { value: FlowType; label: string }[] = [
  { value: 'control', label: '控制流' },
  { value: 'write', label: '写入' },
  { value: 'read', label: '读取' },
  { value: 'data', label: '数据流' },
  { value: 'async', label: '异步' },
  { value: 'feedback', label: '反馈' },
  { value: 'neutral', label: '中性' },
]

// ── 风格配置类型 ──

export interface StyleProfile {
  id: number
  name: string
  description: string
  node: {
    fill: string
    stroke: string
    strokeWidth: number
    radius: number
    shadow: string
    textPrimary: string
    textSecondary: string
    fontFamily: string
    /** 按节点 type 的着色覆盖 */
    typeColors: Record<string, string>
  }
  edge: {
    strokeWidth: number
    colors: Record<FlowType, string>
    dashPatterns: Partial<Record<FlowType, string>>
    labelBg: string
    labelOpacity: number
    labelColor: string
  }
  background: string
  gridColor: string
  gridGap: number
  titleText: string
}

// ── 8 种风格定义 ──

export const STYLE_PROFILES: StyleProfile[] = [
  {
    id: 1,
    name: 'Flat Icon',
    description: '白底灰边框+阴影，多彩箭头。适合博客、文档、幻灯片',
    node: {
      fill: '#ffffff',
      stroke: '#d1d5db',
      strokeWidth: 1.5,
      radius: 10,
      shadow: '0 2px 8px rgba(0,0,0,0.12)',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      typeColors: { start: '#7c3aed', process: '#2563eb', decision: '#f97316', end: '#10b981' },
    },
    edge: {
      strokeWidth: 2.4,
      colors: { control: '#7c3aed', write: '#10b981', read: '#2563eb', data: '#f97316', async: '#7c3aed', feedback: '#ef4444', neutral: '#6b7280' },
      dashPatterns: { write: '6,4', async: '4,2' },
      labelBg: '#ffffff',
      labelOpacity: 0.94,
      labelColor: '#6b7280',
    },
    background: '#ffffff',
    gridColor: '#e5e7eb',
    gridGap: 24,
    titleText: 'Flat Icon',
  },
  {
    id: 2,
    name: 'Dark Terminal',
    description: '深色渐变背景+等宽字体+霓虹发光边框。适合 GitHub README',
    node: {
      fill: '#111827',
      stroke: '#334155',
      strokeWidth: 1.5,
      radius: 10,
      shadow: '0 0 12px rgba(168,85,247,0.15)',
      textPrimary: '#e2e8f0',
      textSecondary: '#94a3b8',
      fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
      typeColors: { start: '#a855f7', process: '#38bdf8', decision: '#f59e0b', end: '#22c55e' },
    },
    edge: {
      strokeWidth: 2.3,
      colors: { control: '#a855f7', write: '#22c55e', read: '#38bdf8', data: '#fb7185', async: '#f59e0b', feedback: '#f97316', neutral: '#94a3b8' },
      dashPatterns: { write: '6,4', async: '4,2' },
      labelBg: '#0f172a',
      labelOpacity: 0.92,
      labelColor: '#cbd5e1',
    },
    background: '#0f172a',
    gridColor: '#1e293b',
    gridGap: 24,
    titleText: 'Dark Terminal',
  },
  {
    id: 3,
    name: 'Blueprint',
    description: '深蓝背景+青蓝高亮+工程网格。适合架构文档、工程规范',
    node: {
      fill: '#0b3b5e',
      stroke: '#67e8f9',
      strokeWidth: 1.5,
      radius: 8,
      shadow: '',
      textPrimary: '#e0f2fe',
      textSecondary: '#bae6fd',
      fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
      typeColors: { start: '#67e8f9', process: '#38bdf8', decision: '#fde047', end: '#22d3ee' },
    },
    edge: {
      strokeWidth: 2.1,
      colors: { control: '#67e8f9', write: '#22d3ee', read: '#38bdf8', data: '#fde047', async: '#c084fc', feedback: '#fb7185', neutral: '#bae6fd' },
      dashPatterns: { write: '6,4', async: '4,2' },
      labelBg: '#082f49',
      labelOpacity: 0.9,
      labelColor: '#e0f2fe',
    },
    background: '#082f49',
    gridColor: '#0c4a6e',
    gridGap: 24,
    titleText: 'Blueprint',
  },
  {
    id: 4,
    name: 'Notion Clean',
    description: '纯白+浅灰底+单色蓝箭头。适合 Notion/Wiki 内部文档',
    node: {
      fill: '#f9fafb',
      stroke: '#e5e7eb',
      strokeWidth: 1.5,
      radius: 4,
      shadow: '',
      textPrimary: '#111827',
      textSecondary: '#374151',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      typeColors: { start: '#3b82f6', process: '#3b82f6', decision: '#3b82f6', end: '#3b82f6' },
    },
    edge: {
      strokeWidth: 1.8,
      colors: { control: '#3b82f6', write: '#3b82f6', read: '#3b82f6', data: '#3b82f6', async: '#9ca3af', feedback: '#9ca3af', neutral: '#d1d5db' },
      dashPatterns: {},
      labelBg: '#ffffff',
      labelOpacity: 0.96,
      labelColor: '#6b7280',
    },
    background: '#ffffff',
    gridColor: '#f3f4f6',
    gridGap: 24,
    titleText: 'Notion Clean',
  },
  {
    id: 5,
    name: 'Glassmorphism',
    description: '深色渐变+半透磨砂玻璃卡片+发光箭头。适合产品官网、演讲',
    node: {
      fill: 'rgba(255,255,255,0.12)',
      stroke: 'rgba(255,255,255,0.28)',
      strokeWidth: 1.5,
      radius: 18,
      shadow: '0 8px 32px rgba(0,0,0,0.3)',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      typeColors: { start: '#c084fc', process: '#60a5fa', decision: '#fb923c', end: '#34d399' },
    },
    edge: {
      strokeWidth: 2.2,
      colors: { control: '#c084fc', write: '#34d399', read: '#60a5fa', data: '#fb923c', async: '#f472b6', feedback: '#f59e0b', neutral: '#cbd5e1' },
      dashPatterns: { write: '6,4', async: '4,2' },
      labelBg: 'rgba(15,23,42,0.7)',
      labelOpacity: 1,
      labelColor: '#e2e8f0',
    },
    background: '#0f172a',
    gridColor: '#1e293b',
    gridGap: 24,
    titleText: 'Glassmorphism',
  },
  {
    id: 6,
    name: 'Claude Official',
    description: '暖奶油色+大地色系+温和圆角。Anthropic 风格文档',
    node: {
      fill: '#fffcf7',
      stroke: '#d9d0c3',
      strokeWidth: 1.5,
      radius: 10,
      shadow: '',
      textPrimary: '#141413',
      textSecondary: '#6b6257',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      typeColors: { start: '#8b7355', process: '#7b8b5c', decision: '#b45309', end: '#d97757' },
    },
    edge: {
      strokeWidth: 2.0,
      colors: { control: '#d97757', write: '#7b8b5c', read: '#8c6f5a', data: '#b45309', async: '#9a6fb0', feedback: '#d97757', neutral: '#8f8a80' },
      dashPatterns: { write: '5,4', async: '4,2' },
      labelBg: '#f8f6f3',
      labelOpacity: 0.96,
      labelColor: '#6b6257',
    },
    background: '#f8f6f3',
    gridColor: '#e8e0d5',
    gridGap: 24,
    titleText: 'Claude Official',
  },
  {
    id: 7,
    name: 'OpenAI',
    description: '纯白+浅灰边框+绿色强调。OpenAI 风格文档',
    node: {
      fill: '#ffffff',
      stroke: '#dce5e3',
      strokeWidth: 1.5,
      radius: 14,
      shadow: '',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      typeColors: { start: '#10a37f', process: '#10a37f', decision: '#f59e0b', end: '#0f766e' },
    },
    edge: {
      strokeWidth: 2.0,
      colors: { control: '#10a37f', write: '#0f766e', read: '#0891b2', data: '#f59e0b', async: '#64748b', feedback: '#10a37f', neutral: '#94a3b8' },
      dashPatterns: { write: '5,4', async: '4,2' },
      labelBg: '#ffffff',
      labelOpacity: 0.96,
      labelColor: '#475569',
    },
    background: '#ffffff',
    gridColor: '#f1f5f9',
    gridGap: 24,
    titleText: 'OpenAI',
  },
  {
    id: 8,
    name: 'Dark Luxury',
    description: '纯黑画布+香槟金强调+衬线标题。高端编辑/建筑文档',
    node: {
      fill: '#111111',
      stroke: '#a78bfa',
      strokeWidth: 1.5,
      radius: 6,
      shadow: '',
      textPrimary: '#f5f0eb',
      textSecondary: '#a39787',
      fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
      typeColors: { start: '#d4a574', process: '#a78bfa', decision: '#fbbf24', end: '#5a9e6f' },
    },
    edge: {
      strokeWidth: 2.0,
      colors: { control: '#d4a574', write: '#6ee7b7', read: '#38bdf8', data: '#fdba74', async: '#a78bfa', feedback: '#d4a574', neutral: '#a39787' },
      dashPatterns: { write: '', read: '', async: '4,3', feedback: '', neutral: '6,3' },
      labelBg: '#0a0a0a',
      labelOpacity: 0.9,
      labelColor: '#a39787',
    },
    background: '#0a0a0a',
    gridColor: '#1a1a1a',
    gridGap: 24,
    titleText: 'Dark Luxury',
  },
]

// ── Context ──

export const FlowStyleContext = createContext<StyleProfile>(STYLE_PROFILES[0])

export function useFlowStyle() {
  return useContext(FlowStyleContext)
}
