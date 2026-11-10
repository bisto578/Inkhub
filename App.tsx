import { Routes, Route } from 'react-router-dom'
import Chat from './pages/Chat'

export default function App() {
  return (
    <div className="bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="*" element={<Chat />} />
      </Routes>
    </div>
  )
}
