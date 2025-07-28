// src/sw.js
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// Precache and route all assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Take control immediately
self.skipWaiting();
clientsClaim();

// Cache API responses for offline use
registerRoute(
  ({url}) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      {
        cacheWillUpdate: async ({response}) => {
          // Only cache successful responses
          return response.status === 200 ? response : null;
        }
      }
    ]
  })
);

// Notification constants
const DEFAULT_ICON = '/mcm-logo-192.png';
const DEFAULT_BADGE = '/mcm-logo-192.png';
const DEFAULT_ACTIONS = [
  { action: 'view', title: 'View Dashboard', icon: DEFAULT_ICON },
  { action: 'dismiss', title: 'Dismiss' }
];

// Enhanced push notification handler
self.addEventListener('push', event => {
  const handlePushNotification = async () => {
    try {
      // Default notification data
      let notificationData = {
        title: 'MCM Alert',
        body: 'New notification received',
        icon: DEFAULT_ICON,
        badge: DEFAULT_BADGE,
        tag: `mcm-notification-${Date.now()}`,
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200],
        actions: DEFAULT_ACTIONS,
        data: {
          url: '/',
          timestamp: Date.now()
        }
      };

      // Process incoming push data
      if (event.data) {
        try {
          const pushData = event.data.json();
          console.log('Push data received:', pushData);
          
          // Merge with default data
          notificationData = {
            ...notificationData,
            title: pushData.title || notificationData.title,
            body: pushData.message || pushData.body || notificationData.body,
            data: { 
              ...notificationData.data, 
              ...pushData,
              id: pushData.id || `push-${Date.now()}`
            }
          };
          
          // Set priority-based options
          switch (pushData.priority) {
            case 'high':
            case 'urgent':
              notificationData.requireInteraction = true;
              notificationData.vibrate = [300, 100, 300, 100, 300];
              notificationData.tag = `mcm-urgent-${Date.now()}`;
              break;
            case 'low':
              notificationData.vibrate = [100];
              notificationData.tag = `mcm-low-${Date.now()}`;
              break;
            default:
              notificationData.vibrate = [200, 100, 200];
              notificationData.tag = `mcm-medium-${Date.now()}`;
          }
        } catch (error) {
          console.error('Error parsing push data:', error);
        }
      }

      // Show the notification
      await self.registration.showNotification(
        notificationData.title, 
        notificationData
      );
      console.log('Push notification displayed successfully');
      
      // Notify all clients about the new notification
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'PUSH_NOTIFICATION_RECEIVED',
          notificationData,
          timestamp: Date.now()
        });
      });
    } catch (error) {
      console.error('Failed to handle push notification:', error);
    }
  };

  event.waitUntil(handlePushNotification());
});

// Enhanced notification click handler
self.addEventListener('notificationclick', event => {
  const handleNotificationClick = async () => {
    event.notification.close();
    const { data } = event.notification;
    const urlToOpen = data?.url || '/';
    
    try {
      const clients = await self.clients.matchAll({ 
        type: 'window', 
        includeUncontrolled: true 
      });
      
      // Handle different actions
      switch (event.action) {
        case 'view':
        case undefined:
          // Check for existing client
          const focusedClient = clients.find(client => 
            client.url.includes(urlToOpen)
          );
          
          if (focusedClient) {
            await focusedClient.focus();
          } else {
            await self.clients.openWindow(urlToOpen);
          }
          break;
          
        case 'dismiss':
          // No action needed beyond closing
          break;
      }
      
      // Mark as read in all cases
      if (data?.id) {
        clients.forEach(client => {
          client.postMessage({
            type: 'MARK_NOTIFICATION_READ',
            notificationId: data.id
          });
        });
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  event.waitUntil(handleNotificationClick());
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('Notification closed:', event.notification.tag);
  const { data } = event.notification;
  
  if (data?.id) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NOTIFICATION_CLOSED',
          notificationId: data.id
        });
      });
    });
  }
});

// Message handler from main thread
self.addEventListener('message', event => {
  const { data, ports } = event;
  
  const respond = (response) => {
    if (ports?.[0]) {
      ports[0].postMessage(response);
    }
  };

  const handleMessage = async () => {
    try {
      switch (data?.type) {
        case 'SHOW_NOTIFICATION':
          const { title, body, options = {} } = data;
          const notificationOptions = {
            body,
            icon: options.icon || DEFAULT_ICON,
            badge: options.badge || DEFAULT_BADGE,
            tag: options.tag || `mcm-manual-${Date.now()}`,
            requireInteraction: ['high', 'urgent'].includes(options.priority),
            vibrate: ['high', 'urgent'].includes(options.priority) 
              ? [300, 100, 300] 
              : [200, 100, 200],
            actions: DEFAULT_ACTIONS,
            data: {
              url: '/',
              timestamp: Date.now(),
              ...options.data
            },
            ...options
          };
          
          await self.registration.showNotification(title, notificationOptions);
          console.log('Manual notification displayed successfully');
          respond({ success: true });
          break;
          
        case 'SKIP_WAITING':
          self.skipWaiting();
          respond({ success: true });
          break;
          
        default:
          respond({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      respond({ success: false, error: error.message });
    }
  };

  handleMessage();
});

// Background sync for offline notifications
self.addEventListener('sync', event => {
  if (event.tag === 'notification-sync') {
    const handleSync = async () => {
      try {
        const response = await fetch('/api/notifications/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastSync: Date.now() })
        });
        
        const data = await response.json();
        console.log('Background sync completed:', data);
        
        if (data.notifications?.length > 0) {
          await Promise.all(
            data.notifications.map(notification => 
              self.registration.showNotification(notification.title, {
                body: notification.body || notification.message,
                icon: DEFAULT_ICON,
                badge: DEFAULT_BADGE,
                tag: `mcm-sync-${Date.now()}`,
                data: { 
                  ...notification,
                  url: '/',
                  timestamp: Date.now()
                }
              })
            )
          );
        }
      } catch (error) {
        console.error('Background sync failed:', error);
      }
    };

    event.waitUntil(handleSync());
  }
});

// Periodic sync for updates (requires Periodic Background Sync API)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'notification-update') {
    console.log('Periodic sync for notifications');
    // Implement your periodic sync logic here
  }
});

console.log('MCM Alerts Service Worker initialized with enhanced features');
