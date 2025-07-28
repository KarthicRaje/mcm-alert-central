import { supabase } from '@/lib/supabase'
import { registerServiceWorker } from '@/lib/serviceWorker'

class NotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null
  private pushSubscription: PushSubscription | null = null
  private vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

  async initialize() {
    try {
      this.swRegistration = await registerServiceWorker()
      await this.handlePushSubscription()
      this.setupListeners()
      return true
    } catch (error) {
      console.error('Notification service init failed:', error)
      return false
    }
  }

  private async handlePushSubscription() {
    if (!this.swRegistration) return
    
    const existingSubscription = await this.swRegistration.pushManager.getSubscription()
    if (existingSubscription) {
      this.pushSubscription = existingSubscription
      return
    }

    const newSubscription = await this.swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
    })

    await this.saveSubscription(newSubscription)
    this.pushSubscription = newSubscription
  }

  private async saveSubscription(subscription: PushSubscription) {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
        user_id: (await supabase.auth.getUser()).data.user?.id
      })

    if (error) throw error
  }

  private setupListeners() {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        // Handle notification clicks
      }
    })
  }

  private urlBase64ToUint8Array(base64String: string) {
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

export const notificationService = new NotificationService()
