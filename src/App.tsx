import React, { useEffect, useState } from 'react';
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
import { registerServiceWorker } from '@/utils/serviceWorker';
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
  const [appInitialized, setAppInitialized] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing MCM Alerts App...');
        
        // 1. First register service worker
        const registration = await registerServiceWorker();
        setSwRegistration(registration);
        
        // 2. Initialize notification services after SW registration
        const notificationSuccess = await unifiedNotificationService.initialize(registration);
        
        if (notificationSuccess) {
          console.log('✅ Unified notification service initialized successfully');
        } else {
          console.warn('⚠️ Notification service had initialization issues');
        }

        // Connection status handler
        const updateOnlineStatus = () => {
          const status = navigator.onLine ? 'online' : 'offline';
          console.log(`🌐 Connection status: ${status}`);
          
          window.dispatchEvent(new CustomEvent('connection-status-changed', {
            detail: { isOnline: navigator.onLine }
          }));

          // Reconnect services when coming back online
          if (navigator.onLine) {
            unifiedNotificationService.reconnect();
          }
        };

        // PWA installation handlers
        let deferredPrompt: BeforeInstallPromptEvent | null = null;
        
        const handleBeforeInstall = (e: Event) => {
          e.preventDefault();
          deferredPrompt = e as BeforeInstallPromptEvent;
          window.dispatchEvent(new CustomEvent('pwa-install-available', { detail: e }));
        };

        // Add event listeners
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', () => {
          console.log('✅ PWA installed successfully');
          deferredPrompt = null;
        });

        // Initial status check
        updateOnlineStatus();
        setAppInitialized(true);
        console.log('🎉 MCM Alerts App initialized successfully');

      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        // Fallback behavior if service worker fails
        setAppInitialized(true);
      }
    };

    initializeApp();

    return () => {
      unifiedNotificationService.disconnect();
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
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
            <div className="App min-h-screen bg-background">
              {/* Show loading state until app is fully initialized */}
              {!appInitialized ? (
                <div className="fixed inset-0 flex items-center justify-center bg-background">
                  <div className="animate-pulse text-foreground">
                    Initializing application...
                  </div>
                </div>
              ) : (
                <>
                  <InAppNotificationSystem swRegistration={swRegistration} />
                  
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/notifications" element={<AllNotifications />} />
                    <Route path="/api-docs" element={<ApiDocumentation />} />
                    <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  
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
                </>
              )}
            </div>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
