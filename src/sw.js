// src/sw.js
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// This is required for Workbox to inject the manifest
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Take control immediately
self.skipWaiting();
clientsClaim();

console.log('MCM Alerts Service Worker loaded with enhanced push notification support');

// Enhanced push notification handler
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  
  let notificationData = {
    title: 'MCM Alert',
    body: 'New notification received',
    icon: '/mcm-logo-192.png',
    badge: '/mcm-logo-192.png',
    tag: 'mcm-notification',
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
      const pushData = event.data.json();
      console.log('Push data received:', pushData);
      
      notificationData = {
        ...notificationData,
        title: pushData.title || notificationData.title,
        body: pushData.message || pushData.body || notificationData.body,
        data: { 
          ...notificationData.data, 
          ...pushData.data,
          type: pushData.type,
          priority: pushData.priority,
          site: pushData.site,
          id: pushData.id || `push-${Date.now()}`
        }
      };
      
      // Set priority-based options
      if (pushData.priority === 'high' || pushData.priority === 'urgent') {
        notificationData.requireInteraction = true;
        notificationData.vibrate = [300, 100, 300, 100, 300];
        notificationData.tag = `mcm-urgent-${Date.now()}`;
      } else if (pushData.priority === 'low') {
        notificationData.vibrate = [100];
        notificationData.tag = `mcm-low-${Date.now()}`;
      } else {
        notificationData.vibrate = [200, 100, 200];
        notificationData.tag = `mcm-medium-${Date.now()}`;
      }
    } catch (error) {
      console.error('Error parsing push data:', error);
    }
  }

  event.waitUntil(
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
      console.log('Push notification displayed successfully');
      
      // Notify all clients about the new notification
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_RECEIVED',
            notificationData: notificationData,
            timestamp: Date.now()
          });
        });
      });
    }).catch(error => {
      console.error('Failed to show push notification:', error);
    })
  );
});

// Enhanced notification click handler
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  const notificationId = event.notification.data?.id;
  
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // Check if app is already open
          for (const client of clientList) {
            if (client.url.includes(urlToOpen)) {
              // Send message to mark notification as read
              if (notificationId) {
                client.postMessage({
                  type: 'MARK_NOTIFICATION_READ',
                  notificationId: notificationId
                });
              }
              return client.focus();
            }
          }
          // Open new window if none found
          return clients.openWindow(urlToOpen);
        })
        .catch(error => {
          console.error('Error handling notification click:', error);
        })
    );
  } else if (event.action === 'dismiss') {
    // Send message to clients to mark as read
    if (notificationId) {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'MARK_NOTIFICATION_READ',
            notificationId: notificationId
          });
        });
      });
    }
  }
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('Notification closed:', event.notification.tag);
  
  const notificationId = event.notification.data?.id;
  if (notificationId) {
    // Optionally mark as read when closed
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NOTIFICATION_CLOSED',
          notificationId: notificationId
        });
      });
    });
  }
});

// Enhanced message handler from main thread
self.addEventListener('message', event => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, options = {} } = event.data;
    
    const notificationOptions = {
      body,
      icon: options.icon || '/mcm-logo-192.png',
      badge: options.badge || '/mcm-logo-192.png',
      tag: options.tag || `mcm-manual-${Date.now()}`,
      requireInteraction: options.priority === 'high' || options.priority === 'urgent',
      vibrate: options.priority === 'high' || options.priority === 'urgent' 
        ? [300, 100, 300] 
        : [200, 100, 200],
      actions: [
        { action: 'view', title: 'View Dashboard', icon: '/mcm-logo-192.png' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: {
        url: '/',
        timestamp: Date.now(),
        ...options.data
      },
      ...options
    };
    
    self.registration.showNotification(title, notificationOptions)
      .then(() => {
        console.log('Manual notification displayed successfully');
        if (event.ports?.[0]) {
          event.ports[0].postMessage({ success: true });
        }
      })
      .catch(error => {
        console.error('Failed to show manual notification:', error);
        if (event.ports?.[0]) {
          event.ports[0].postMessage({ success: false, error: error.message });
        }
      });
  }
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for offline notifications (optional)
self.addEventListener('sync', event => {
  if (event.tag === 'notification-sync') {
    event.waitUntil(
      fetch('/api/notifications/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastSync: Date.now() })
      })
      .then(response => response.json())
      .then(data => {
        console.log('Background sync completed:', data);
        
        if (data.notifications?.length > 0) {
          return Promise.all(
            data.notifications.map(notification => 
              self.registration.showNotification(notification.title, {
                body: notification.body || notification.message,
                icon: '/mcm-logo-192.png',
                badge: '/mcm-logo-192.png',
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
      })
      .catch(error => {
        console.error('Background sync failed:', error);
      })
    );
  }
});

console.log('MCM Alerts Service Worker initialized with full notification support');
