// src/components/NotificationSettingsDialog.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, BellOff, Smartphone, Globe, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationStatus {
  oneSignal: {
    isInitialized: boolean;
    isSubscribed: boolean;
    playerId: string | null;
  };
  legacy: {
    isSupported: boolean;
    isSubscribed: boolean;
  };
  browser: {
    permission: NotificationPermission;
  };
}

export default function NotificationSettingsDialog() {
  const [status, setStatus] = useState<NotificationStatus>({
    oneSignal: {
      isInitialized: false,
      isSubscribed: false,
      playerId: null
    },
    legacy: {
      isSupported: false,
      isSubscribed: false
    },
    browser: {
      permission: 'default'
    }
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const { user } = useAuth();

  // Check notification status on component mount
  useEffect(() => {
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    try {
      const serviceStatus = unifiedNotificationService.getConnectionStatus();
      
      // Check OneSignal status
      const isOneSignalSubscribed = await unifiedNotificationService.isOneSignalSubscribed();
      
      // Check browser permission
      const browserPermission = 'Notification' in window ? Notification.permission : 'denied';
      
      setStatus({
        oneSignal: {
          isInitialized: serviceStatus.oneSignal.isInitialized,
          isSubscribed: isOneSignalSubscribed,
          playerId: serviceStatus.oneSignal.status?.userId || null
        },
        legacy: {
          isSupported: serviceStatus.push.supported,
          isSubscribed: serviceStatus.push.pushSubscribed
        },
        browser: {
          permission: browserPermission
        }
      });
      
      setLastError(null);
    } catch (error) {
      console.error('[NotificationSettings] Error checking status:', error);
      setLastError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleOneSignalSubscribe = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setLastError(null);
    
    try {
      const success = await unifiedNotificationService.subscribeToOneSignal(user?.id);
      
      if (success) {
        await checkNotificationStatus();
        // Show success message
        console.log('[NotificationSettings] Successfully subscribed to OneSignal');
      } else {
        throw new Error('Failed to subscribe to OneSignal notifications');
      }
    } catch (error) {
      console.error('[NotificationSettings] Subscribe error:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to subscribe');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOneSignalUnsubscribe = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setLastError(null);
    
    try {
      const success = await unifiedNotificationService.unsubscribeFromOneSignal();
      
      if (success) {
        await checkNotificationStatus();
        console.log('[NotificationSettings] Successfully unsubscribed from OneSignal');
      } else {
        throw new Error('Failed to unsubscribe from OneSignal notifications');
      }
    } catch (error) {
      console.error('[NotificationSettings] Unsubscribe error:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to unsubscribe');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestNotification = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setLastError(null);
    
    try {
      await unifiedNotificationService.sendTestNotification('medium', false, true);
      console.log('[NotificationSettings] Test notification sent');
    } catch (error) {
      console.error('[NotificationSettings] Test notification error:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to send test notification');
    } finally {
      setIsLoading(false);
    }
  };

  // Legacy function for backward compatibility
  const request = async () => {
    if (status.browser.permission !== 'granted') {
      await handleOneSignalSubscribe();
    }
  };

  const getStatusIcon = (isActive: boolean, hasError: boolean = false) => {
    if (hasError) return <XCircle className="h-4 w-4 text-red-500" />;
    if (isActive) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const getPermissionBadge = (permission: NotificationPermission) => {
    switch (permission) {
      case 'granted':
        return <Badge variant="default" className="bg-green-100 text-green-800">Granted</Badge>;
      case 'denied':
        return <Badge variant="destructive">Denied</Badge>;
      default:
        return <Badge variant="secondary">Not Requested</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* OneSignal Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mobile Push Notifications (OneSignal)
          </CardTitle>
          <CardDescription>
            Reliable push notifications that work even when the app is closed. Recommended for mobile devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(status.oneSignal.isInitialized)}
                <span className="text-sm font-medium">Service</span>
              </div>
              <Badge variant={status.oneSignal.isInitialized ? "default" : "secondary"}>
                {status.oneSignal.isInitialized ? "Ready" : "Initializing"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(status.oneSignal.isSubscribed)}
                <span className="text-sm font-medium">Subscription</span>
              </div>
              <Badge variant={status.oneSignal.isSubscribed ? "default" : "outline"}>
                {status.oneSignal.isSubscribed ? "Active" : "Inactive"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(status.browser.permission === 'granted')}
                <span className="text-sm font-medium">Permission</span>
              </div>
              {getPermissionBadge(status.browser.permission)}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            {!status.oneSignal.isSubscribed ? (
              <Button 
                onClick={handleOneSignalSubscribe}
                disabled={isLoading || !status.oneSignal.isInitialized}
                className="flex items-center gap-2"
              >
                <Bell className="h-4 w-4" />
                {isLoading ? 'Subscribing...' : 'Enable Push Notifications'}
              </Button>
            ) : (
              <Button 
                variant="outline"
                onClick={handleOneSignalUnsubscribe}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <BellOff className="h-4 w-4" />
                {isLoading ? 'Unsubscribing...' : 'Disable Push Notifications'}
              </Button>
            )}
            
            <Button 
              variant="secondary"
              onClick={handleTestNotification}
              disabled={isLoading || !status.oneSignal.isSubscribed}
              className="flex items-center gap-2"
            >
              <Bell className="h-4 w-4" />
              {isLoading ? 'Sending...' : 'Send Test Notification'}
            </Button>
            
            <Button 
              variant="ghost"
              onClick={checkNotificationStatus}
              disabled={isLoading}
              size="sm"
            >
              Refresh Status
            </Button>
          </div>

          {/* Legacy compatibility section - keeping your original simple interface */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-2">Quick Setup</h3>
            <p className="text-sm text-gray-600 mb-2">Status: {status.browser.permission}</p>
            {status.browser.permission !== 'granted' && !status.oneSignal.isSubscribed && (
              <Button onClick={request} variant="outline" size="sm">
                Enable Push Notifications
              </Button>
            )}
          </div>

          {/* Player ID Display (for debugging) */}
          {status.oneSignal.playerId && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Device ID:</strong> {status.oneSignal.playerId.substring(0, 16)}...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legacy Browser Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Browser Notifications (Fallback)
          </CardTitle>
          <CardDescription>
            Standard browser notifications. These work when the app is open but may not work when closed on mobile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(status.legacy.isSupported)}
                <span className="text-sm font-medium">Browser Support</span>
              </div>
              <Badge variant={status.legacy.isSupported ? "default" : "secondary"}>
                {status.legacy.isSupported ? "Supported" : "Not Supported"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(status.legacy.isSubscribed)}
                <span className="text-sm font-medium">Legacy Push</span>
              </div>
              <Badge variant={status.legacy.isSubscribed ? "default" : "outline"}>
                {status.legacy.isSubscribed ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {lastError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Error:</strong> {lastError}
          </AlertDescription>
        </Alert>
      )}

      {/* Information Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-900 text-sm">💡 How Push Notifications Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>OneSignal:</strong> Provides reliable push notifications that work even when your browser or app is closed. Perfect for mobile devices.
          </p>
          <p>
            <strong>Browser Notifications:</strong> Standard web notifications that work when the app is open. Limited functionality when the app is closed on mobile.
          </p>
          <p>
            <strong>Recommendation:</strong> Enable OneSignal push notifications for the best experience, especially on mobile devices.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
