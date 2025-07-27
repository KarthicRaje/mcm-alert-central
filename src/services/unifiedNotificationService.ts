// src/services/unifiedNotificationService.ts
import { createClient } from '@supabase/supabase-js'

// Enhanced environment variable handling
const getSupabaseConfig = () => {
  const supabaseUrl = 
    import.meta.env?.VITE_APP_SUPABASE_URL ||
    import.meta.env?.VITE_SUPABASE_URL ||
    process.env?.VITE_APP_SUPABASE_URL ||
    process.env?.VITE_SUPABASE_URL ||
    ''

  const supabaseAnonKey = 
    import.meta.env?.VITE_APP_SUPABASE_ANON_KEY ||
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    process.env?.VITE_APP_SUPABASE_ANON_KEY ||
    process.env?.VITE_SUPABASE_ANON_KEY ||
    ''

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase configuration missing - running in local-only mode')
    return null
  }

  return { supabaseUrl, supabaseAnonKey }
}

// Initialize Supabase client
let supabase: any = null
const supabaseConfig = getSupabaseConfig()

if (supabaseConfig) {
  try {
    supabase = createClient(supabaseConfig.supabaseUrl, supabaseConfig.supabaseAnonKey)
    console.log('Supabase client initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error)
  }
} else {
  console.warn('Supabase not configured - notifications will work in local-only mode')
}

export interface UnifiedNotification {
  id: string
  user_id?: string
  title: string
  message?: string
  body?: string
  type: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  site?: string
  is_read: boolean
  acknowledged?: boolean
  action_url?: string
  metadata?: any
  timestamp: string
  created_at: string
  updated_at?: string
  expires_at?: string
}

export interface NotificationListener {
  (notification: UnifiedNotification): void
}

export class UnifiedNotificationService {
  // Service Worker and Push
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null
  private pushSubscription: PushSubscription | null = null
  
  // Supabase real-time
  private supabaseSubscription: any = null
  private isSupabaseConnected = false
  private isSupabaseAvailable = !!supabase

  // Event listeners
  private inAppListeners: NotificationListener[] = []
  private pushListeners: NotificationListener[] = []

  // State management
  private isInitialized = false
  private localNotifications: UnifiedNotification[] = []

  // VAPID public key - replace with your actual key
  private readonly vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjqAKeFXjWWqlaGSb0TSa1TCEdqNB0NDrWJZnIa5oZUMoMJpE'

  constructor() {
    this.setupVisibilityChangeHandler()
  }

  // ===========================================
  // INITIALIZATION METHODS
  // ===========================================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('UnifiedNotificationService already initialized')
      return true
    }

    console.log('Initializing unified notification service...')
    
    try {
      // Initialize both systems in parallel
      const [pushResult, supabaseResult] = await Promise.allSettled([
        this.initializePushNotifications(),
        this.isSupabaseAvailable ? this.initializeSupabase() : Promise.resolve(false)
      ])

      const pushSuccess = pushResult.status === 'fulfilled' && pushResult.value
      const supabaseSuccess = supabaseResult.status === 'fulfilled' && supabaseResult.value

      this.isInitialized = true
      console.log(`Unified notification service initialized - Push: ${pushSuccess}, Supabase: ${supabaseSuccess}`)
      
      return pushSuccess || supabaseSuccess
    } catch (error) {
      console.error('Failed to initialize notification service:', error)
      return false
    }
  }

  private async initializePushNotifications(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported')
      return false
    }

    try {
      console.log('Initializing push notifications...')

      // Register service worker
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      console.log('Service Worker registered:', this.serviceWorkerRegistration.scope)

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this))

      console.log('Push notification system ready')
      return true
    } catch (error) {
      console.error('Push notification initialization failed:', error)
      return false
    }
  }

  private async initializeSupabase(): Promise<boolean> {
    if (!this.isSupabaseAvailable) {
      console.warn('Skipping Supabase initialization - not configured')
      return false
    }

    console.log('Initializing Supabase real-time notifications...')
    
    try {
      // Test connection
      const { data, error } = await supabase.from('notifications').select('count').limit(1)
      if (error) {
        throw new Error(`Supabase connection test failed: ${error.message}`)
      }

      // Subscribe to real-time notifications
      this.supabaseSubscription = supabase
        .channel('unified-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
          },
          (payload) => {
            console.log('New notification from Supabase:', payload.new)
            this.handleInAppNotification(payload.new as UnifiedNotification)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications'
          },
          (payload) => {
            console.log('Notification updated:', payload.new)
            this.handleNotificationUpdate(payload.new as UnifiedNotification)
          }
        )
        .subscribe((status) => {
          console.log('Supabase subscription status:', status)
          this.isSupabaseConnected = status === 'SUBSCRIBED'
        })

      return true
    } catch (error) {
      console.error('Supabase initialization failed:', error)
      return false
    }
  }

  // ===========================================
  // NOTIFICATION HANDLERS
  // ===========================================

  private handleInAppNotification(notification: UnifiedNotification) {
    console.log('Processing in-app notification:', notification)
    
    // Store locally
    this.localNotifications.unshift(notification)
    if (this.localNotifications.length > 100) {
      this.localNotifications = this.localNotifications.slice(0, 100)
    }
    
    // Notify listeners
    this.inAppListeners.forEach(listener => {
      try {
        listener(notification)
      } catch (error) {
        console.error('Error in in-app listener:', error)
      }
    })

    // Show browser notification if permitted and page not visible
    if (document.visibilityState === 'hidden') {
      this.showBrowserNotification(notification)
    }
  }

  private handleNotificationUpdate(updatedNotification: UnifiedNotification) {
    const index = this.localNotifications.findIndex(n => n.id === updatedNotification.id)
    if (index !== -1) {
      this.localNotifications[index] = updatedNotification
    }

    this.inAppListeners.forEach(listener => {
      try {
        listener(updatedNotification)
      } catch (error) {
        console.error('Error in update listener:', error)
      }
    })
  }

  private handleServiceWorkerMessage(event: MessageEvent) {
    console.log('Message from service worker:', event.data)
    
    if (event.data?.type === 'PUSH_NOTIFICATION_RECEIVED') {
      const notification: UnifiedNotification = {
        id: event.data.notificationData.data?.id || `push-${Date.now()}`,
        title: event.data.notificationData.title,
        message: event.data.notificationData.body,
        type: event.data.notificationData.data?.type || 'push',
        priority: event.data.notificationData.data?.priority || 'medium',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_read: false,
        site: event.data.notificationData.data?.site,
        ...event.data.notificationData.data
      }
      
      // Store locally
      this.localNotifications.unshift(notification)
      
      // Notify push listeners
      this.pushListeners.forEach(listener => {
        try {
          listener(notification)
        } catch (error) {
          console.error('Error in push listener:', error)
        }
      })
    } else if (event.data?.type === 'MARK_NOTIFICATION_READ') {
      this.markAsRead(event.data.notificationId).catch(console.error)
    }
  }

  // ===========================================
  // BROWSER NOTIFICATION METHODS
  // ===========================================

  private async showBrowserNotification(notification: UnifiedNotification) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    try {
      if (this.serviceWorkerRegistration) {
        await this.serviceWorkerRegistration.showNotification(notification.title, {
          body: notification.message || notification.body || 'New notification',
          icon: '/mcm-logo-192.png',
          badge: '/mcm-logo-192.png',
          tag: `mcm-${notification.id}`,
          requireInteraction: notification.priority === 'high' || notification.priority === 'urgent',
          vibrate: notification.priority === 'high' ? [300, 100, 300] : [200, 100, 200],
          data: {
            id: notification.id,
            url: notification.action_url || '/',
            priority: notification.priority
          }
        })
      }
    } catch (error) {
      console.error('Failed to show browser notification:', error)
    }
  }

  // ===========================================
  // PERMISSION & SUBSCRIPTION METHODS
  // ===========================================

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false

    try {
      const permission = await Notification.requestPermission()
      console.log('Notification permission result:', permission)
      return permission === 'granted'
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      return false
    }
  }

  async subscribeToPush(): Promise<PushSubscription | null> {
    if (!this.serviceWorkerRegistration) {
      console.error('Service worker not registered')
      return null
    }

    try {
      // Request permission first
      const hasPermission = await this.requestNotificationPermission()
      if (!hasPermission) {
        throw new Error('Notification permission denied')
      }

      // Check for existing subscription
      let subscription = await this.serviceWorkerRegistration.pushManager.getSubscription()
      
      if (!subscription) {
        // Create new subscription
        subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
        })
      }

      this.pushSubscription = subscription
      
      // Send subscription to server
      await this.sendSubscriptionToServer(subscription)
      
      console.log('Successfully subscribed to push notifications')
      return subscription
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      return null
    }
  }

  async unsubscribeFromPush(): Promise<boolean> {
    if (!this.pushSubscription) return false

    try {
      const success = await this.pushSubscription.unsubscribe()
      if (success) {
        this.pushSubscription = null
        await this.removeSubscriptionFromServer()
        console.log('Successfully unsubscribed from push notifications')
      }
      return success
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
      return false
    }
  }

  // ===========================================
  // DATABASE OPERATIONS
  // ===========================================

  async getNotifications(limit = 50, offset = 0, unreadOnly = false) {
    if (!this.isSupabaseAvailable) {
      let filtered = [...this.localNotifications]
      if (unreadOnly) {
        filtered = filtered.filter(n => !n.is_read)
      }
      return filtered.slice(offset, offset + limit)
    }

    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1)

      if (unreadOnly) {
        query = query.eq('is_read', false)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      return []
    }
  }

  async markAsRead(notificationId: string) {
    // Update local state
    const localIndex = this.localNotifications.findIndex(n => n.id === notificationId)
    if (localIndex !== -1) {
      this.localNotifications[localIndex].is_read = true
    }

    if (!this.isSupabaseAvailable) {
      console.log('Marked notification as read locally:', notificationId)
      return
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true, 
          acknowledged: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId)

      if (error) throw error
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
      throw error
    }
  }

  async markAllAsRead() {
    // Update local state
    this.localNotifications.forEach(n => {
      n.is_read = true
    })

    if (!this.isSupabaseAvailable) {
      console.log('Marked all notifications as read locally')
      return
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true, 
          acknowledged: true,
          updated_at: new Date().toISOString()
        })
        .eq('is_read', false)

      if (error) throw error
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
      throw error
    }
  }

  async getUnreadCount() {
    if (!this.isSupabaseAvailable) {
      return this.localNotifications.filter(n => !n.is_read).length
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)

      if (error) throw error
      return count || 0
    } catch (error) {
      console.error('Failed to get unread count:', error)
      return 0
    }
  }

  // ===========================================
  // TEST METHODS
  // ===========================================

  async sendTestNotification(priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium', pushOnly = false) {
    const testNotification: UnifiedNotification = {
      id: `test-${Date.now()}`,
      title: `Test ${priority.toUpperCase()} Priority Alert`,
      message: `This is a test notification with ${priority} priority level.`,
      type: 'test',
      priority,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_read: false
    }

    if (pushOnly && this.serviceWorkerRegistration) {
      // Send via service worker
      const channel = new MessageChannel()
      this.serviceWorkerRegistration.active?.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: testNotification.title,
        body: testNotification.message,
        options: {
          priority: testNotification.priority,
          data: testNotification
        }
      }, [channel.port2])
    } else {
      // Process as in-app notification
      this.handleInAppNotification(testNotification)
    }
  }

  // ===========================================
  // LISTENER MANAGEMENT
  // ===========================================

  addInAppListener(callback: NotificationListener): () => void {
    this.inAppListeners.push(callback)
    return () => {
      this.inAppListeners = this.inAppListeners.filter(l => l !== callback)
    }
  }

  addPushListener(callback: NotificationListener): () => void {
    this.pushListeners.push(callback)
    return () => {
      this.pushListeners = this.pushListeners.filter(l => l !== callback)
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  private setupVisibilityChangeHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Check for missed notifications when app becomes visible
        console.log('App became visible - checking for missed notifications')
      }
    })
  }

  private async sendSubscriptionToServer(subscription: PushSubscription) {
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
      })

      if (!response.ok) {
        throw new Error('Failed to send subscription to server')
      }
    } catch (error) {
      console.error('Error sending subscription to server:', error)
    }
  }

  private async removeSubscriptionFromServer() {
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error removing subscription from server:', error)
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | null): string {
    if (!buffer) return ''
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  // ===========================================
  // STATUS & CLEANUP
  // ===========================================

  getConnectionStatus() {
    return {
      isInitialized: this.isInitialized,
      supabase: {
        isConnected: this.isSupabaseConnected,
        isAvailable: this.isSupabaseAvailable
      },
      push: {
        serviceWorkerRegistered: !!this.serviceWorkerRegistration,
        pushSubscribed: !!this.pushSubscription,
        supported: 'serviceWorker' in navigator && 'PushManager' in window
      },
      listeners: {
        inApp: this.inAppListeners.length,
        push: this.pushListeners.length
      },
      localNotifications: this.localNotifications.length,
      permissionGranted: Notification.permission === 'granted'
    }
  }

  disconnect() {
    console.log('Disconnecting notification service...')
    
    // Cleanup Supabase
    if (this.supabaseSubscription && this.isSupabaseAvailable) {
      supabase.removeChannel(this.supabaseSubscription)
      this.supabaseSubscription = null
    }
    this.isSupabaseConnected = false

    // Clear listeners
    this.inAppListeners = []
    this.pushListeners = []
    this.isInitialized = false
  }
}

// Create singleton instance
export const unifiedNotificationService = new UnifiedNotificationService()
