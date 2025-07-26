// src/services/unifiedNotificationService.ts
import { createClient } from '@supabase/supabase-js'
import { oneSignalService } from './oneSignalService'

// ✅ Enhanced environment variable handling with fallbacks and validation
const getSupabaseConfig = () => {
  // Try different environment variable patterns
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

  console.log('Supabase Config Check:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : 'missing',
    keyPrefix: supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + '...' : 'missing',
    envVars: Object.keys(import.meta.env || {}).filter(key => key.includes('SUPABASE'))
  })

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
  // Supabase real-time connection
  private supabaseSubscription: any = null
  private isSupabaseConnected = false
  private supabaseRetryCount = 0
  private maxRetries = 5
  private retryTimeout: NodeJS.Timeout | null = null
  private isSupabaseAvailable = !!supabase

  // Service Worker for push notifications (legacy)
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null
  private pushSubscription: PushSubscription | null = null
  private audioContext: AudioContext | null = null

  // OneSignal integration
  private isOneSignalInitialized = false
  private oneSignalEnabled = true // Can be toggled based on user preference

  // Event listeners
  private inAppListeners: NotificationListener[] = []
  private pushListeners: NotificationListener[] = []

  // State management
  private isInitialized = false
  private isStackBlitz = false
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'

  // Local storage for notifications when Supabase is not available
  private localNotifications: UnifiedNotification[] = []

  constructor() {
    this.isStackBlitz = window.location.hostname.includes('stackblitz') ||
                        window.location.hostname.includes('webcontainer') ||
                        (window.location.hostname === 'localhost' && window.location.port === '8080');
    
    this.initializeAudio()
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
      // Initialize all notification systems in parallel
      const initPromises = []
      
      // Initialize OneSignal first (most reliable for mobile)
      if (this.oneSignalEnabled) {
        initPromises.push(this.initializeOneSignal())
      }
      
      // Initialize legacy push notifications as fallback
      initPromises.push(this.initializePushNotifications())
      
      // Only initialize Supabase if it's available
      if (this.isSupabaseAvailable) {
        initPromises.push(this.initializeInAppNotifications())
      } else {
        console.warn('[UnifiedNotificationService] Supabase not available - using local-only mode')
        this.connectionState = 'error'
      }

      await Promise.allSettled(initPromises)

      this.isInitialized = true
      console.log('[UnifiedNotificationService] Successfully initialized notification service')
    } catch (error) {
      console.error('[UnifiedNotificationService] Initialization failed:', error)
      // Don't throw error - allow service to work in degraded mode
    }
  }

  private async initializeOneSignal() {
    try {
      console.log('[UnifiedNotificationService] Initializing OneSignal...')
      await oneSignalService.initialize()
      this.isOneSignalInitialized = true
      console.log('[UnifiedNotificationService] OneSignal initialized successfully')
    } catch (error) {
      console.error('[UnifiedNotificationService] OneSignal initialization failed:', error)
      this.isOneSignalInitialized = false
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

      // Subscribe to real-time notifications
      this.supabaseSubscription = supabase
        .channel('unified-notifications-channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
          },
          (payload) => {
            console.log('[UnifiedNotificationService] New notification received from Supabase:', payload.new)
            const notification = payload.new as UnifiedNotification
            this.handleInAppNotification(notification)
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
            console.log('[UnifiedNotificationService] Notification updated:', payload.new)
            // Handle updates if needed
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

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[UnifiedNotificationService] Push notifications not supported in this browser')
      return
    }

    try {
      console.log('[UnifiedNotificationService] Initializing legacy push notifications...')

      // Register service worker
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      })
      console.log('[UnifiedNotificationService] Service Worker registered:', this.serviceWorkerRegistration)

      await navigator.serviceWorker.ready

      // Listen for service worker messages
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this))

      console.log('[UnifiedNotificationService] Legacy push notification system ready')
    } catch (error) {
      console.error('[UnifiedNotificationService] Legacy push notification initialization failed:', error)
    }
  }

  private initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.warn('[UnifiedNotificationService] Audio context not supported:', error)
    }
  }

  // ===========================================
  // ONESIGNAL INTEGRATION METHODS
  // ===========================================

  async subscribeToOneSignal(userId?: string): Promise<boolean> {
    if (!this.isOneSignalInitialized) {
      try {
        await this.initializeOneSignal()
      } catch (error) {
        console.error('[UnifiedNotificationService] Failed to initialize OneSignal:', error)
        return false
      }
    }

    try {
      const success = await oneSignalService.subscribeUser(userId)
      if (success) {
        console.log('[UnifiedNotificationService] Successfully subscribed to OneSignal')
        
        // Set user tags for better targeting
        if (userId) {
          await oneSignalService.setTags({
            user_id: userId,
            app_name: 'MCM Alerts',
            subscription_date: new Date().toISOString()
          })
        }
      }
      return success
    } catch (error) {
      console.error('[UnifiedNotificationService] OneSignal subscription failed:', error)
      return false
    }
  }

  async unsubscribeFromOneSignal(): Promise<boolean> {
    if (!this.isOneSignalInitialized) return true

    try {
      return await oneSignalService.unsubscribeUser()
    } catch (error) {
      console.error('[UnifiedNotificationService] OneSignal unsubscription failed:', error)
      return false
    }
  }

  async isOneSignalSubscribed(): Promise<boolean> {
    if (!this.isOneSignalInitialized) return false

    try {
      return await oneSignalService.isSubscribed()
    } catch (error) {
      console.error('[UnifiedNotificationService] Error checking OneSignal subscription:', error)
      return false
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

    // Show browser notification if permitted (fallback when app is open)
    this.showBrowserNotification(notification)
    
    // Play sound
    this.playNotificationSound(notification.priority)
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
    } else if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
      this.playNotificationSound(event.data.priority)
    }
  }

  // ===========================================
  // PERMISSION MANAGEMENT
  // ===========================================

  async requestNotificationPermission(): Promise<boolean> {
    // Try OneSignal first (more reliable for mobile)
    if (this.isOneSignalInitialized) {
      try {
        const oneSignalPermission = await oneSignalService.requestPermission()
        if (oneSignalPermission) {
          console.log('[UnifiedNotificationService] OneSignal permission granted')
          return true
        }
      } catch (error) {
        console.error('[UnifiedNotificationService] OneSignal permission request failed:', error)
      }
    }

    // Fallback to browser notifications
    if (!('Notification' in window)) {
      console.warn('[UnifiedNotificationService] Browser notifications not supported')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      console.log('[UnifiedNotificationService] Browser notification permission result:', permission)
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

      this.pushSubscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlB64ToUint8Array(
          'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjqAKeFXjWWqlaGSb0TSa1TCEdqNB0NDrWJZnIa5oZUMoMJpE'
        )
      })
      
      console.log('[UnifiedNotificationService] Push subscription created:', this.pushSubscription)
      await this.sendSubscriptionToBackend(this.pushSubscription)
      return this.pushSubscription
    } catch (error) {
      console.error('[UnifiedNotificationService] Failed to subscribe to push notifications:', error)
      return null
    }
  }

  // ===========================================
  // NOTIFICATION DISPLAY
  // ===========================================

  private async showBrowserNotification(notification: UnifiedNotification) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        // Try service worker notification first (better for mobile)
        if (this.serviceWorkerRegistration) {
          await this.showServiceWorkerNotification(notification)
        } else {
          // Fallback to direct browser notification
          this.showDirectBrowserNotification(notification)
        }
      } catch (error) {
        console.error('[UnifiedNotificationService] Failed to show browser notification:', error)
        // Fallback to direct notification
        this.showDirectBrowserNotification(notification)
      }
    }
  }

  private async showServiceWorkerNotification(notification: UnifiedNotification) {
    if (!this.serviceWorkerRegistration) return

    const options = {
      body: notification.message || notification.body || 'New notification',
      icon: '/mcm-logo-192.png',
      badge: '/mcm-logo-192.png',
      tag: `mcm-${notification.id}`,
      requireInteraction: notification.priority === 'high' || notification.priority === 'urgent',
      silent: false,
      vibrate: notification.priority === 'high' ? [300, 100, 300, 100, 300] : [200, 100, 200],
      actions: [
        { action: 'view', title: 'View Dashboard', icon: '/mcm-logo-192.png' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: {
        id: notification.id,
        action_url: notification.action_url,
        priority: notification.priority,
        timestamp: Date.now()
      }
    }

    await this.serviceWorkerRegistration.showNotification(notification.title, options)
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
      
      // Mark as read when clicked
      this.markAsRead(notification.id).catch(console.error)
    }

    // Auto-close after delay (except for high priority)
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
  // DATABASE OPERATIONS
  // ===========================================

  async getNotifications(limit = 50, offset = 0, unreadOnly = false) {
    if (!this.isSupabaseAvailable) {
      // Return local notifications
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
    // Update local storage
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
    // Update local storage
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
  // TEST METHODS
  // ===========================================

  async sendTestNotification(
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
    testPush = false,
    testOneSignal = false
  ) {
    try {
      const notification: UnifiedNotification = {
        id: `test-${Date.now()}`,
        title: `Test Notification - ${priority.toUpperCase()}`,
        message: `This is a unified test notification with ${priority} priority sent at ${new Date().toLocaleTimeString()}`,
        body: `Testing both in-app and push notifications`,
        type: 'test',
        priority,
        site: 'system',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_read: false,
        acknowledged: false
      }

      // Test OneSignal notification
      if (testOneSignal && this.isOneSignalInitialized) {
        try {
          await oneSignalService.sendTestNotification()
          console.log('[UnifiedNotificationService] OneSignal test notification sent')
        } catch (error) {
          console.warn('[UnifiedNotificationService] OneSignal test failed:', error)
        }
      }

      // Test legacy push notification
      if (testPush && this.pushSubscription) {
        try {
          await fetch('/api/push-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification, subscription: this.pushSubscription })
          })
        } catch (error) {
          console.warn('[UnifiedNotificationService] Legacy push test failed:', error)
        }
      }

      if (this.isSupabaseAvailable) {
        // Create in database (will trigger real-time notification)
        const { data, error } = await supabase
          .from('notifications')
          .insert([notification])
          .select()

        if (error) throw error
        console.log('[UnifiedNotificationService] Test notification created in database:', data[0])
        return data[0]
      } else {
        // Handle locally
        this.handleInAppNotification(notification)
        console.log('[UnifiedNotificationService] Test notification created locally:', notification)
        return notification
      }
    } catch (error) {
      console.error('[UnifiedNotificationService] Failed to send test notification:', error)
      throw error
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
    this.isInitialized = false
    this.connectionState = 'disconnected'
    this.supabaseRetryCount = 0
  }

  // ===========================================
  // STATUS AND UTILITY METHODS
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
      oneSignal: {
        isInitialized: this.isOneSignalInitialized,
        enabled: this.oneSignalEnabled,
        status: oneSignalService.getStatus()
      },
      push: {
        serviceWorkerRegistered: !!this.serviceWorkerRegistration,
        pushSubscribed: !!this.pushSubscription,
        supported: !this.isStackBlitz && 'serviceWorker' in navigator && 'PushManager' in window
      },
      listeners: {
        inApp: this.inAppListeners.length,
        push: this.pushListeners.length
      },
      localNotifications: this.localNotifications.length
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

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
}

// Create singleton instance
export const unifiedNotificationService = new UnifiedNotificationService()
