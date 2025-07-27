// src/components/SimpleNotificationSystem.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, BellRing, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { simplePushService, SimpleNotification } from '@/services/simplePushService';

const SimpleNotificationSystem: React.FC = () => {
  const [notifications, setNotifications] = useState<SimpleNotification[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const initializeService = async () => {
      await simplePushService.initialize();
      
      const status = simplePushService.getStatus();
      setPermissionGranted(status.permissionGranted);
      setIsSubscribed(status.hasSubscription);

      // Add listener for new notifications
      const removeListener = simplePushService.addListener((notification) => {
        setNotifications(prev => [notification, ...prev.slice(0, 9)]);
        toast.success(`${notification.title}: ${notification.body}`);
      });

      return removeListener;
    };

    initializeService();
  }, []);

  const handleSubscribe = async () => {
    const success = await simplePushService.subscribe();
    if (success) {
      setIsSubscribed(true);
      setPermissionGranted(true);
      toast.success('Successfully subscribed to push notifications!');
    } else {
      toast.error('Failed to subscribe to push notifications');
    }
  };

  const handleUnsubscribe = async () => {
    const success = await simplePushService.unsubscribe();
    if (success) {
      setIsSubscribed(false);
      toast.success('Successfully unsubscribed from push notifications');
    } else {
      toast.error('Failed to unsubscribe');
    }
  };

  const handleTestNotification = async (priority: 'low' | 'medium' | 'high') => {
    await simplePushService.sendTestNotification(priority);
    toast.success(`Test ${priority} priority notification sent!`);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    toast.success('All notifications cleared');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                permissionGranted ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm">
                {permissionGranted ? 'Permission Granted' : 'Permission Required'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                isSubscribed ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-sm">
                {isSubscribed ? 'Subscribed' : 'Not Subscribed'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {!permissionGranted || !isSubscribed ? (
              <Button onClick={handleSubscribe} size="sm">
                {!permissionGranted ? 'Enable Notifications' : 'Subscribe'}
              </Button>
            ) : (
              <>
                <Button onClick={handleUnsubscribe} variant="outline" size="sm">
                  Unsubscribe
                </Button>
                <Button onClick={() => handleTestNotification('low')} variant="outline" size="sm">
                  Test Low
                </Button>
                <Button onClick={() => handleTestNotification('medium')} variant="outline" size="sm">
                  Test Medium
                </Button>
                <Button onClick={() => handleTestNotification('high')} variant="outline" size="sm">
                  Test High
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Bell */}
      <div className="fixed top-4 right-4 z-50">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative bg-background border shadow-lg"
          >
            {notifications.length > 0 ? (
              <BellRing className="h-5 w-5" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
            {notifications.length > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {notifications.length > 9 ? '9+' : notifications.length}
              </Badge>
            )}
          </Button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-background border rounded-lg shadow-lg">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Notifications</h3>
                  <div className="flex gap-1">
                    {notifications.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllNotifications}
                        className="text-xs"
                      >
                        Clear All
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNotifications(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No notifications yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2 h-2 rounded-full ${getPriorityColor(notification.priority)}`} />
                              <h4 className="font-medium text-sm truncate">
                                {notification.title}
                              </h4>
                              <Badge variant="outline" className="text-xs">
                                {notification.priority}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {notification.body}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(notification.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeNotification(notification.id)}
                            className="h-6 w-6 p-0 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* API Test Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            API Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Send notifications via API:</h4>
              <div className="bg-muted p-3 rounded-lg">
                <code className="text-sm">
                  POST {window.location.origin}/api/notifications
                </code>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>Example payload:</p>
              <pre className="bg-muted p-2 rounded mt-1 text-xs overflow-x-auto">
{`{
  "title": "Alert Title",
  "body": "Alert message",
  "priority": "high",
  "type": "custom"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimpleNotificationSystem;
