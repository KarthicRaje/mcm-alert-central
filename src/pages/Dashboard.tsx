import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import TopicManagement from '@/components/TopicManagement';
import { pushService } from '@/services/pushNotificationService';
import { LogOut, Copy, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchRecentNotifications, addNotification } from '@/services/notificationService';

const Dashboard: React.FC = () => {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    initializePushNotifications();
    loadRecentNotifications();
  }, []);

  const initializePushNotifications = async () => {
    await pushService.initialize();
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  };

  const loadRecentNotifications = async () => {
    try {
      const data = await fetchRecentNotifications();
      setNotifications(data || []);
    } catch (err) {
      setNotifications([]);
    }
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out"
    });
  };

  const sendTestNotification = async (priority: 'low' | 'medium' | 'high') => {
    try {
      // Always request permission first to show browser dialog
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({
          title: "Notifications Blocked",
          description: "Please click 'Allow' in the browser dialog to enable notifications",
          variant: "destructive",
        });
        return;
      }

      // Send simple browser notification
      const title = `MCM Alert - ${priority.toUpperCase()} Priority`;
      const body = `Test notification (${priority} priority) - ${new Date().toLocaleTimeString()}`;
      
      // Create browser notification
      const notification = new Notification(title, {
        body,
        icon: '/mcm-logo-192.png',
        badge: '/mcm-logo-192.png',
        tag: 'mcm-test',
        requireInteraction: priority === 'high',
        silent: false
      });

      // Play sound
      await playNotificationSound(priority);

      // Store in database
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test_notification',
          title,
          message: body,
          priority
        })
      });

      // Auto-close notification after delay
      setTimeout(() => {
        try {
          notification.close();
        } catch (e) {
          // Notification might already be closed
        }
      }, priority === 'high' ? 10000 : 5000);

      toast({
        title: "✅ Notification Sent!",
        description: `${priority.charAt(0).toUpperCase() + priority.slice(1)} priority notification sent successfully!`,
      });

      // Refresh notifications list
      loadRecentNotifications();
      
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast({
        title: "Notification Failed",
        description: error.message || "Please allow notifications when prompted by your browser",
        variant: "destructive",
      });
    }
  };

  const playNotificationSound = async (priority: 'low' | 'medium' | 'high') => {
    try {
      const frequency = priority === 'high' ? 800 : priority === 'medium' ? 600 : 400;
      const duration = priority === 'high' ? 1.0 : 0.5;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context if suspended (required for mobile)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = 'sine';
      
      const volume = priority === 'high' ? 0.3 : priority === 'medium' ? 0.2 : 0.1;
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };

  const copyApiUrl = () => {
    const apiUrl = `${window.location.origin}/api/notifications`;
    navigator.clipboard.writeText(apiUrl);
    toast({
      title: "Copied!",
      description: "API URL copied to clipboard"
    });
  };

  const examplePayload = `{
  "type": "site_down",
  "title": "Site Down Alert", 
  "message": "example.com is not responding",
  "site": "example.com",
  "priority": "high",
  "timestamp": "${new Date().toISOString()}"
}`;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-6 py-8">
        {/* Header with Logout */}
        <div className="flex items-center justify-end mb-8">
          <Button onClick={handleLogout} variant="outline" className="flex items-center space-x-2">
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Topic Management */}
            <TopicManagement />

            {/* API Integration */}
            <Card>
              <CardHeader>
                <CardTitle>API Integration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Use this endpoint to trigger notifications from Postman:
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-sm font-mono">POST {window.location.origin}/api/notifications</code>
                    <Button variant="ghost" size="sm" onClick={copyApiUrl}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mb-4">
                  <p><strong>Method:</strong> POST | <strong>Auth:</strong> None Required</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Example payload:</h4>
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                      <code>{examplePayload}</code>
                    </pre>
                    <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={() => navigator.clipboard.writeText(examplePayload)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Link to="/api-docs">
                  <Button variant="outline" className="flex items-center space-x-2">
                    <ExternalLink className="h-4 w-4" />
                    <span>View Full API Documentation</span>
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            {/* Recent Notifications */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle>Recent Notifications</CardTitle>
                <Button variant="ghost" size="sm" className="text-red-950" onClick={() => navigate('/notifications')}>
                  View All
                </Button>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No notifications yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Click "Test Notification" to see notifications appear here
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Total notifications today: <strong>0</strong>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div key={n.id} className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-medium text-sm">{n.title}</div>
                          <Badge variant={n.priority === 'high' ? 'destructive' : n.priority === 'medium' ? 'secondary' : 'outline'}>
                            {n.priority || 'medium'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{n.body}</div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Monitoring Service</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Online
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Notifications</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Healthy
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Notification Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <span>⚡</span>
                  <span>Notification Features</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Visual flash cards (in-app toasts)</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Priority-based notification sounds</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Browser push notifications</span>
                </div>
                <div className="flex items-center space-x-2 text-sm"></div>
              </CardContent>
            </Card>

            {/* Test Notification */}
            <Card>
              <CardContent className="pt-6">
                <Button onClick={() => sendTestNotification('medium')} className="w-full mb-4 bg-primary hover:bg-primary/90">
                  🔔 Test Notification (with Sound)
                </Button>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" onClick={() => sendTestNotification('low')} className="text-xs">
                    🔕 Low
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => sendTestNotification('medium')} className="text-xs">
                    🔔 Medium
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => sendTestNotification('high')} className="text-xs">
                    🚨 High
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Each priority level has different sound and vibration patterns
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
