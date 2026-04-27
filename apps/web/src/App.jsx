import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HubPage from './HubPage'
import RythmApp from './RythmApp'
import TheoriePage from './TheoriePage'
import AccordeurPage from './AccordeurPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HubPage />} />
        <Route path="/rythme" element={<RythmApp />} />
        <Route path="/theorie" element={<TheoriePage />} />
        <Route path="/accordeur" element={<AccordeurPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
