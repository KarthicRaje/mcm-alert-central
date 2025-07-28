/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string }>
}

// Precaching
precacheAndRoute(self.__WB_MANIFEST)
clientsClaim()

self.addEventListener('install', () => {
  self.skipWaiting()
  console.log('Service Worker installed')
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
  console.log('Service Worker activated')
})

self.addEventListener('push', (event) => {
  const data = event.data?.json()
  const title = data?.title || 'New notification'
  const options = {
    body: data?.body || data?.message || '',
    icon: '/mcm-logo-192.png',
    badge: '/mcm-logo-192.png',
    data: data,
    vibrate: [200, 100, 200],
    actions: data?.actions || []
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  const urlToOpen = event.notification.data?.url || '/'
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then((clientList) => {
        const client = clientList.find(c => c.url === urlToOpen)
        if (client) return client.focus()
        return self.clients.openWindow(urlToOpen)
      })
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data
    self.registration.showNotification(title, options)
  }
})
