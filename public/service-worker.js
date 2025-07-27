// MCM Alerts Service Worker with Enhanced Mobile Background Notifications

const CACHE_NAME = 'mcm-alerts-v4';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/mcm-logo-192.png',
  '/mcm-logo-512.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Cache installation failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - cleanup old caches and take control immediately
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Deleting old cache:', key);
            return caches.delete(key);
          }
        }))
      ),
      self.clients.claim()
    ])
  );
});

// Fetch event - serve cached resources, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
      .catch(error => {
        console.error('Fetch failed:', error);
        throw error;
      })
  );
});

// Enhanced push event for mobile background notifications
self.addEventListener('push', event => {
  console.log('Push event received:', event);
  
  let notificationData = {
    title: 'MCM Alert',
    body: 'New alert received',
    icon: '/mcm-logo-192.png',
    badge: '/mcm-logo-192.png',
    tag: 'mcm-alert',
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'view', title: 'View Dashboard', icon: '/mcm-logo-192.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: {
      url: '/',
      timestamp: Date.now()
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { 
        ...notificationData, 
        ...data,
        data: { ...notificationData.data, ...data.data }
      };
      
      // Set priority-based options for mobile
      if (data.priority === 'high' || data.priority === 'urgent') {
        notificationData.requireInteraction = true;
        notificationData.vibrate = [300, 100, 300, 100, 300];
        notificationData.silent = false;
      } else if (data.priority === 'low') {
        notificationData.vibrate = [100];
        notificationData.silent = false;
      } else {
        notificationData.vibrate = [200, 100, 200];
        notificationData.silent = false;
      }
    } catch (e) {
      console.error('Could not parse push data:', e);
    }
  }

  event.waitUntil(
    // Use ServiceWorkerRegistration.showNotification for mobile compatibility
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      silent: notificationData.silent,
      vibrate: notificationData.vibrate,
      actions: notificationData.actions,
      data: notificationData.data,
      timestamp: Date.now()
    }).then(() => {
      console.log('Background notification displayed successfully');
      
      // Send message to all clients to play sound and update UI
      return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_RECEIVED',
            notificationData: notificationData,
            timestamp: Date.now()
          });
        });
      });
    }).catch(error => {
      console.error('Failed to show background notification:', error);
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  let targetUrl = '/';
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // Check if there's already a window/tab open
          for (const client of clientList) {
            if (client.url.includes(targetUrl) && 'focus' in client) {
              return client.focus();
            }
          }
          // If no window/tab is open, open a new one
          if (clients.openWindow) {
            return clients.openWindow(targetUrl);
          }
        })
        .catch(error => {
          console.error('Error handling notification click:', error);
        })
    );
  }
});

// Enhanced message handling from main thread
self.addEventListener('message', event => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, priority, data } = event.data;
    
    const notificationOptions = {
      body,
      icon: icon || '/mcm-logo-192.png',
      badge: badge || '/mcm-logo-192.png',
      tag: `mcm-alert-${Date.now()}`,
      silent: false,
      requireInteraction: priority === 'high' || priority === 'urgent',
      vibrate: priority === 'high' || priority === 'urgent' ? [300, 100, 300] : [200, 100, 200],
      actions: [
        { action: 'view', title: 'View Dashboard', icon: '/mcm-logo-192.png' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: {
        url: '/',
        priority: priority || 'medium',
        timestamp: Date.now(),
        ...data
      },
      timestamp: Date.now()
    };
    
    self.registration.showNotification(title, notificationOptions)
      .then(() => {
        console.log('Manual notification displayed successfully');
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      })
      .catch(error => {
        console.error('Failed to show manual notification:', error);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: false, error: error.message });
        }
      });
  }
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('Notification closed:', event.notification.tag);
});

// Background sync for offline notifications
self.addEventListener('sync', event => {
  if (event.tag === 'background-notification-sync') {
    event.waitUntil(
      fetch('/api/notifications/sync')
        .then(response => response.json())
        .then(data => {
          console.log('Background sync completed:', data);
          
          if (data.notifications && data.notifications.length > 0) {
            return Promise.all(
              data.notifications.map(notification => 
                self.registration.showNotification(notification.title, {
                  body: notification.body,
                  icon: '/mcm-logo-192.png',
                  badge: '/mcm-logo-192.png',
                  tag: `mcm-alert-sync-${Date.now()}`,
                  data: notification.data || {},
                  timestamp: Date.now()
                })
              )
            );
          }
        })
        .catch(error => {
          console.error('Background sync failed:', error);
        })
    );
  }
});

console.log('Service Worker loaded successfully with mobile background notification support');
