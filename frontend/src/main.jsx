import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Registra e deixa o service worker atualizar em silêncio.
    // Sem auto-reload — a versão nova assume naturalmente quando o
    // usuário fecha e abre o app de novo (nginx serve index.html com
    // no-cache, então a próxima navegação já pega os hashes novos).
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
