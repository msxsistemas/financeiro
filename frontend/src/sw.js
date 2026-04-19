import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Precache de assets buildados
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Navegação (páginas) — network-first com fallback para index.html
const navHandler = new NetworkFirst({
  cacheName: 'pages',
  networkTimeoutSeconds: 3,
  plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })]
})
registerRoute(
  new NavigationRoute(navHandler, { denylist: [/^\/api\//] })
)

// API (apifinanceiro.msxsystem.site) — network-first, TTL 5 min
registerRoute(
  ({ url }) => url.origin === 'https://apifinanceiro.msxsystem.site' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 })]
  })
)

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
      // Se já houver aba aberta, foca e navega
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
