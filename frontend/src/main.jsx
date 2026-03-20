import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App.jsx'

// Note: StrictMode removed intentionally — it double-invokes effects in dev
// which creates duplicate socket connections and breaks real-time game state
createRoot(document.getElementById('root')).render(<App />)
