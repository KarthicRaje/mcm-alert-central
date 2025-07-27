// src/services/unifiedNotificationService.ts
import { createClient } from '@supabase/supabase-js'

// Enhanced environment variable handling with fallbacks and validation
const getSupabaseConfig = () => {
  const supabaseUrl = 
    import.meta.env?.VITE_APP_SUPABASE_URL ||
    import.meta.env?.VITE_SUPABASE_URL ||
    process.env?.VITE_APP_SUPABASE_URL ||
    process.env?.VITE_SUPABASE_URL ||
    process.env?.REACT_APP_SUPABASE_URL ||
    ''

  const supabaseAnonKey = 
    import.meta.env?.VITE_APP_SUPABASE_ANON_KEY ||
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    process.env?.VITE_APP_SUPABASE_ANON_KEY ||
    process.env?.VITE_SUPABASE_ANON_KEY ||
    process.env?.REACT_APP_SUPABASE_ANON_KEY ||
    ''

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase configuration missing. Available env vars:', Object.keys(import.meta.env || {}))
    return null
  }

  return { supabaseUrl, supabaseAnonKey }
}

// Initialize Supabase client with error handling
let supabase: any = null
const supabaseConfig = getSupabaseConfig()

if (supabaseConfig) {
  try {
    supabase = createClient(supabaseConfig.supabaseUrl, supabaseConfig.supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
          heartbeatIntervalMs: 10000
        }
      }
    })
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
  // Supabase real-time connection
  private supabaseSubscription: any = null
  private isSupabaseConnected = false
  private supabaseRetryCount = 0
  private maxRetries = 5
  private retryTimeout: NodeJS.Timeout | null = null
  private isSupabaseAvailable = !!supabase

  // Service Worker for push notifications
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null
  private pushSubscription: PushSubscription | null = null
  private audioContext: AudioContext | null = null

  // Event listeners
  private inAppListeners: NotificationListener[] = []
  private pushListeners: NotificationListener[] = []
  private pushNotificationHandlers: ((notification: any) => void)[] = []

  // State management
  private isInitialized = false
  private isStackBlitz = false
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  private backgroundSyncRegistered = false

  // Local storage for notifications when Supabase is not available
  private localNotifications: UnifiedNotification[] = []

  constructor() {
    this.isStackBlitz = window.location.hostname.includes('stackblitz') ||
                        window.location.hostname.includes('webcontainer') ||
                        (window.location.hostname === 'localhost' && window.location.port === '8080')
    
    this.initializeAudio()
    this.setupVisibilityChangeHandler()
  }

  // ===========================================
  // INITIALIZATION METHODS
  // ===========================================

  async initialize() {
    if (this.isInitialized) {
      console.log('[UnifiedNotificationService] Already initialized')
      return
    }

    console.log('[UnifiedNotificationService] Initializing unified notification service...')
    
    try {
      // Initialize both in-app and push notifications in parallel
      const initPromises = [
        this.initializePushNotifications(),
        this.isSupabaseAvailable ? this.initializeInAppNotifications() : Promise.resolve()
      ]

      await Promise.allSettled(initPromises)

      // Check for missed notifications if we just came online
      if (navigator.onLine) {
        this.checkForMissedNotifications()
      }

      this.isInitialized = true
      console.log('[UnifiedNotificationService] Successfully initialized notification service')
    } catch (error) {
      console.error('[UnifiedNotificationService] Initialization failed:', error)
    }
  }

  private async initializeInAppNotifications() {
    if (!this.isSupabaseAvailable) {
      console.warn('[UnifiedNotificationService] Skipping Supabase initialization - not configured')
      return
    }

    console.log('[UnifiedNotificationService] Initializing in-app notifications via Supabase...')
    this.connectionState = 'connecting'
    
    try {
      // Test Supabase connection first
      const { data, error } = await supabase.from('notifications').select('count').limit(1)
      if (error) {
        throw new Error(`Supabase connection test failed: ${error.message}`)
      }

      // Subscribe to real-time notifications with enhanced configuration
      this.supabaseSubscription = supabase
        .channel('unified-notifications-channel', {
          config: {
            broadcast: { ack: true },
            presence: { key: 'unified-notifications' }
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'user_id=eq.' + (this.getCurrentUserId() || 'null')
          },
          (payload) => {
            console.log('[UnifiedNotificationService] New notification received from Supabase:', payload.new)
            const notification = payload.new as UnifiedNotification
            this.handleInAppNotification(notification)
            this.storeLastNotificationTime()
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: 'user_id=eq.' + (this.getCurrentUserId() || 'null')
          },
          (payload) => {
            console.log('[UnifiedNotificationService] Notification updated:', payload.new)
            this.handleNotificationUpdate(payload.new)
          }
        )
        .subscribe((status, err) => {
          console.log('[UnifiedNotificationService] Supabase subscription status:', status, err)
          
          if (status === 'SUBSCRIBED') {
            this.connectionState = 'connected'
            this.isSupabaseConnected = true
            this.supabaseRetryCount = 0
            console.log('[UnifiedNotificationService] Supabase real-time connection established')
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.connectionState = 'error'
            this.isSupabaseConnected = false
            console.error('[UnifiedNotificationService] Supabase connection error:', err)
            this.handleSupabaseConnectionError(err)
          } else if (status === 'CLOSED') {
            this.connectionState = 'disconnected'
            this.isSupabaseConnected = false
            console.log('[UnifiedNotificationService] Supabase connection closed')
          }
        })

    } catch (error) {
      console.error('[UnifiedNotificationService] Supabase initialization failed:', error)
      this.handleSupabaseConnectionError(error as Error)
    }
  }

  private async initializePushNotifications() {
    if (this.isStackBlitz) {
      console.warn('[UnifiedNotificationService] Push notifications not supported in this environment')
      return
    }

    if (!('serviceWorker' in navigator)) {
      console.warn('[UnifiedNotificationService] Service Worker not supported')
      return
    }

    try {
      console.log('[UnifiedNotificationService] Initializing push notifications...')

      // Register service worker with updated scope
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      console.log('[UnifiedNotificationService] Service Worker registered:', this.serviceWorkerRegistration)

      // Wait for service worker to be ready
      const registration = await navigator.serviceWorker.ready
      
      // Add event listeners
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this))
      
      // Register periodic sync for background updates (every 12 hours)
      if ('periodicSync' in registration) {
        try {
          await (registration as any).periodicSync.register('notification-update', {
            minInterval: 12 * 60 * 60 * 1000 // 12 hours
          })
          console.log('[UnifiedNotificationService] Periodic Sync registered')
        } catch (error) {
          console.warn('[UnifiedNotificationService] Periodic Sync registration failed:', error)
        }
      }

      // Register background sync
      await this.registerBackgroundSync()

      console.log('[UnifiedNotificationService] Push notification system ready')
    } catch (error) {
      console.error('[UnifiedNotificationService] Push notification initialization failed:', error)
    }
  }

  private initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.warn('[UnifiedNotificationService] Audio context not supported:', error)
    }
  }

  private setupVisibilityChangeHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkForMissedNotifications()
      }
    })
  }

  // ===========================================
  // BACKGROUND SYNC & MISSED NOTIFICATION HANDLING
  // ===========================================

  private async registerBackgroundSync() {
    if (!('serviceWorker' in navigator)) return
    if (!('SyncManager' in window)) {
      console.warn('[UnifiedNotificationService] Background Sync API not supported')
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      await registration.sync.register('notification-sync')
      this.backgroundSyncRegistered = true
      console.log('[UnifiedNotificationService] Background Sync registered')
    } catch (error) {
      console.error('[UnifiedNotificationService] Background Sync registration failed:', error)
    }
  }

  private async checkForMissedNotifications() {
    if (!this.isSupabaseAvailable) return

    try {
      const lastSeen = localStorage.getItem('lastNotificationSeen')
      const lastSeenDate = lastSeen ? new Date(lastSeen) : new Date(0)

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .gt('created_at', lastSeenDate.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        console.log(`[UnifiedNotificationService] Found ${data.length} missed notifications`)
        data.forEach(notification => {
          this.handleInAppNotification(notification)
        })
        this.storeLastNotificationTime()
      }
    } catch (error) {
      console.error('[UnifiedNotificationService] Error checking for missed notifications:', error)
    }
  }

  private storeLastNotificationTime() {
    localStorage.setItem('lastNotificationSeen', new Date().toISOString())
  }

  // ===========================================
  // NOTIFICATION HANDLERS
  // ===========================================

  private handleInAppNotification(notification: UnifiedNotification) {
    console.log('[UnifiedNotificationService] Processing in-app notification:', notification)
    
    // Store locally
    this.localNotifications.unshift(notification)
    if (this.localNotifications.length > 100) {
      this.localNotifications = this.localNotifications.slice(0, 100)
    }
    
    // Notify in-app listeners
    this.inAppListeners.forEach(listener => {
      try {
        listener(notification)
      } catch (error) {
        console.error('[UnifiedNotificationService] Error in in-app listener:', error)
      }
    })

    // Show browser notification if permitted
    this.showBrowserNotification(notification)
    
    // Play sound
    this.playNotificationSound(notification.priority)
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
        console.error('[UnifiedNotificationService] Error in update listener:', error)
      }
    })
  }

  private handleServiceWorkerMessage(event: MessageEvent) {
    if (event.data?.type === 'PUSH_NOTIFICATION_RECEIVED') {
      const notificationData = event.data.notificationData
      const notification: UnifiedNotification = {
        id: `push-${Date.now()}`,
        type: notificationData.type || 'push',
        priority: notificationData.priority || 'medium',
        title: notificationData.title || 'MCM Alert',
        message: notificationData.body || notificationData.message || 'New notification',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_read: false,
        acknowledged: false,
        ...notificationData
      }
      
      console.log('[UnifiedNotificationService] Received push notification:', notification)
      
      // Store locally
      this.localNotifications.unshift(notification)
      
      // Notify push listeners
      this.pushListeners.forEach(listener => {
        try {
          listener(notification)
        } catch (error) {
          console.error('[UnifiedNotificationService] Error in push listener:', error)
        }
      })

      // Notify push handlers (for when app is closed)
      this.pushNotificationHandlers.forEach(handler => {
        try {
          handler(notification)
        } catch (error) {
          console.error('[UnifiedNotificationService] Error in push handler:', error)
        }
      })
    } else if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
      this.playNotificationSound(event.data.priority)
    } else if (event.data?.type === 'SYNCED_NOTIFICATION') {
      this.handleInAppNotification(event.data.notification)
    }
  }

  // ===========================================
  // NOTIFICATION DISPLAY METHODS
  // ===========================================

  private async showBrowserNotification(notification: UnifiedNotification) {
    if (!('Notification' in window)) return

    try {
      // Try service worker notification first (better for mobile)
      if (this.serviceWorkerRegistration) {
        await this.showServiceWorkerNotification(notification)
      } else {
        // Fallback to direct browser notification
        this.showDirectBrowserNotification(notification)
      }

      this.storeLastNotificationTime()
    } catch (error) {
      console.error('[UnifiedNotificationService] Failed to show browser notification:', error)
    }
  }

  private async showServiceWorkerNotification(notification: UnifiedNotification) {
    if (!this.serviceWorkerRegistration) return

    const registration = await navigator.serviceWorker.ready

    const options = {
      body: notification.message || notification.body || 'New notification',
      icon: '/mcm-logo-192.png',
      badge: '/mcm-logo-192.png',
      tag: `mcm-${notification.id}`,
      renotify: true,
      requireInteraction: notification.priority === 'high' || notification.priority === 'urgent',
      silent: false,
      vibrate: notification.priority === 'high' ? [300, 100, 300, 100, 300] : [200, 100, 200],
      data: {
        id: notification.id,
        action_url: notification.action_url,
        priority: notification.priority,
        timestamp: Date.now(),
        notificationData: notification // Include full notification data
      }
    }

    await registration.showNotification(notification.title, options)
  }

  private showDirectBrowserNotification(notification: UnifiedNotification) {
    const browserNotification = new Notification(notification.title, {
      body: notification.message || notification.body || 'New notification',
      icon: '/mcm-logo-192.png',
      tag: `mcm-${notification.id}`,
      requireInteraction: notification.priority === 'high' || notification.priority === 'urgent',
      data: {
        id: notification.id,
        action_url: notification.action_url,
        priority: notification.priority
      }
    })

    browserNotification.onclick = () => {
      window.focus()
      if (notification.action_url) {
        window.location.href = notification.action_url
      }
      browserNotification.close()
      
      this.markAsRead(notification.id).catch(console.error)
    }

    if (notification.priority !== 'high' && notification.priority !== 'urgent') {
      setTimeout(() => {
        browserNotification.close()
      }, 5000)
    }
  }

  private async playNotificationSound(priority: 'low' | 'medium' | 'high' | 'urgent') {
    try {
      if (!this.audioContext) return

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      const frequency = priority === 'high' || priority === 'urgent' ? 800 : 
                        priority === 'medium' ? 600 : 400
      const duration = priority === 'high' || priority === 'urgent' ? 1000 : 500

      const oscillator = this.audioContext.createOscillator()
      const gainNode = this.audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(this.audioContext.destination)

      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime)
      oscillator.type = 'sine'

      const volume = priority === 'high' || priority === 'urgent' ? 0.3 : 
                     priority === 'medium' ? 0.2 : 0.1
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000)

      oscillator.start(this.audioContext.currentTime)
      oscillator.stop(this.audioContext.currentTime + duration / 1000)

      console.log(`[UnifiedNotificationService] Played ${priority} priority notification sound`)
    } catch (error) {
      console.error('[UnifiedNotificationService] Failed to play notification sound:', error)
    }
  }

  // ===========================================
  // PERMISSION & SUBSCRIPTION MANAGEMENT
  // ===========================================

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('[UnifiedNotificationService] Browser notifications not supported')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      console.log('[UnifiedNotificationService] Notification permission result:', permission)
      return permission === 'granted'
    } catch (error) {
      console.error('[UnifiedNotificationService] Error requesting notification permission:', error)
      return false
    }
  }

  async subscribeToPush(): Promise<PushSubscription | null> {
    if (this.isStackBlitz || !this.serviceWorkerRegistration) {
      console.log('[UnifiedNotificationService] Push subscriptions not available')
      return null
    }

    try {
      const hasPermission = await this.requestNotificationPermission()
      if (!hasPermission) {
        throw new Error('Notification permission not granted')
      }

      let subscription = await this.serviceWorkerRegistration.pushManager.getSubscription()
      
      if (!subscription) {
        subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlB64ToUint8Array(
            'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjqAKeFXjWWqlaGSb0TSa1TCEdqNB0NDrWJZnIa5oZUMoMJpE'
          )
        })
      }
      
      console.log('[UnifiedNotificationService] Push subscription:', subscription)
      
      await this.sendSubscriptionToBackend(subscription)
      
      this.pushSubscription = subscription
      
      return subscription
    } catch (error) {
      console.error('[UnifiedNotificationService] Failed to subscribe to push notifications:', error)
      return null
    }
  }

  async unsubscribeFromPush(): Promise<boolean> {
    if (!this.pushSubscription) {
      console.log('[UnifiedNotificationService] No active push subscription to unsubscribe')
      return false
    }

    try {
      const success = await this.pushSubscription.unsubscribe()
      if (success) {
        this.pushSubscription = null
        await this.removeSubscriptionFromBackend()
        console.log('[UnifiedNotificationService] Successfully unsubscribed from push notifications')
        return true
      }
      return false
    } catch (error) {
      console.error('[UnifiedNotificationService] Failed to unsubscribe from push notifications:', error)
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
      console.error('[UnifiedNotificationService] Failed to fetch notifications:', error)
      return []
    }
  }

  async markAsRead(notificationId: string) {
    const localIndex = this.localNotifications.findIndex(n => n.id === notificationId)
    if (localIndex !== -1) {
      this.localNotifications[localIndex].is_read = true
      this.localNotifications[localIndex].acknowledged = true
    }

    if (!this.isSupabaseAvailable) {
      console.log('[UnifiedNotificationService] Marked notification as read locally:', notificationId)
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
      console.error('[UnifiedNotificationService] Failed to mark notification as read:', error)
      throw error
    }
  }

  async markAllAsRead() {
    this.localNotifications.forEach(n => {
      n.is_read = true
      n.acknowledged = true
    })

    if (!this.isSupabaseAvailable) {
      console.log('[UnifiedNotificationService] Marked all notifications as read locally')
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
      console.error('[UnifiedNotificationService] Failed to mark all notifications as read:', error)
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
      console.error('[UnifiedNotificationService] Failed to get unread count:', error)
      return 0
    }
  }

  // ===========================================
  // CONNECTION MANAGEMENT
  // ===========================================

  private handleSupabaseConnectionError(error: Error) {
    console.error('[UnifiedNotificationService] Supabase connection error:', error.message)
    
    if (this.supabaseRetryCount >= this.maxRetries) {
      console.error('[UnifiedNotificationService] Max Supabase retries reached')
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.supabaseRetryCount), 30000)
    this.supabaseRetryCount++
    
    console.log(`[UnifiedNotificationService] Retrying Supabase connection in ${delay}ms... (Attempt ${this.supabaseRetryCount}/${this.maxRetries})`)
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
    }
    
    this.retryTimeout = setTimeout(() => {
      this.cleanupSupabase()
      this.initializeInAppNotifications()
    }, delay)
  }

  private cleanupSupabase() {
    if (this.supabaseSubscription && this.isSupabaseAvailable) {
      supabase.removeChannel(this.supabaseSubscription)
      this.supabaseSubscription = null
    }
    this.isSupabaseConnected = false
  }

  disconnect() {
    console.log('[UnifiedNotificationService] Disconnecting notification service...')
    
    this.cleanupSupabase()
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }

    this.inAppListeners = []
    this.pushListeners = []
    this.pushNotificationHandlers = []
    this.isInitialized = false
    this.connectionState = 'disconnected'
    this.supabaseRetryCount = 0
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

  addPushNotificationHandler(handler: (notification: any) => void): () => void {
    this.pushNotificationHandlers.push(handler)
    return () => {
      this.pushNotificationHandlers = this.pushNotificationHandlers.filter(h => h !== handler)
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  private getCurrentUserId(): string | null {
    // Implement your user ID retrieval logic here
    return localStorage.getItem('userId') || null
  }

  private async sendSubscriptionToBackend(subscription: PushSubscription) {
    try {
      const response = await fetch('/api/subscribe', {
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
        throw new Error('Failed to send subscription to backend')
      }
    } catch (error) {
      console.error('[UnifiedNotificationService] Error sending subscription to backend:', error)
    }
  }

  private async removeSubscriptionFromBackend() {
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        throw new Error('Failed to remove subscription from backend')
      }
    } catch (error) {
      console.error('[UnifiedNotificationService] Error removing subscription from backend:', error)
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

  private urlB64ToUint8Array(base64String: string): Uint8Array {
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
  // STATUS METHODS
  // ===========================================

  getConnectionStatus() {
    return {
      isInitialized: this.isInitialized,
      supabase: {
        isConnected: this.isSupabaseConnected,
        connectionState: this.connectionState,
        retryCount: this.supabaseRetryCount,
        isAvailable: this.isSupabaseAvailable
      },
      push: {
        serviceWorkerRegistered: !!this.serviceWorkerRegistration,
        pushSubscribed: !!this.pushSubscription,
        supported: !this.isStackBlitz && 'serviceWorker' in navigator && 'PushManager' in window,
        backgroundSyncRegistered: this.backgroundSyncRegistered
      },
      listeners: {
        inApp: this.inAppListeners.length,
        push: this.pushListeners.length,
        pushHandlers: this.pushNotificationHandlers.length
      },
      localNotifications: this.localNotifications.length,
      lastNotificationSeen: localStorage.getItem('lastNotificationSeen')
    }
  }
}

// Create singleton instance
export const unifiedNotificationService = new UnifiedNotificationService()
