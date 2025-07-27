import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/supabaseClient';

interface Topic {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  lastChecked: Date;
  createdAt: Date;
}

const TopicManagement: React.FC = () => {
  const { toast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newTopic, setNewTopic] = useState({ name: '', description: '' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [loadingTopics, setLoadingTopics] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [togglingTopicId, setTogglingTopicId] = useState<string | null>(null);
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);

  // NEW: Confirmation dialog for delete
  const [confirmDeleteTopic, setConfirmDeleteTopic] = useState<Topic | null>(null);

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    setLoadingTopics(true);
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load topics:', error);
        setTopics([{
          id: '1',
          name: 'Site Up/Down Monitoring',
          description: 'Receive instant notifications when your monitored sites go up or down',
          enabled: true,
          lastChecked: new Date(),
          createdAt: new Date(),
        }]);
        return;
      }

      if (data && data.length > 0) {
        const formattedTopics = data.map(topic => ({
          id: topic.id,
          name: topic.name,
          description: topic.description,
          enabled: topic.enabled,
          lastChecked: topic.last_checked ? new Date(topic.last_checked) : new Date(),
          createdAt: topic.created_at ? new Date(topic.created_at) : new Date(),
        }));
        setTopics(formattedTopics);
      } else {
        setTopics([]);
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
      setTopics([{
        id: '1',
        name: 'Site Up/Down Monitoring',
        description: 'Receive instant notifications when your monitored sites go up or down',
        enabled: true,
        lastChecked: new Date(),
        createdAt: new Date(),
      }]);
    } finally {
      setLoadingTopics(false);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopic.name.trim()) {
      toast({
        title: "Error",
        description: "Topic name is required",
        variant: "destructive",
      });
      return;
    }

    setCreatingTopic(true);
    try {
      const { data, error } = await supabase
        .from('topics')
        .insert([{
          name: newTopic.name.trim(),
          description: newTopic.description.trim(),
          enabled: true,
          last_checked: new Date().toISOString(),
        }])
        .select()
        .single();

      if (error) throw error;

      const topic: Topic = {
        id: data.id,
        name: data.name,
        description: data.description,
        enabled: data.enabled,
        lastChecked: new Date(data.last_checked),
        createdAt: new Date(data.created_at),
      };

      setTopics(prev => [topic, ...prev]);

      toast({
        title: "Topic Created",
        description: `"${topic.name}" has been created successfully`,
      });

      setIsDialogOpen(false);
      setNewTopic({ name: '', description: '' });
    } catch (error) {
      console.error('Failed to create topic:', error);
      toast({
        title: "Error",
        description: "Failed to create topic. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreatingTopic(false);
    }
  };

  const toggleTopic = async (id: string) => {
    if (togglingTopicId) return;

    const topic = topics.find(t => t.id === id);
    if (!topic) return;

    setTopics(prev =>
      prev.map(t =>
        t.id === id ? { ...t, enabled: !t.enabled, lastChecked: new Date() } : t
      )
    );
    setTogglingTopicId(id);

    try {
      const { error } = await supabase
        .from('topics')
        .update({
          enabled: !topic.enabled,
          last_checked: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to toggle topic:', error);
      toast({
        title: "Error",
        description: "Failed to update topic. Please try again.",
        variant: "destructive",
      });
      setTopics(prev =>
        prev.map(t =>
          t.id === id ? { ...t, enabled: topic.enabled, lastChecked: topic.lastChecked } : t
        )
      );
    } finally {
      setTogglingTopicId(null);
    }
  };

  // NEW: Confirmed delete handler
  const confirmDelete = (topic: Topic) => setConfirmDeleteTopic(topic);

  const handleDeleteTopic = async () => {
    if (!confirmDeleteTopic) return;

    setDeletingTopicId(confirmDeleteTopic.id);

    try {
      const { error } = await supabase
        .from('topics')
        .delete()
        .eq('id', confirmDeleteTopic.id);

      if (error) throw error;

      setTopics(prev => prev.filter(t => t.id !== confirmDeleteTopic.id));

      toast({
        title: "Topic Deleted",
        description: `"${confirmDeleteTopic.name}" has been deleted`,
      });
      setConfirmDeleteTopic(null);
    } catch (error) {
      console.error('Failed to delete topic:', error);
      toast({
        title: "Error",
        description: "Failed to delete topic. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingTopicId(null);
    }
  };

  const formatLastChecked = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-3 md:pb-4">
        <div>
          <CardTitle className="text-lg md:text-xl">Notification Subscriptions</CardTitle>
          <Badge variant="outline" className="mt-1 md:mt-2 text-xs">{topics.filter(t => t.enabled).length} Active</Badge>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex items-center space-x-1 md:space-x-2 h-8 md:h-9 text-xs md:text-sm" disabled={creatingTopic || loadingTopics}>
              <Plus className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Add Topic</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Topic</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="topic-name">Topic Name</Label>
                <Input
                  id="topic-name"
                  placeholder="Enter topic name"
                  value={newTopic.name}
                  onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
                  disabled={creatingTopic}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-description">Description</Label>
                <Textarea
                  id="topic-description"
                  placeholder="Enter topic description"
                  value={newTopic.description}
                  onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                  rows={3}
                  disabled={creatingTopic}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={creatingTopic}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTopic} disabled={creatingTopic}>
                  {creatingTopic ? 'Adding...' : 'Add Topic'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        {loadingTopics ? (
          <p className="text-center text-muted-foreground text-sm">Loading topics...</p>
        ) : (
          topics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-center justify-between p-3 md:p-4 border border-border rounded-lg transition-opacity duration-300 ease-in-out"
              style={{ opacity: deletingTopicId === topic.id ? 0.5 : 1 }}
            >
              <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                <Monitor className="h-4 w-4 md:h-5 md:w-5 text-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm md:text-base truncate">{topic.name}</p>
                  <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{topic.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last checked: {formatLastChecked(topic.lastChecked)}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 md:space-x-4 flex-shrink-0">
                <Switch
                  checked={topic.enabled}
                  onCheckedChange={() => toggleTopic(topic.id)}
                  disabled={togglingTopicId === topic.id}
                />
                <Button
                  variant="ghost"
                  size="sm" 
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => confirmDelete(topic)}
                  disabled={deletingTopicId === topic.id}
                  aria-label={`Delete topic ${topic.name}`}
                >
                  <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDeleteTopic} onOpenChange={() => setConfirmDeleteTopic(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete the topic <strong>{confirmDeleteTopic?.name}</strong>? This action cannot be undone.
          </p>
          <DialogFooter className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setConfirmDeleteTopic(null)} disabled={deletingTopicId === confirmDeleteTopic?.id}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTopic}
              disabled={deletingTopicId === confirmDeleteTopic?.id}
            >
              {deletingTopicId === confirmDeleteTopic?.id ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TopicManagement;
