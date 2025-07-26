import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import InAppNotificationSystem from '@/components/InAppNotificationSystem';
import Index from '@/pages/Index';
import Dashboard from '@/pages/Dashboard';
import AllNotifications from '@/pages/AllNotifications';
import ApiDocumentation from '@/pages/ApiDocumentation';
import NotFound from '@/pages/NotFound';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import './App.css';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  useEffect(() => {
    // Initialize PWA, OneSignal, and notification services on app start
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing MCM Alerts App...');
        
        // Initialize unified notification service (includes OneSignal + legacy push)
        await unifiedNotificationService.initialize();
        console.log('✅ Unified notification service initialized');

        // Check notification service status for debugging
        const notificationStatus = unifiedNotificationService.getConnectionStatus();
        console.log('📊 Notification service status:', notificationStatus);

        // Register service worker for PWA functionality
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
              scope: '/',
              updateViaCache: 'none'
            });
            
            console.log('✅ Service Worker registered successfully:', registration.scope);
            
            // Handle service worker updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('🔄 New service worker available');
                    // Optionally notify user about update
                    const updateEvent = new CustomEvent('service-worker-updated');
                    window.dispatchEvent(updateEvent);
                  }
                });
              }
            });

            // Listen for messages from service worker
            navigator.serviceWorker.addEventListener('message', (event) => {
              console.log('📨 Message from service worker:', event.data);
              
              if (event.data && event.data.type === 'PUSH_NOTIFICATION_RECEIVED') {
                // Dispatch custom event for push notifications
                const customEvent = new CustomEvent('push-notification-received', {
                  detail: event.data.notificationData
                });
                window.dispatchEvent(customEvent);
              }
            });

          } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
          }
        } else {
          console.warn('⚠️ Service Worker not supported in this browser');
        }

        // Set up PWA install prompt handling
        let deferredPrompt: any = null;
        
        window.addEventListener('beforeinstallprompt', (e) => {
          console.log('📲 PWA install prompt triggered');
          e.preventDefault();
          deferredPrompt = e;
          
          // Store the event for later use
          (window as any).deferredPrompt = deferredPrompt;
          
          // Dispatch custom event to show install button
          const installEvent = new CustomEvent('pwa-install-available', { detail: e });
          window.dispatchEvent(installEvent);
        });

        window.addEventListener('appinstalled', () => {
          console.log('✅ PWA installed successfully');
          deferredPrompt = null;
          (window as any).deferredPrompt = null;
          
          // Dispatch event for app installed
          const installedEvent = new CustomEvent('pwa-installed');
          window.dispatchEvent(installedEvent);
        });

        // Handle online/offline status
        const updateOnlineStatus = () => {
          const status = navigator.onLine ? 'online' : 'offline';
          console.log(`🌐 Connection status: ${status}`);
          
          // Update document class for CSS styling
          document.documentElement.classList.toggle('offline', !navigator.onLine);
          
          // Dispatch custom event for connection status changes
          const connectionEvent = new CustomEvent('connection-status-changed', {
            detail: { isOnline: navigator.onLine, timestamp: Date.now() }
          });
          window.dispatchEvent(connectionEvent);
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        // Initial status check
        updateOnlineStatus();

        // Set up comprehensive notification handling
        const setupNotificationHandlers = () => {
          // Listen for push notifications from service worker
          window.addEventListener('push-notification-received', (event: any) => {
            console.log('🔔 Push notification received in app:', event.detail);
            
            // The unified service already handles these via its internal listeners
            // Additional custom handling can go here if needed
            try {
              // Example: Track notification analytics
              if (event.detail?.type) {
                console.log(`📈 Tracking notification: ${event.detail.type}`);
              }
            } catch (error) {
              console.error('❌ Error handling push notification:', error);
            }
          });

          // Listen for direct API notifications (when app is open)
          window.addEventListener('api-notification-received', (event: any) => {
            console.log('📡 API notification received:', event.detail);
            
            // Additional API notification handling
            try {
              // Example: Update notification badge count
              const notification = event.detail;
              if (notification?.priority === 'urgent') {
                console.log('🚨 Urgent notification received:', notification.title);
              }
            } catch (error) {
              console.error('❌ Error handling API notification:', error);
            }
          });

          // Set up unified service listeners for in-app notifications
          const inAppUnsubscribe = unifiedNotificationService.addInAppListener((notification) => {
            console.log('🔔 In-app notification processed:', notification);
            
            // Additional in-app notification handling
            try {
              // Example: Update page title with notification count
              const unreadCount = document.querySelectorAll('[data-unread="true"]').length;
              if (unreadCount > 0) {
                document.title = `(${unreadCount}) MCM Alerts`;
              } else {
                document.title = 'MCM Alerts';
              }
            } catch (error) {
              console.error('❌ Error in in-app notification handler:', error);
            }
          });

          const pushUnsubscribe = unifiedNotificationService.addPushListener((notification) => {
            console.log('📱 Push notification processed:', notification);
            
            // Additional push notification handling
            try {
              // Example: Play custom sound for high priority notifications
              if (notification.priority === 'high' || notification.priority === 'urgent') {
                console.log('🔊 High priority notification - enhanced handling');
              }
            } catch (error) {
              console.error('❌ Error in push notification handler:', error);
            }
          });

          // Store unsubscribe functions for cleanup
          (window as any).notificationUnsubscribers = {
            inApp: inAppUnsubscribe,
            push: pushUnsubscribe
          };
        };

        setupNotificationHandlers();

        // Set up OneSignal-specific event handlers
        const setupOneSignalHandlers = () => {
          // Listen for OneSignal permission changes
          window.addEventListener('onesignal-permission-changed', (event: any) => {
            console.log('🔔 OneSignal permission changed:', event.detail);
          });

          // Listen for OneSignal subscription changes
          window.addEventListener('onesignal-subscription-changed', (event: any) => {
            console.log('📱 OneSignal subscription changed:', event.detail);
          });
        };

        setupOneSignalHandlers();

        // Set up error boundary for notification errors
        window.addEventListener('unhandledrejection', (event) => {
          if (event.reason?.message?.includes('OneSignal') || 
              event.reason?.message?.includes('notification')) {
            console.error('🚨 Notification-related unhandled rejection:', event.reason);
            // Don't prevent the default behavior, just log for debugging
          }
        });

        // Set up periodic health checks
        const setupHealthChecks = () => {
          const healthCheckInterval = setInterval(() => {
            try {
              const status = unifiedNotificationService.getConnectionStatus();
              
              // Log status periodically for debugging (every 5 minutes)
              if (Date.now() % (5 * 60 * 1000) < 10000) {
                console.log('💓 Notification service health check:', {
                  initialized: status.isInitialized,
                  supabaseConnected: status.supabase.isConnected,
                  oneSignalInitialized: status.oneSignal.isInitialized,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Auto-recovery for disconnected services
              if (status.isInitialized && !status.supabase.isConnected && status.supabase.isAvailable) {
                console.log('🔄 Attempting to reconnect Supabase...');
                // The service handles reconnection internally
              }
              
            } catch (error) {
              console.error('❌ Health check error:', error);
            }
          }, 30000); // Check every 30 seconds

          // Store interval ID for cleanup
          (window as any).healthCheckInterval = healthCheckInterval;
        };

        setupHealthChecks();

        // Initialize notification permission status
        const checkInitialPermissions = async () => {
          try {
            if ('Notification' in window) {
              const permission = Notification.permission;
              console.log(`🔔 Initial notification permission: ${permission}`);
              
              // Dispatch event with initial permission status
              const permissionEvent = new CustomEvent('notification-permission-status', {
                detail: { permission, timestamp: Date.now() }
              });
              window.dispatchEvent(permissionEvent);
            }
          } catch (error) {
            console.error('❌ Error checking initial permissions:', error);
          }
        };

        await checkInitialPermissions();

        console.log('🎉 MCM Alerts App initialized successfully');

        // Dispatch app ready event
        const readyEvent = new CustomEvent('app-initialized', {
          detail: { 
            timestamp: Date.now(),
            notificationService: unifiedNotificationService.getConnectionStatus()
          }
        });
        window.dispatchEvent(readyEvent);

      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        
        // Dispatch error event
        const errorEvent = new CustomEvent('app-initialization-error', {
          detail: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
        window.dispatchEvent(errorEvent);
      }
    };

    initializeApp();

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up App...');
      
      try {
        // Clean up unified notification service
        unifiedNotificationService.disconnect();
        
        // Clean up event listeners
        window.removeEventListener('online', () => {});
        window.removeEventListener('offline', () => {});
        
        // Clean up notification listeners
        const unsubscribers = (window as any).notificationUnsubscribers;
        if (unsubscribers) {
          if (typeof unsubscribers.inApp === 'function') {
            unsubscribers.inApp();
          }
          if (typeof unsubscribers.push === 'function') {
            unsubscribers.push();
          }
        }
        
        // Clean up health check interval
        const healthCheckInterval = (window as any).healthCheckInterval;
        if (healthCheckInterval) {
          clearInterval(healthCheckInterval);
        }
        
        // Clean up PWA prompt
        (window as any).deferredPrompt = null;
        
        console.log('✅ App cleanup completed');
        
      } catch (error) {
        console.error('❌ Error during app cleanup:', error);
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <Router>
            <div className="App">
              {/* Global notification system overlay */}
              <InAppNotificationSystem />
              
              {/* Main application routes */}
              <Routes>
                {/* Main entry point */}
                <Route path="/" element={<Index />} />
                
                {/* Dashboard (authenticated) */}
                <Route path="/dashboard" element={<Dashboard />} />
                
                {/* Notifications page */}
                <Route path="/notifications" element={<AllNotifications />} />
                
                {/* API Documentation */}
                <Route path="/api-docs" element={<ApiDocumentation />} />
                
                {/* Settings page redirect to dashboard for now */}
                <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
                
                {/* Catch-all route for 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              
              {/* Global toast notifications */}
              <Toaster 
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'hsl(var(--background))',
                    color: 'hsl(var(--foreground))',
                    border: '1px solid hsl(var(--border))',
                  },
                }}
              />
            </div>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
