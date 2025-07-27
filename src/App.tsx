// src/App.tsx
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
    // Initialize app with notification services
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing MCM Alerts App...');
        
        // Initialize unified notification service
        const notificationSuccess = await unifiedNotificationService.initialize();
        if (notificationSuccess) {
          console.log('✅ Unified notification service initialized successfully');
        } else {
          console.warn('⚠️ Notification service had initialization issues');
        }

        // Handle online/offline status
        const updateOnlineStatus = () => {
          const status = navigator.onLine ? 'online' : 'offline';
          console.log(`🌐 Connection status: ${status}`);
          
          // Dispatch custom event for connection status changes
          const connectionEvent = new CustomEvent('connection-status-changed', {
            detail: { isOnline: navigator.onLine }
          });
          window.dispatchEvent(connectionEvent);
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        // Initial status check
        updateOnlineStatus();

        // Handle PWA installation
        let deferredPrompt: any = null;
        
        window.addEventListener('beforeinstallprompt', (e) => {
          console.log('📲 PWA install prompt triggered');
          e.preventDefault();
          deferredPrompt = e;
          
          // Dispatch custom event to show install button
          const installEvent = new CustomEvent('pwa-install-available', { detail: e });
          window.dispatchEvent(installEvent);
        });

        window.addEventListener('appinstalled', () => {
          console.log('✅ PWA installed successfully');
          deferredPrompt = null;
        });

        // Set up global notification handler for API notifications
        window.addEventListener('api-notification-received', (event: any) => {
          console.log('📡 API notification received:', event.detail);
          // The unified service handles these automatically
        });

        console.log('🎉 MCM Alerts App initialized successfully');

      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
      }
    };

    initializeApp();

    // Cleanup function
    return () => {
      // Clean up unified notification service on unmount
      unifiedNotificationService.disconnect();
      
      // Remove event listeners
      window.removeEventListener('online', () => {});
      window.removeEventListener('offline', () => {});
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
