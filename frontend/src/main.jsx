import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// ─── PWA: auto-update atômico ────────────────────────────────────
// O service worker usa skipWaiting + clients.claim. Isso faz o SW
// novo assumir sozinho, mas a aba aberta continua com os chunks JS
// antigos — qualquer navegação lazy quebra (404 no hash velho).
// Solução: quando o controller MUDA (só acontece em upgrade, não
// em primeiro install), recarregamos a aba uma vez para puxar os
// chunks novos. Sem banner, sem flicker em first-load.
if ('serviceWorker' in navigator) {
  const hadControllerAtBoot = !!navigator.serviceWorker.controller
  let reloading = false

  const triggerReload = () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtBoot) return // primeira instalação, não recarrega
    triggerReload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check periódico: a cada 30 min força verificação de update.
      // Se houver SW novo no servidor, ele instala, assume e dispara
      // o controllerchange acima.
      setInterval(() => { reg.update().catch(() => {}) }, 30 * 60 * 1000)

      // Também verifica quando a aba volta a ficar visível (mobile:
      // trocar de app e voltar é o caso mais comum).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {})
        }
      })
    }).catch(() => {})
  })
}
