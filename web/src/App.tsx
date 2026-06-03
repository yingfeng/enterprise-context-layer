import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './lib/theme/ThemeContext'
import RootPage from './pages/RootPage'
import WorkspacePage from './pages/WorkspacePage'
import CommitPage from './pages/CommitPage'
import AgentCompilation from './pages/AgentCompilation'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootPage />} />
          <Route path="/compiler" element={<AgentCompilation />} />
          <Route path="/:name" element={<WorkspacePage />} />
          <Route path="/:name/commits/:commitId" element={<CommitPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
