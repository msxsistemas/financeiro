import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Precache dos assets buildados (revisão vem do injectManifest)
precacheAndRoute(self.__WB_MANIFEST)

// Instalação: assume imediatamente, sem esperar a aba fechar
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Ativação: purga TODO cache que não seja gerenciado por este SW.
// Isso apaga:
//   - o cache legado 'financeiro-v1' (do SW manual antigo)
//   - quaisquer precaches do workbox de builds anteriores
//   - caches de runtime órfãos
// Depois toma controle das abas abertas.
const RUNTIME_CACHES = new Set(['pages', 'api-cache'])
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys()
      // Descobre o cache de precache DESTE SW (nome contém o scope atual).
      const myPrecache = names.find(
        n => n.startsWith('workbox-precache') && n.includes(self.registration.scope.replace(/\/$/, ''))
      )
      await Promise.all(
        names
          .filter(n => n !== myPrecache && !RUNTIME_CACHES.has(n))
          .map(n => caches.delete(n))
      )
    } catch {}
    await self.clients.claim()
  })())
})

// Navegação (HTML das páginas) — network-first com fallback pro cache.
// Timeout curto pra não travar em rede ruim.
const navHandler = new NetworkFirst({
  cacheName: 'pages',
  networkTimeoutSeconds: 3,
  plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })]
})
registerRoute(new NavigationRoute(navHandler, { denylist: [/^\/api\//] }))

// API (apifinanceiro.msxsystem.site) — network-first, TTL 5 min.
registerRoute(
  ({ url }) => url.origin === 'https://apifinanceiro.msxsystem.site' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 })]
  })
)

// Mensagens do app: permite forçar atualização imediata se precisar.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ─── Push notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}

  const title = data.title || 'Financeiro MSX'
  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.tag || undefined,
    data: { url: data.url || '/', ...data },
    vibrate: [100, 50, 100],
    requireInteraction: !!data.requireInteraction
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
