import { useState, useEffect, useRef } from 'react'
import type { TreeNode, Dataset, CompileTask } from '../types'
import * as api from '../api'

export default function AgentCompilation() {
  const [tab, setTab] = useState<'compile' | 'history'>('compile')
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-hdr">
          <span className="logo">🧠 Agent Compiler</span>
        </div>
        <div className="sidebar-body">
          <div className="workspace-title">Navigation</div>
          <div className={`nav-item ${tab === 'compile' ? 'active' : ''}`}
            onClick={() => setTab('compile')}>
            <span className="nav-folder-icon">▶</span>
            <span className="nav-label">Start Compilation</span>
          </div>
          <div className={`nav-item ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}>
            <span className="nav-folder-icon">📋</span>
            <span className="nav-label">Task History</span>
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--nim-border)' }}>
          <button className="btn-link" style={{ fontSize: 12, opacity: 0.6 }} onClick={() => window.location.href = '/'}>
            ← Back to Wiki
          </button>
          <button className="btn-link" style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }} onClick={() => window.location.href = '/orchestration'}>
            ⚙ Orchestration
          </button>
        </div>
      </nav>
      <main className="main" style={{ overflow: 'auto' }}>
        {tab === 'compile' && <CompilePanel />}
        {tab === 'history' && <HistoryPanel onView={(id) => {/* navigation handled by opening detail */}} />}
      </main>
    </div>
  )
}

// ===== Compile Panel =====

function CompilePanel() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [trees, setTrees] = useState<Record<string, TreeNode>>({})
  const [selectedDS, setSelectedDS] = useState('')
  const [workspaceID, setWorkspaceID] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [outputDir, setOutputDir] = useState('synthesis')
  const [commitMsg, setCommitMsg] = useState('Agent knowledge compilation')
  const [running, setRunning] = useState(false)
  const [activeTask, setActiveTask] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState('')
  const [log, setLog] = useState('')
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    api.listDatasets().then(ds => {
      setDatasets(ds)
      if (ds.length > 0) {
        setSelectedDS(ds[0].id)
        loadTree(ds[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  useEffect(() => {
    if (!activeTask) return
    // Poll for status/log updates
    const id = setInterval(async () => {
      try {
        const task = await api.getCompileTask(activeTask)
        setActiveStatus(task.status)
        setLog(task.log || '')
        if (task.status === 'success' || task.status === 'failed') {
          setRunning(false)
          clearInterval(id)
        }
      } catch {}
    }, 1000)
    return () => clearInterval(id)
  }, [activeTask])

  async function loadTree(dsID: string) {
    if (trees[dsID]) return
    try {
      const tree = await api.getFolderTree(dsID)
      setTrees(t => ({ ...t, [dsID]: tree }))
    } catch {}
  }

  async function selectWorkspace(folder: TreeNode) {
    setWorkspaceID(folder.id)
    setWorkspaceName(folder.name)
  }

  async function handleRun() {
    if (!workspaceID) return
    setRunning(true)
    setLog('[SYSTEM] Starting compilation...\n')
    setActiveStatus('pending')

    try {
      const result = await api.startCompile({
        workspace_id: workspaceID,
        instructions: instructions || undefined,
        output_dir: outputDir || undefined,
        commit_message: commitMsg || undefined,
      })
      setActiveTask(result.task_id)
      setActiveStatus(result.status)
      setLog(prev => prev + `[SYSTEM] Task created: ${result.task_id}\n`)
    } catch (err: any) {
      setLog(prev => prev + `[ERROR] ${err.message}\n`)
      setRunning(false)
    }
  }

  const workspaceFolders = selectedDS
    ? (trees[selectedDS]?.children?.filter(c => c.type === 'folder') || [])
    : []

  return (
    <div className="welcome" style={{ textAlign: 'left', maxWidth: '100%' }}>
      <h1>🧠 Agent Compiler</h1>
      <p className="hint" style={{ marginBottom: 24 }}>
        Select a workspace and run the knowledge compilation agent.
      </p>

      <div style={{ background: 'var(--nim-bg-secondary)', borderRadius: 8, border: '1px solid var(--nim-border)', padding: 20, marginBottom: 20 }}>
        {/* Dataset Select */}
        <div className="form-field">
          <label className="form-label">Knowledge Base</label>
          <select className="rename-input" value={selectedDS} onChange={e => { setSelectedDS(e.target.value); loadTree(e.target.value) }}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Workspace Select */}
        <div className="form-field">
          <label className="form-label">Data Source (Workspace)</label>
          {workspaceFolders.length === 0 ? (
            <p className="hint" style={{ marginTop: 4 }}>No workspaces found. Create a workspace first.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {workspaceFolders.map(f => (
                <div key={f.id} className="file-card" style={{
                  cursor: 'pointer', padding: '8px 14px', flexDirection: 'row', gap: 6,
                  background: f.id === workspaceID ? 'var(--nim-bg-selected)' : 'var(--nim-bg-tertiary)',
                  border: f.id === workspaceID ? '1px solid var(--nim-primary)' : '1px solid var(--nim-border)',
                }} onClick={() => selectWorkspace(f)}>
                  <span>📁</span>
                  <span style={{ fontSize: 13 }}>{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {workspaceName && <p style={{ fontSize: 12, color: 'var(--nim-primary)', marginTop: 4 }}>Selected: {workspaceName} ({workspaceID.slice(0, 8)}...)</p>}
        </div>

        {/* Output Directory */}
        <div className="form-field">
          <label className="form-label">Output Directory</label>
          <input className="rename-input" value={outputDir} onChange={e => setOutputDir(e.target.value)}
            placeholder="synthesis" style={{ width: '100%' }} />
        </div>

        {/* Instructions */}
        <div className="form-field">
          <label className="form-label">Instructions</label>
          <textarea className="rename-input" value={instructions} onChange={e => setInstructions(e.target.value)}
            rows={3} placeholder="Describe what the agent should do..." style={{ width: '100%', resize: 'vertical' }} />
        </div>

        {/* Commit Message */}
        <div className="form-field">
          <label className="form-label">Commit Message</label>
          <input className="rename-input" value={commitMsg} onChange={e => setCommitMsg(e.target.value)}
            style={{ width: '100%' }} />
        </div>

        {/* Run Button */}
        <div style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={handleRun} disabled={running || !workspaceID}
            style={{ opacity: (running || !workspaceID) ? 0.5 : 1 }}>
            {running ? '⏳ Running...' : '▶ Run Compilation'}
          </button>
        </div>
      </div>

      {/* Log Viewer */}
      {(log || running) && (
        <div style={{ marginTop: 16 }}>
          <h2 className="workspace-title" style={{ padding: '8px 0' }}>Agent Log</h2>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, fontSize: 12, color: 'var(--nim-text-muted)' }}>
            <span>Status: <strong style={{ color: activeStatus === 'success' ? '#2ECC71' : activeStatus === 'failed' ? '#E74C3C' : activeStatus === 'running' ? '#50C878' : '#FFB347' }}>{activeStatus || 'pending'}</strong></span>
          </div>
          <pre ref={logRef} style={{
            background: '#1a1a2e', color: '#e0e0e0', borderRadius: 8, padding: 16, fontSize: 12,
            lineHeight: 1.5, maxHeight: 600, overflow: 'auto',
            fontFamily: "'SF Mono','Fira Code','Consolas',monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {log || 'Waiting...\n'}
            {running && <span style={{ animation: 'pulse 1s infinite', opacity: 0.5 }}>▌</span>}
          </pre>
          <style>{`@keyframes pulse { 50% { opacity: 1; } }`}</style>
        </div>
      )}
    </div>
  )
}

// ===== History Panel =====

function HistoryPanel({ onView }: { onView: (id: string) => void }) {
  const [tasks, setTasks] = useState<CompileTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  async function load() {
    try {
      setTasks(await api.listCompileTasks())
    } catch {}
    setLoading(false)
  }

  return (
    <div className="welcome" style={{ textAlign: 'left' }}>
      <h1>📋 Task History</h1>
      <p className="hint" style={{ marginBottom: 16 }}>Recently executed compilation tasks</p>

      {loading ? <p>Loading...</p> : tasks.length === 0 ? (
        <p className="hint">No tasks yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(t => (
            <div key={t.id} style={{
              background: 'var(--nim-bg-secondary)', borderRadius: 8, padding: '12px 16px',
              border: '1px solid var(--nim-border)', cursor: 'pointer',
            }} onClick={() => onView(t.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--nim-text-muted)' }}>{t.id.slice(0, 12)}...</span>
                <StatusBadge status={t.status} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--nim-text-muted)' }}>
                {new Date(t.created_at).toLocaleString()}
              </div>
              {t.log_preview && (
                <div style={{ fontSize: 11, color: 'var(--nim-text-muted)', marginTop: 4, maxHeight: 40, overflow: 'hidden' }}>
                  {t.log_preview}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: '#FFB347', running: '#50C878', success: '#2ECC71', failed: '#E74C3C',
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: `${colors[status] || '#95A5A6'}20`, color: colors[status] || '#95A5A6',
    }}>{status}</span>
  )
}
