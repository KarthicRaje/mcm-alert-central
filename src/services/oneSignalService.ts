// src/services/oneSignalService.ts
import OneSignal from 'react-onesignal';

export interface OneSignalConfig {
  appId: string;
  safariWebId?: string;
  notificationClickHandlerMatch?: string;
  notificationClickHandlerAction?: string;
}

export class OneSignalService {
  private isInitialized = false;
  private config: OneSignalConfig;
  private userId: string | null = null;

  constructor(config: OneSignalConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[OneSignalService] Already initialized');
      return;
    }

    try {
      console.log('[OneSignalService] Initializing OneSignal...');
      
      await OneSignal.init({
        appId: this.config.appId,
        safariWebId: this.config.safariWebId,
        
        // Allow localhosts for development
        allowLocalhostAsSecureOrigin: true,
        
        // Auto prompt for notifications
        autoRegister: false, // We'll handle this manually
        
        // Custom notification handling
        notificationClickHandlerMatch: this.config.notificationClickHandlerMatch || 'origin',
        notificationClickHandlerAction: this.config.notificationClickHandlerAction || 'focus',
        
        // PWA settings
        serviceWorkerParam: {
          scope: '/'
        },
        
        // Notification display settings
        welcomeNotification: {
          disable: true // We'll handle welcome notifications ourselves
        },
        
        // Custom handlers
        notificationClickHandlerAction: 'focus',
      });

      // Set up event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('[OneSignalService] OneSignal initialized successfully');
      
      // Get user ID if already subscribed
      this.userId = await OneSignal.getExternalUserId();
      
    } catch (error) {
      console.error('[OneSignalService] Failed to initialize OneSignal:', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Handle subscription changes
    OneSignal.on('subscriptionChange', (isSubscribed: boolean) => {
      console.log('[OneSignalService] Subscription changed:', isSubscribed);
      if (isSubscribed) {
        this.onSubscribed();
      }
    });

    // Handle notification received (when app is open)
    OneSignal.on('notificationDisplay', (event: any) => {
      console.log('[OneSignalService] Notification displayed:', event);
      // You can handle in-app notification display here
    });

    // Handle notification clicks
    OneSignal.on('notificationClick', (event: any) => {
      console.log('[OneSignalService] Notification clicked:', event);
      this.handleNotificationClick(event);
    });

    // Handle permission changes
    OneSignal.on('permissionChange', (permissionState: boolean) => {
      console.log('[OneSignalService] Permission changed:', permissionState);
    });
  }

  private async onSubscribed(): Promise<void> {
    try {
      const userId = await OneSignal.getExternalUserId();
      const playerId = await OneSignal.getPlayerId();
      
      console.log('[OneSignalService] User subscribed:', { userId, playerId });
      
      // Store user subscription info in your backend if needed
      // await this.storeSubscription(userId, playerId);
      
    } catch (error) {
      console.error('[OneSignalService] Error handling subscription:', error);
    }
  }

  private handleNotificationClick(event: any): void {
    const data = event.data;
    const url = data.url || data.launchURL;
    
    if (url) {
      // Navigate to specific URL
      window.open(url, '_blank');
    } else {
      // Default: focus the app
      window.focus();
    }
    
    // Mark notification as clicked in your analytics if needed
    console.log('[OneSignalService] Notification clicked, data:', data);
  }

  async requestPermission(): Promise<boolean> {
    try {
      const permission = await OneSignal.showSlidedownPrompt();
      console.log('[OneSignalService] Permission request result:', permission);
      return permission;
    } catch (error) {
      console.error('[OneSignalService] Error requesting permission:', error);
      return false;
    }
  }

  async subscribeUser(externalUserId?: string): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Request permission first
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.log('[OneSignalService] Permission denied');
        return false;
      }

      // Set external user ID if provided (link to your user system)
      if (externalUserId) {
        await OneSignal.setExternalUserId(externalUserId);
        this.userId = externalUserId;
      }

      // Register for push notifications
      await OneSignal.registerForPushNotifications();
      
      const isSubscribed = await OneSignal.isPushNotificationsEnabled();
      console.log('[OneSignalService] Subscription successful:', isSubscribed);
      
      return isSubscribed;
    } catch (error) {
      console.error('[OneSignalService] Failed to subscribe user:', error);
      return false;
    }
  }

  async unsubscribeUser(): Promise<boolean> {
    try {
      await OneSignal.setSubscription(false);
      console.log('[OneSignalService] User unsubscribed');
      return true;
    } catch (error) {
      console.error('[OneSignalService] Failed to unsubscribe user:', error);
      return false;
    }
  }

  async isSubscribed(): Promise<boolean> {
    try {
      return await OneSignal.isPushNotificationsEnabled();
    } catch (error) {
      console.error('[OneSignalService] Error checking subscription status:', error);
      return false;
    }
  }

  async getPlayerId(): Promise<string | null> {
    try {
      return await OneSignal.getPlayerId();
    } catch (error) {
      console.error('[OneSignalService] Error getting player ID:', error);
      return null;
    }
  }

  async setTags(tags: Record<string, string>): Promise<void> {
    try {
      await OneSignal.sendTags(tags);
      console.log('[OneSignalService] Tags set:', tags);
    } catch (error) {
      console.error('[OneSignalService] Error setting tags:', error);
    }
  }

  async deleteTags(tagKeys: string[]): Promise<void> {
    try {
      await OneSignal.deleteTags(tagKeys);
      console.log('[OneSignalService] Tags deleted:', tagKeys);
    } catch (error) {
      console.error('[OneSignalService] Error deleting tags:', error);
    }
  }

  async sendTestNotification(): Promise<void> {
    try {
      const playerId = await this.getPlayerId();
      if (!playerId) {
        throw new Error('No player ID available');
      }

      // This would typically be done from your backend
      console.log('[OneSignalService] Test notification would be sent to player:', playerId);
      
      // Note: You'll need to implement the backend API call to OneSignal's REST API
      // to actually send notifications. This is just for logging.
      
    } catch (error) {
      console.error('[OneSignalService] Error sending test notification:', error);
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      userId: this.userId,
      config: this.config
    };
  }
}

// Create singleton instance
// You'll need to get your OneSignal App ID from https://onesignal.com
const oneSignalConfig: OneSignalConfig = {
  appId: process.env.VITE_ONESIGNAL_APP_ID || 'e0482bdf-8fc8-4e77-891a-4ef547464ef0',
  safariWebId: process.env.VITE_ONESIGNAL_SAFARI_WEB_ID, // Optional for Safari
  notificationClickHandlerMatch: 'origin',
  notificationClickHandlerAction: 'focus'
};

export const oneSignalService = new OneSignalService(oneSignalConfig);
