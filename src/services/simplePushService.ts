// src/services/simplePushService.ts
export interface SimpleNotification {
  id: string;
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: string;
  type?: string;
  data?: any;
}

class SimplePushService {
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private listeners: ((notification: SimpleNotification) => void)[] = [];
  private isInitialized = false;

  // Replace with your actual VAPID public key
  private readonly vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjqAKeFXjWWqlaGSb0TSa1TCEdqNB0NDrWJZnIa5oZUMoMJpE';

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications not supported');
        return false;
      }

      // Register service worker
      this.registration = await navigator.serviceWorker.register('/service-worker.js');
      await navigator.serviceWorker.ready;

      // Listen for messages
      navigator.serviceWorker.addEventListener('message', this.handleMessage.bind(this));

      this.isInitialized = true;
      console.log('Push service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize push service:', error);
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  async subscribe(): Promise<boolean> {
    if (!this.registration) return false;

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      let subscription = await this.registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await this.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
        });
      }

      this.subscription = subscription;
      await this.sendSubscriptionToServer(subscription);
      
      console.log('Successfully subscribed to push notifications');
      return true;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      return false;
    }
  }

  async unsubscribe(): Promise<boolean> {
    if (!this.subscription) return false;

    try {
      const success = await this.subscription.unsubscribe();
      if (success) {
        this.subscription = null;
        await this.removeSubscriptionFromServer();
      }
      return success;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    }
  }

  addListener(callback: (notification: SimpleNotification) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  async sendTestNotification(priority: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
    if (!this.registration) return;

    const notification = {
      title: `Test ${priority.toUpperCase()} Priority`,
      body: `This is a test ${priority} priority notification`,
      icon: '/mcm-logo-192.png',
      badge: '/mcm-logo-192.png',
      tag: `test-${Date.now()}`,
      requireInteraction: priority === 'high',
      vibrate: priority === 'high' ? [300, 100, 300] : [200, 100, 200],
      data: { 
        url: '/',
        priority,
        timestamp: Date.now()
      }
    };

    await this.registration.showNotification(notification.title, notification);
  }

  private handleMessage(event: MessageEvent) {
    if (event.data?.type === 'PUSH_RECEIVED') {
      const notificationData = event.data.notification;
      const notification: SimpleNotification = {
        id: `push-${Date.now()}`,
        title: notificationData.title,
        body: notificationData.body,
        priority: notificationData.priority || 'medium',
        timestamp: new Date().toISOString(),
        type: notificationData.type,
        data: notificationData.data
      };

      this.listeners.forEach(listener => {
        try {
          listener(notification);
        } catch (error) {
          console.error('Error in notification listener:', error);
        }
      });
    }
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    try {
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')),
            auth: this.arrayBufferToBase64(subscription.getKey('auth'))
          }
        })
      });

      if (!response.ok) {
        console.warn('Failed to send subscription to server - continuing anyway');
      }
    } catch (error) {
      console.warn('Error sending subscription to server:', error);
    }
  }

  private async removeSubscriptionFromServer(): Promise<void> {
    try {
      await fetch('/api/push/unsubscribe', { method: 'POST' });
    } catch (error) {
      console.warn('Error removing subscription from server:', error);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | null): string {
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasSubscription: !!this.subscription,
      permissionGranted: Notification.permission === 'granted',
      listenersCount: this.listeners.length
    };
  }
}

export const simplePushService = new SimplePushService();
