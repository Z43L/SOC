import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, RefreshCw, Trash2, Settings, ArrowUpDown, PlusCircle, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThreatFeed, ThreatFeedType, ThreatFeedStatusType, InsertThreatFeed } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function FeedManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isConfigureDialogOpen, setIsConfigureDialogOpen] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<ThreatFeed | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'provider' | 'iocsCount' | 'lastUpdated'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // State for add form
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedProvider, setNewFeedProvider] = useState('');
  const [newFeedType, setNewFeedType] = useState<ThreatFeedType>('ioc');
  const [newFeedDescription, setNewFeedDescription] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedApiKey, setNewFeedApiKey] = useState('');
  
  // State for edit form
  const [editFeedName, setEditFeedName] = useState('');
  const [editFeedDescription, setEditFeedDescription] = useState('');
  const [editFeedUrl, setEditFeedUrl] = useState('');
  const [editFeedApiKey, setEditFeedApiKey] = useState('');
  
  // Fetch threat feeds
  const { 
    data: feeds = [], 
    isLoading,
    isError
  } = useQuery<ThreatFeed[]>({
    queryKey: ['/api/threat-feeds'],
  });
  
  // Add threat feed mutation
  const addFeedMutation = useMutation({
    mutationFn: async (feed: InsertThreatFeed) => {
      const res = await apiRequest('POST', '/api/threat-feeds', feed);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threat-feeds'] });
      setIsAddDialogOpen(false);
      
      // Reset form
      setNewFeedName('');
      setNewFeedProvider('');
      setNewFeedType('ioc');
      setNewFeedDescription('');
      setNewFeedUrl('');
      setNewFeedApiKey('');
      
      toast({
        title: 'Feed Added',
        description: `The feed "${newFeedName}" has been added successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Adding Feed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });
  
  // Update threat feed mutation
  const updateFeedMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<InsertThreatFeed> }) => {
      const res = await apiRequest('PUT', `/api/threat-feeds/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threat-feeds'] });
      setIsConfigureDialogOpen(false);
      
      toast({
        title: 'Feed Updated',
        description: `The feed "${editFeedName}" has been updated successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Updating Feed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });
  
  // Delete threat feed mutation
  const deleteFeedMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/threat-feeds/${id}`);
      return await res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/threat-feeds'] });
      const deletedFeed = feeds.find(f => f.id === id);
      
      toast({
        title: 'Feed Deleted',
        description: `The feed "${deletedFeed?.name}" has been deleted.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Deleting Feed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });
  
  // Toggle feed status mutation
  const toggleFeedMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number, isActive: boolean }) => {
      const res = await apiRequest('POST', `/api/threat-feeds/${id}/toggle`, { isActive });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/threat-feeds'] });
      
      toast({
        title: data.isActive ? 'Feed Activated' : 'Feed Deactivated',
        description: `The feed "${data.name}" has been ${data.isActive ? 'activated' : 'deactivated'}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Toggling Feed Status',
        description: error.message,
        variant: 'destructive',
      });
    }
  });
  
  const handleSortChange = (field: 'name' | 'provider' | 'iocsCount' | 'lastUpdated') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  const sortedAndFilteredFeeds = feeds
    .filter(feed => 
      feed.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortField === 'name') {
        return sortDirection === 'asc' 
          ? a.name.localeCompare(b.name) 
          : b.name.localeCompare(a.name);
      } else if (sortField === 'provider') {
        return sortDirection === 'asc' 
          ? a.provider.localeCompare(b.provider) 
          : b.provider.localeCompare(a.provider);
      } else if (sortField === 'iocsCount') {
        const aCount = a.iocsCount ?? 0;
        const bCount = b.iocsCount ?? 0;
        return sortDirection === 'asc' 
          ? aCount - bCount 
          : bCount - aCount;
      } else if (sortField === 'lastUpdated') {
        const aDate = a.lastUpdated ? new Date(a.lastUpdated) : new Date(0);
        const bDate = b.lastUpdated ? new Date(b.lastUpdated) : new Date(0);
        return sortDirection === 'asc' 
          ? aDate.getTime() - bDate.getTime() 
          : bDate.getTime() - aDate.getTime();
      }
      return 0;
    });
  
  const handleAddFeed = () => {
    const newFeed: InsertThreatFeed = {
      name: newFeedName,
      provider: newFeedProvider,
      type: newFeedType,
      description: newFeedDescription,
      url: newFeedUrl,
      apiKey: newFeedApiKey,
      isActive: true
    };
    
    addFeedMutation.mutate(newFeed);
  };
  
  const handleConfigureFeed = (feed: ThreatFeed) => {
    setSelectedFeed(feed);
    setEditFeedName(feed.name);
    setEditFeedDescription(feed.description);
    setEditFeedUrl(feed.url);
    setEditFeedApiKey(feed.apiKey || '');
    setIsConfigureDialogOpen(true);
  };
  
  const handleSaveConfiguration = () => {
    if (!selectedFeed) return;
    
    const updatedFeed = {
      name: editFeedName,
      description: editFeedDescription,
      url: editFeedUrl,
      apiKey: editFeedApiKey
    };
    
    updateFeedMutation.mutate({ id: selectedFeed.id, data: updatedFeed });
  };
  
  const handleToggleFeed = (feed: ThreatFeed, newState: boolean) => {
    toggleFeedMutation.mutate({ id: feed.id, isActive: newState });
  };
  
  const handleDeleteFeed = (feed: ThreatFeed) => {
    deleteFeedMutation.mutate(feed.id);
  };
  
  const handleFetchNow = (feed: ThreatFeed) => {
    toast({
      title: 'Fetching Data',
      description: `Manually fetching data from "${feed.name}"...`,
    });
    
    // In a real implementation, we would make an API call to refresh the feed data
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/threat-feeds'] });
      
      toast({
        title: 'Data Fetched',
        description: `Successfully fetched new threat intelligence from "${feed.name}".`,
      });
    }, 2000);
  };
  
  const getStatusBadge = (status: 'active' | 'inactive' | 'error') => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600">Active</Badge>;
      case 'inactive':
        return <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return null;
    }
  };
  
  const formatDate = (dateString: string | Date) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString(undefined, options);
  };
  
  const renderFeedIcon = (iconName: string | null) => {
    // En una implementación real, aquí se cargarían iconos para cada proveedor
    const icon = iconName || 'feed';
    return <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
      {icon.charAt(0).toUpperCase()}
    </div>;
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
          <Input
            placeholder="Search feeds..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Threat Feed
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Threat Feed</DialogTitle>
              <DialogDescription>
                Add a new threat intelligence feed to enhance your security monitoring.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="feed-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="feed-name"
                  placeholder="Feed name"
                  className="col-span-3"
                  value={newFeedName}
                  onChange={(e) => setNewFeedName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="feed-provider" className="text-right">
                  Provider
                </Label>
                <Input
                  id="feed-provider"
                  placeholder="Provider name"
                  className="col-span-3"
                  value={newFeedProvider}
                  onChange={(e) => setNewFeedProvider(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="feed-type" className="text-right">
                  Type
                </Label>
                <Select 
                  value={newFeedType} 
                  onValueChange={(value) => setNewFeedType(value as ThreatFeedType)}
                >
                  <SelectTrigger className="col-span-3" id="feed-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ioc">IOC</SelectItem>
                    <SelectItem value="vulnerability">Vulnerability</SelectItem>
                    <SelectItem value="threat-actor">Threat Actor</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="feed-description" className="text-right">
                  Description
                </Label>
                <Input
                  id="feed-description"
                  placeholder="Brief description"
                  className="col-span-3"
                  value={newFeedDescription}
                  onChange={(e) => setNewFeedDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="feed-url" className="text-right">
                  URL
                </Label>
                <Input
                  id="feed-url"
                  placeholder="API or feed URL"
                  className="col-span-3"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="feed-api-key" className="text-right">
                  API Key
                </Label>
                <Input
                  id="feed-api-key"
                  type="password"
                  placeholder="API key (if required)"
                  className="col-span-3"
                  value={newFeedApiKey}
                  onChange={(e) => setNewFeedApiKey(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddFeed}>
                Add Feed
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Threat Intelligence Feeds</CardTitle>
          <CardDescription>
            Manage your external threat intelligence data sources.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Feed</th>
                  <th className="text-left py-3 px-4 font-medium cursor-pointer" onClick={() => handleSortChange('provider')}>
                    <div className="flex items-center">
                      Provider
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-medium">Type</th>
                  <th className="text-center py-3 px-4 font-medium cursor-pointer" onClick={() => handleSortChange('iocsCount')}>
                    <div className="flex items-center justify-center">
                      IOCs Count
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium cursor-pointer" onClick={() => handleSortChange('lastUpdated')}>
                    <div className="flex items-center justify-center">
                      Last Updated
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium">Status</th>
                  <th className="text-center py-3 px-4 font-medium">Active</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredFeeds.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No feeds match your search.' : 'No threat intelligence feeds configured.'}
                    </td>
                  </tr>
                ) : (
                  sortedAndFilteredFeeds.map(feed => (
                    <tr key={feed.id} className="border-b hover:bg-accent/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {renderFeedIcon(feed.icon)}
                          <div>
                            <div className="font-medium">{feed.name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {feed.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{feed.provider}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="capitalize">{feed.type}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">{(feed.iocsCount ?? 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center text-sm">
                        {feed.lastUpdated ? formatDate(feed.lastUpdated) : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(feed.status as 'active' | 'inactive' | 'error')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Switch
                          checked={feed.isActive}
                          onCheckedChange={(checked) => handleToggleFeed(feed, checked)}
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            title="Fetch now"
                            onClick={() => handleFetchNow(feed)}
                            disabled={!feed.isActive}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            title="Configure"
                            onClick={() => handleConfigureFeed(feed)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            title="Delete"
                            onClick={() => handleDeleteFeed(feed)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center border-t px-6 py-4">
          <div className="text-sm text-muted-foreground">
            Showing {sortedAndFilteredFeeds.length} of {feeds.length} feeds
          </div>
          {feeds.some(feed => feed.status === 'error') && (
            <div className="flex items-center text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mr-1" /> 
              Some feeds have errors that require attention
            </div>
          )}
        </CardFooter>
      </Card>
      
      {/* Configuration Dialog */}
      {selectedFeed && (
        <Dialog open={isConfigureDialogOpen} onOpenChange={setIsConfigureDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Configure Feed: {selectedFeed.name}</DialogTitle>
              <DialogDescription>
                Update the configuration settings for this feed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-feed-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="edit-feed-name"
                  value={editFeedName}
                  onChange={(e) => setEditFeedName(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-feed-description" className="text-right">
                  Description
                </Label>
                <Input
                  id="edit-feed-description"
                  value={editFeedDescription}
                  onChange={(e) => setEditFeedDescription(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-feed-url" className="text-right">
                  URL
                </Label>
                <Input
                  id="edit-feed-url"
                  value={editFeedUrl}
                  onChange={(e) => setEditFeedUrl(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-feed-api-key" className="text-right">
                  API Key
                </Label>
                <Input
                  id="edit-feed-api-key"
                  type="password"
                  value={editFeedApiKey}
                  onChange={(e) => setEditFeedApiKey(e.target.value)}
                  className="col-span-3"
                />
              </div>
              {selectedFeed.status === 'error' && (
                <div className="bg-destructive/10 p-3 rounded-md flex items-start">
                  <AlertCircle className="h-5 w-5 text-destructive mr-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-destructive">Connection Error</div>
                    <p className="text-sm">
                      Unable to connect to this feed. Please check the URL and API key are correct.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              {selectedFeed.status === 'error' && (
                <Button 
                  variant="outline" 
                  className="mr-auto"
                  onClick={() => {
                    // Simulate test
                    toast({
                      title: 'Testing Connection',
                      description: 'Attempting to connect to the feed...',
                    });
                    
                    setTimeout(() => {
                      toast({
                        title: 'Connection Failed',
                        description: 'Could not establish connection. Please check your settings.',
                        variant: 'destructive',
                      });
                    }, 2000);
                  }}
                >
                  Test Connection
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsConfigureDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveConfiguration}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}