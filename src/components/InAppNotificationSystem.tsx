// src/components/InAppNotificationSystem.tsx
import React, { useEffect, useState } from 'react';
import { X, Bell, Wifi, WifiOff, AlertCircle, CheckCircle, Info, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { unifiedNotificationService, UnifiedNotification } from '@/services/unifiedNotificationService';

interface DisplayNotification extends UnifiedNotification {
  isVisible: boolean;
  dismissedAt?: number;
}

const InAppNotificationSystem: React.FC = () => {
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState(unifiedNotificationService.getConnectionStatus());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const initializeService = async () => {
      try {
        console.log('Initializing unified notification service...');
        const success = await unifiedNotificationService.initialize();
        if (success) {
          console.log('Unified notification service initialized successfully');
        } else {
          console.warn('Notification service initialization had issues');
          toast.error('Some notification features may not work properly');
        }
      } catch (error) {
        console.error('Failed to initialize unified notification service:', error);
        toast.error('Failed to initialize notifications. Some features may not work.');
      }
    };

    // Initialize the service
    initializeService();

    // Set up in-app notification listener
    const unsubscribeInApp = unifiedNotificationService.addInAppListener((notification) => {
      console.log('Received in-app notification:', notification);

      const displayNotification: DisplayNotification = {
        ...notification,
        isVisible: true,
      };

      setNotifications(prev => [displayNotification, ...prev.slice(0, 4)]); // Keep max 5

      // Show toast notification based on priority
      const toastMessage = `${notification.title}: ${notification.message || notification.body || 'New notification'}`;
      switch (notification.priority) {
        case 'high':
        case 'urgent':
          toast.error(toastMessage, { duration: 8000 });
          break;
        case 'medium':
          toast.success(toastMessage, { duration: 5000 });
          break;
        case 'low':
          toast.info(toastMessage, { duration: 3000 });
          break;
        default:
          toast(toastMessage, { duration: 4000 });
      }
    });

    // Set up push notification listener (for notifications received while app is open)
    const unsubscribePush = unifiedNotificationService.addPushListener((notification) => {
      console.log('Received push notification while app is open:', notification);

      const displayNotification: DisplayNotification = {
        ...notification,
        isVisible: true,
      };

      setNotifications(prev => [displayNotification, ...prev.slice(0, 4)]);

      // Show toast for push notifications too
      const toastMessage = `${notification.title}: ${notification.message || notification.body || 'New notification'}`;
      toast.info(`📱 ${toastMessage}`, { duration: 5000 });
    });

    // Monitor connection status
    const statusInterval = setInterval(() => {
      const status = unifiedNotificationService.getConnectionStatus();
      setConnectionStatus(status);
    }, 2000);

    // Cleanup function
    return () => {
      unsubscribeInApp();
      unsubscribePush();
      clearInterval(statusInterval);
    };
  }, []);

  const dismissNotification = async (notification: DisplayNotification) => {
    // Mark as read in the database
    try {
      await unifiedNotificationService.markAsRead(notification.id);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }

    // Update local state
    setNotifications(prev =>
      prev.map(n =>
        n.id === notification.id
          ? { ...n, isVisible: false, dismissedAt: Date.now() }
          : n
      )
    );

    // Remove from local state after animation
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 300);
  };

  const clearAllNotifications = async () => {
    // Mark all visible notifications as read
    try {
      const visibleNotificationIds = notifications
        .filter(n => n.isVisible)
        .map(n => n.id);
      
      // Mark each as read
      await Promise.all(
        visibleNotificationIds.map(id => unifiedNotificationService.markAsRead(id))
      );
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }

    // Update local state
    setNotifications(prev =>
      prev.map(n => ({ ...n, isVisible: false, dismissedAt: Date.now() }))
    );

    // Remove from local state after animation
    setTimeout(() => {
      setNotifications([]);
    }, 300);
  };

  const handleSubscribeToPush = async () => {
    try {
      const subscription = await unifiedNotificationService.subscribeToPush();
      if (subscription) {
        toast.success('Successfully subscribed to push notifications!');
        setConnectionStatus(unifiedNotificationService.getConnectionStatus());
      } else {
        toast.error('Failed to subscribe to push notifications');
      }
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      toast.error('Failed to subscribe to push notifications');
    }
  };

  const handleUnsubscribeFromPush = async () => {
    try {
      const success = await unifiedNotificationService.unsubscribeFromPush();
      if (success) {
        toast.success('Successfully unsubscribed from push notifications');
        setConnectionStatus(unifiedNotificationService.getConnectionStatus());
      } else {
        toast.error('Failed to unsubscribe from push notifications');
      }
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      toast.error('Failed to unsubscribe from push notifications');
    }
  };

  const handleTestNotification = async (priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium') => {
    try {
      await unifiedNotificationService.sendTestNotification(priority, false);
      toast.success(`Test ${priority} priority notification sent!`);
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast.error('Failed to send test notification');
    }
  };

  const getNotificationIcon = (type: string, priority: string) => {
    if (priority === 'high' || priority === 'urgent') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }

    switch (type) {
      case 'test':
        return <Bell className="h-5 w-5 text-blue-500" />;
      case 'system':
        return <Info className="h-5 w-5 text-blue-500" />;
      case 'price_change':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'push':
        return <Bell className="h-5 w-5 text-purple-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
    }
  };

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return 'bg-red-50 border-red-200 shadow-lg';
      case 'medium':
        return 'bg-blue-50 border-blue-200 shadow-md';
      case 'low':
        return 'bg-gray-50 border-gray-200 shadow-sm';
      default:
        return 'bg-white border-gray-200 shadow-sm';
    }
  };

  const getConnectionStatusText = () => {
    const { supabase, push } = connectionStatus;
    
    if (supabase.isConnected && push.pushSubscribed) {
      return 'Fully Connected';
    } else if (supabase.isConnected) {
      return 'In-App Connected';
    } else if (push.serviceWorkerRegistered) {
      return 'Push Ready';
    } else {
      return 'Limited Connection';
    }
  };

  const getConnectionIcon = () => {
    const { supabase, push } = connectionStatus;
    const isConnected = supabase.isConnected || push.serviceWorkerRegistered;
    return isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />;
  };

  const getConnectionVariant = () => {
    const { supabase, push } = connectionStatus;
    
    if (supabase.isConnected && push.pushSubscribed) {
      return 'default'; // Green
    } else if (supabase.isConnected || push.serviceWorkerRegistered) {
      return 'secondary'; // Blue
    } else {
      return 'destructive'; // Red
    }
  };

  const visibleNotifications = notifications.filter(n => n.isVisible);

  return (
    <>
      {/* Connection Status and Settings */}
      <div className="fixed top-4 left-4 z-40 flex items-center gap-2">
        <Badge
          variant={getConnectionVariant()}
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => setShowSettings(!showSettings)}
        >
          {getConnectionIcon()}
          {getConnectionStatusText()}
        </Badge>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="h-7 px-2"
        >
          <Settings className="h-3 w-3" />
        </Button>

        {/* Debug Test Buttons - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex gap-1">
            <Button
              onClick={() => handleTestNotification('low')}
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2"
            >
              Low
            </Button>
            <Button
              onClick={() => handleTestNotification('medium')}
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2"
            >
              Med
            </Button>
            <Button
              onClick={() => handleTestNotification('high')}
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2"
            >
              High
            </Button>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed top-16 left-4 z-40 w-80">
          <Card className="p-4 shadow-lg">
            <h3 className="font-semibold mb-3">Notification Settings</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Permission Status:</span>
                <Badge variant={connectionStatus.permissionGranted ? 'default' : 'destructive'}>
                  {connectionStatus.permissionGranted ? 'Granted' : 'Denied'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Service Worker:</span>
                <Badge variant={connectionStatus.push.serviceWorkerRegistered ? 'default' : 'secondary'}>
                  {connectionStatus.push.serviceWorkerRegistered ? 'Ready' : 'Not Ready'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Push Subscription:</span>
                <Badge variant={connectionStatus.push.pushSubscribed ? 'default' : 'secondary'}>
                  {connectionStatus.push.pushSubscribed ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Supabase:</span>
                <Badge variant={connectionStatus.supabase.isConnected ? 'default' : 'secondary'}>
                  {connectionStatus.supabase.isConnected ? 'Connected' : 'Offline'}
                </Badge>
              </div>
              
              <div className="pt-2 space-y-2">
                {!connectionStatus.permissionGranted && (
                  <Button
                    onClick={handleSubscribeToPush}
                    size="sm"
                    className="w-full"
                  >
                    Enable Notifications
                  </Button>
                )}
                
                {connectionStatus.permissionGranted && !connectionStatus.push.pushSubscribed && (
                  <Button
                    onClick={handleSubscribeToPush}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    Subscribe to Push
                  </Button>
                )}
                
                {connectionStatus.push.pushSubscribed && (
                  <Button
                    onClick={handleUnsubscribeFromPush}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    Unsubscribe
                  </Button>
                )}
                
                <Button
                  onClick={() => handleTestNotification('medium')}
                  size="sm"
                  variant="outline"
                  className="w-full"
                >
                  Test Notification
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Notification Container */}
      {visibleNotifications.length > 0 && (
        <div className="fixed top-16 right-4 z-50 space-y-3 max-w-sm">
          {/* Clear All Button */}
          {visibleNotifications.length > 1 && (
            <div className="text-center">
              <Button
                onClick={clearAllNotifications}
                variant="outline"
                size="sm"
                className="bg-white/90 backdrop-blur-sm"
              >
                Clear All ({visibleNotifications.length})
              </Button>
            </div>
          )}

          {/* Notification Items */}
          {visibleNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`
                p-4 rounded-lg border transition-all duration-300 ease-in-out
                ${getPriorityStyles(notification.priority)}
                ${notification.isVisible
                  ? 'animate-in slide-in-from-right-full opacity-100 scale-100'
                  : 'animate-out slide-out-to-right-full opacity-0 scale-95'
                }
              `}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  {getNotificationIcon(notification.type, notification.priority)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900 text-sm truncate">
                        {notification.title}
                      </h4>
                      <Badge
                        variant={
                          notification.priority === 'high' || notification.priority === 'urgent' 
                            ? 'destructive' 
                            : 'outline'
                        }
                        className="text-xs flex-shrink-0"
                      >
                        {notification.priority.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {notification.message || notification.body || 'New notification'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <time className="text-xs text-gray-500">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </time>
                      {notification.site && (
                        <Badge variant="outline" className="text-xs">
                          {notification.site}
                        </Badge>
                      )}
                    </div>
                    {notification.action_url && (
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 h-auto text-xs text-blue-600 mt-1"
                        onClick={() => {
                          window.open(notification.action_url, '_blank');
                          dismissNotification(notification);
                        }}
                      >
                        View Details →
                      </Button>
                    )}
                  </div>
                </div>

                {/* Dismiss Button */}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Dismiss notification"
                  onClick={() => dismissNotification(notification)}
                  className="ml-2 text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default InAppNotificationSystem;
