import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, Filter, Eye, PlusCircle, Shield, AlertTriangle, AlertCircle, ArrowUpDown, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ThreatIndicator {
  id: string;
  type: 'ip' | 'domain' | 'url' | 'file_hash' | 'email' | 'cve';
  value: string;
  source: string;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  tags: string[];
}

export default function ThreatIntelViewer() {
  const { toast } = useToast();
  const [indicators, setIndicators] = useState<ThreatIndicator[]>([
    {
      id: '1',
      type: 'ip',
      value: '185.224.138.29',
      source: 'AlienVault OTX',
      firstSeen: '2025-03-15T08:25:43Z',
      lastSeen: '2025-04-05T14:12:19Z',
      confidence: 87,
      severity: 'high',
      description: 'IP associated with Cobalt Strike C2 infrastructure used in recent financial sector attacks.',
      tags: ['malware', 'cobalt_strike', 'c2', 'financial_sector'],
    },
    {
      id: '2',
      type: 'domain',
      value: 'secure-download-portal.xyz',
      source: 'VirusTotal',
      firstSeen: '2025-03-28T16:34:12Z',
      lastSeen: '2025-04-06T09:47:35Z',
      confidence: 92,
      severity: 'critical',
      description: 'Phishing domain mimicking legitimate corporate portal. Used to steal credentials.',
      tags: ['phishing', 'credential_theft', 'active'],
    },
    {
      id: '3',
      type: 'file_hash',
      value: 'a1c2f84b9f5d3e7c0b6a3e2d1f8c7b6a',
      source: 'Mandiant',
      firstSeen: '2025-04-01T11:23:09Z',
      lastSeen: '2025-04-05T22:15:47Z',
      confidence: 95,
      severity: 'critical',
      description: 'SHA-256 hash of ransomware payload associated with BlackCat/ALPHV ransomware group.',
      tags: ['ransomware', 'blackcat', 'alphv', 'payload'],
    },
    {
      id: '4',
      type: 'url',
      value: 'https://malicious-update-server.net/install/update.exe',
      source: 'PhishTank',
      firstSeen: '2025-04-02T18:56:22Z',
      lastSeen: '2025-04-06T16:05:31Z',
      confidence: 89,
      severity: 'high',
      description: 'URL distributing trojanized software update. Downloads BazarLoader.',
      tags: ['malware', 'bazarloader', 'trojan', 'fake_update'],
    },
    {
      id: '5',
      type: 'email',
      value: 'accounts@microsoft-verification.co',
      source: 'Internal Analysis',
      firstSeen: '2025-04-03T09:11:47Z',
      lastSeen: '2025-04-07T10:24:53Z',
      confidence: 94,
      severity: 'medium',
      description: 'Sender email used in Microsoft impersonation phishing campaign targeting employees.',
      tags: ['phishing', 'impersonation', 'microsoft', 'credential_theft'],
    },
    {
      id: '6',
      type: 'cve',
      value: 'CVE-2024-6789',
      source: 'MITRE',
      firstSeen: '2025-03-25T12:45:39Z',
      lastSeen: '2025-04-07T08:30:12Z',
      confidence: 98,
      severity: 'critical',
      description: 'Remote code execution vulnerability in Apache Struts. Actively exploited in the wild.',
      tags: ['rce', 'apache', 'struts', 'active_exploitation'],
    }
  ]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedIndicator, setSelectedIndicator] = useState<ThreatIndicator | null>(null);
  const [sortField, setSortField] = useState<'value' | 'source' | 'confidence' | 'lastSeen'>('lastSeen');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  const handleSortChange = (field: 'value' | 'source' | 'confidence' | 'lastSeen') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const filteredIndicators = indicators
    .filter(indicator => {
      // Filter by search query
      const matchesSearch = indicator.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           indicator.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           indicator.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Filter by type
      const matchesType = selectedType === 'all' || indicator.type === selectedType;
      
      // Filter by severity
      const matchesSeverity = selectedSeverity === 'all' || indicator.severity === selectedSeverity;
      
      // Filter by source
      const matchesSource = selectedSource === 'all' || indicator.source === selectedSource;
      
      return matchesSearch && matchesType && matchesSeverity && matchesSource;
    })
    .sort((a, b) => {
      if (sortField === 'value') {
        return sortDirection === 'asc' 
          ? a.value.localeCompare(b.value) 
          : b.value.localeCompare(a.value);
      } else if (sortField === 'source') {
        return sortDirection === 'asc' 
          ? a.source.localeCompare(b.source) 
          : b.source.localeCompare(a.source);
      } else if (sortField === 'confidence') {
        return sortDirection === 'asc' 
          ? a.confidence - b.confidence 
          : b.confidence - a.confidence;
      } else if (sortField === 'lastSeen') {
        return sortDirection === 'asc' 
          ? new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime() 
          : new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      }
      return 0;
    });
  
  const resetFilters = () => {
    setSelectedType('all');
    setSelectedSeverity('all');
    setSelectedSource('all');
  };
  
  const handleLookupIndicator = (indicator: ThreatIndicator) => {
    toast({
      title: "Indicator Lookup",
      description: `Looking up additional details for ${indicator.type}: ${indicator.value}`,
    });
    
    // En una implementación real, aquí se haría la consulta a la API de threat intelligence
    setTimeout(() => {
      setSelectedIndicator(indicator);
      setDetailDialogOpen(true);
    }, 1000);
  };
  
  const handleAddToWatchlist = (indicator: ThreatIndicator) => {
    toast({
      title: "Added to Watchlist",
      description: `${indicator.type.toUpperCase()}: ${indicator.value} has been added to your active watchlist.`,
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ip':
        return <div className="w-8 h-8 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center">IP</div>;
      case 'domain':
        return <div className="w-8 h-8 bg-purple-500/20 text-purple-500 rounded-full flex items-center justify-center">D</div>;
      case 'url':
        return <div className="w-8 h-8 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center">U</div>;
      case 'file_hash':
        return <div className="w-8 h-8 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center">F</div>;
      case 'email':
        return <div className="w-8 h-8 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center">E</div>;
      case 'cve':
        return <div className="w-8 h-8 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center">C</div>;
      default:
        return <div className="w-8 h-8 bg-gray-500/20 text-gray-500 rounded-full flex items-center justify-center">?</div>;
    }
  };
  
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-600">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'medium':
        return <Badge className="bg-amber-500">Medium</Badge>;
      case 'low':
        return <Badge className="bg-green-600">Low</Badge>;
      case 'info':
        return <Badge className="bg-blue-500">Info</Badge>;
      default:
        return <Badge className="bg-gray-500">Unknown</Badge>;
    }
  };
  
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };
  
  const typeCounts = indicators.reduce((acc, indicator) => {
    acc[indicator.type] = (acc[indicator.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const severityCounts = indicators.reduce((acc, indicator) => {
    acc[indicator.severity] = (acc[indicator.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const sourceCounts = indicators.reduce((acc, indicator) => {
    acc[indicator.source] = (acc[indicator.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const uniqueTypes = Object.keys(typeCounts);
  const uniqueSeverities = Object.keys(severityCounts);
  const uniqueSources = Object.keys(sourceCounts);
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-2/3 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
              <Input
                placeholder="Search indicators..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => setShowFilterDialog(true)}
              >
                <Filter className="h-4 w-4" />
                Filters
                {(selectedType !== 'all' || selectedSeverity !== 'all' || selectedSource !== 'all') && (
                  <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full">
                    {(selectedType !== 'all' ? 1 : 0) + 
                     (selectedSeverity !== 'all' ? 1 : 0) + 
                     (selectedSource !== 'all' ? 1 : 0)}
                  </Badge>
                )}
              </Button>
              
              <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Filter Indicators</DialogTitle>
                    <DialogDescription>
                      Narrow down indicators based on specific criteria.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div>
                      <Label className="mb-2 block">Indicator Type</Label>
                      <Select value={selectedType} onValueChange={setSelectedType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          {uniqueTypes.map(type => (
                            <SelectItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} ({typeCounts[type]})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="mb-2 block">Severity</Label>
                      <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Severities</SelectItem>
                          {uniqueSeverities.map(severity => (
                            <SelectItem key={severity} value={severity}>
                              {severity.charAt(0).toUpperCase() + severity.slice(1)} ({severityCounts[severity]})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="mb-2 block">Source</Label>
                      <Select value={selectedSource} onValueChange={setSelectedSource}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources</SelectItem>
                          {uniqueSources.map(source => (
                            <SelectItem key={source} value={source}>
                              {source} ({sourceCounts[source]})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="flex justify-between">
                    <Button 
                      variant="outline" 
                      onClick={resetFilters}
                      disabled={selectedType === 'all' && selectedSeverity === 'all' && selectedSource === 'all'}
                    >
                      Reset Filters
                    </Button>
                    <Button onClick={() => setShowFilterDialog(false)}>
                      Apply Filters
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Threat Indicators</CardTitle>
              <CardDescription>
                View and analyze indicators of compromise from your intelligence sources.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Indicator</th>
                      <th className="text-left py-3 px-4 font-medium cursor-pointer" onClick={() => handleSortChange('source')}>
                        <div className="flex items-center">
                          Source
                          <ArrowUpDown className="ml-1 h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-medium cursor-pointer" onClick={() => handleSortChange('confidence')}>
                        <div className="flex items-center justify-center">
                          Confidence
                          <ArrowUpDown className="ml-1 h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-medium">Severity</th>
                      <th className="text-center py-3 px-4 font-medium cursor-pointer" onClick={() => handleSortChange('lastSeen')}>
                        <div className="flex items-center justify-center">
                          Last Seen
                          <ArrowUpDown className="ml-1 h-4 w-4" />
                        </div>
                      </th>
                      <th className="text-right py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndicators.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          {searchQuery || selectedType !== 'all' || selectedSeverity !== 'all' || selectedSource !== 'all' 
                            ? 'No indicators match your search criteria.' 
                            : 'No threat indicators available.'}
                        </td>
                      </tr>
                    ) : (
                      filteredIndicators.map(indicator => (
                        <tr key={indicator.id} className="border-b hover:bg-accent/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {getTypeIcon(indicator.type)}
                              <div>
                                <div className="font-medium font-mono text-sm">{indicator.value}</div>
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {indicator.description}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">{indicator.source}</td>
                          <td className="py-3 px-4 text-center">
                            <div className="relative w-full max-w-24 mx-auto bg-secondary h-2 rounded-full overflow-hidden">
                              <div 
                                className={`absolute top-0 left-0 h-full ${
                                  indicator.confidence >= 90 ? 'bg-green-500' :
                                  indicator.confidence >= 70 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${indicator.confidence}%` }}
                              />
                            </div>
                            <div className="text-xs mt-1">{indicator.confidence}%</div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {getSeverityBadge(indicator.severity)}
                          </td>
                          <td className="py-3 px-4 text-center text-sm">
                            {formatDate(indicator.lastSeen)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                title="View details"
                                onClick={() => handleLookupIndicator(indicator)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                title="Add to watchlist"
                                onClick={() => handleAddToWatchlist(indicator)}
                              >
                                <PlusCircle className="h-4 w-4" />
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
            {filteredIndicators.length > 0 && (
              <CardFooter className="flex justify-between border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredIndicators.length} of {indicators.length} indicators
                </div>
                <Button
                  variant="link"
                  className="text-primary"
                  onClick={() => {
                    toast({
                      title: "Exporting Data",
                      description: "Downloading indicator data in STIX format.",
                    });
                  }}
                >
                  Export as STIX
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
        
        <div className="lg:w-1/3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
              <CardDescription>
                Overview of your threat intelligence data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-2">By Type</h3>
                <div className="space-y-2">
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(type)}
                        <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                      </div>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium mb-2">By Severity</h3>
                <div className="space-y-2">
                  {Object.entries(severityCounts)
                    .sort((a, b) => {
                      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                      return severityOrder[a[0] as keyof typeof severityOrder] - severityOrder[b[0] as keyof typeof severityOrder];
                    })
                    .map(([severity, count]) => (
                      <div key={severity} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {severity === 'critical' && <AlertCircle className="h-5 w-5 text-red-600" />}
                          {severity === 'high' && <AlertTriangle className="h-5 w-5 text-orange-500" />}
                          {severity === 'medium' && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                          {severity === 'low' && <Shield className="h-5 w-5 text-green-600" />}
                          {severity === 'info' && <Shield className="h-5 w-5 text-blue-500" />}
                          <span className="text-sm capitalize">{severity}</span>
                        </div>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium mb-2">Top Sources</h3>
                <div className="space-y-2">
                  {Object.entries(sourceCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([source, count]) => (
                      <div key={source} className="flex items-center justify-between">
                        <span className="text-sm">{source}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Quick Search</CardTitle>
              <CardDescription>
                Lookup a specific indicator of compromise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="ioc" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ioc">IOC</TabsTrigger>
                  <TabsTrigger value="cve">CVE</TabsTrigger>
                </TabsList>
                <TabsContent value="ioc" className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="ioc-type" className="mb-2 block">Indicator Type</Label>
                    <Select defaultValue="ip">
                      <SelectTrigger id="ioc-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ip">IP Address</SelectItem>
                        <SelectItem value="domain">Domain</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="file_hash">File Hash</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="ioc-value" className="mb-2 block">Value</Label>
                    <Input id="ioc-value" placeholder="Enter indicator value" />
                  </div>
                  
                  <Button 
                    className="w-full"
                    onClick={() => {
                      const iocType = (document.getElementById('ioc-type') as HTMLSelectElement)?.value || 'ip';
                      const iocValue = (document.getElementById('ioc-value') as HTMLInputElement)?.value;
                      
                      if (!iocValue) {
                        toast({
                          title: "Input Required",
                          description: "Please enter a value to search for.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      toast({
                        title: "Searching...",
                        description: `Looking up ${iocType}: ${iocValue} across all threat intelligence sources.`,
                      });
                    }}
                  >
                    Search
                  </Button>
                </TabsContent>
                
                <TabsContent value="cve" className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="cve-id" className="mb-2 block">CVE ID</Label>
                    <Input id="cve-id" placeholder="CVE-YYYY-NNNNN" />
                  </div>
                  
                  <Button 
                    className="w-full"
                    onClick={() => {
                      const cveValue = (document.getElementById('cve-id') as HTMLInputElement)?.value;
                      
                      if (!cveValue) {
                        toast({
                          title: "Input Required",
                          description: "Please enter a CVE ID to search for.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      if (!cveValue.match(/^CVE-\d{4}-\d{4,}$/i)) {
                        toast({
                          title: "Invalid Format",
                          description: "Please enter a valid CVE ID (e.g., CVE-2023-12345).",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      toast({
                        title: "Searching...",
                        description: `Looking up vulnerability information for ${cveValue}.`,
                      });
                    }}
                  >
                    Search
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Indicator Detail Dialog */}
      {selectedIndicator && (
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {getTypeIcon(selectedIndicator.type)}
                <span>Indicator Details</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Overview</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Type</div>
                      <div className="capitalize">{selectedIndicator.type.replace('_', ' ')}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Value</div>
                      <div className="font-mono">{selectedIndicator.value}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Source</div>
                      <div>{selectedIndicator.source}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Severity</div>
                      <div>{getSeverityBadge(selectedIndicator.severity)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">First Seen</div>
                      <div>{formatDate(selectedIndicator.firstSeen)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Last Seen</div>
                      <div>{formatDate(selectedIndicator.lastSeen)}</div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground">{selectedIndicator.description}</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Additional Details</h3>
                  
                  <div className="bg-secondary/50 p-4 rounded-md">
                    <h4 className="font-medium mb-2">Example Related Activity</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Observed in campaign targeting financial sector (Jan 2025)</li>
                      <li>Associated with APT group "ShadowPhoenix"</li>
                      <li>Used in multi-stage attack chains involving phishing</li>
                      <li>Part of infrastructure used for data exfiltration</li>
                    </ul>
                  </div>
                </div>
                
                {selectedIndicator.tags.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedIndicator.tags.map(tag => (
                        <Badge key={tag} variant="secondary">
                          {tag.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Confidence</h3>
                  <div className="bg-secondary/50 p-4 rounded-md">
                    <div className="text-center mb-2 text-3xl font-bold">
                      {selectedIndicator.confidence}%
                    </div>
                    <div className="relative w-full h-3 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={`absolute top-0 left-0 h-full ${
                          selectedIndicator.confidence >= 90 ? 'bg-green-500' :
                          selectedIndicator.confidence >= 70 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${selectedIndicator.confidence}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Actions</h3>
                  <div className="space-y-2">
                    <Button 
                      className="w-full justify-start"
                      onClick={() => {
                        handleAddToWatchlist(selectedIndicator);
                        setDetailDialogOpen(false);
                      }}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add to Watchlist
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => {
                        toast({
                          title: "Searching Environment",
                          description: `Scanning your environment for this ${selectedIndicator.type}.`,
                        });
                        setDetailDialogOpen(false);
                      }}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      Search in Environment
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => {
                        window.open(`https://www.virustotal.com/gui/search/${encodeURIComponent(selectedIndicator.value)}`, '_blank');
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Check in VirusTotal
                    </Button>
                    
                    {selectedIndicator.type === 'cve' && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        onClick={() => {
                          window.open(`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(selectedIndicator.value)}`, '_blank');
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View in NVD
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface IndicatorCardProps {
  indicator: ThreatIndicator;
  onLookup: (indicator: ThreatIndicator) => void;
  onAddToWatchlist: (indicator: ThreatIndicator) => void;
}

function IndicatorCard({ indicator, onLookup, onAddToWatchlist }: IndicatorCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-0">
        <div className="flex justify-between items-start">
          <Badge className="capitalize">{indicator.type.replace('_', ' ')}</Badge>
          {indicator.severity === 'critical' && <AlertCircle className="h-5 w-5 text-red-600" />}
          {indicator.severity === 'high' && <AlertTriangle className="h-5 w-5 text-orange-500" />}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="font-medium font-mono text-sm mb-2 truncate">{indicator.value}</div>
        <p className="text-xs text-muted-foreground line-clamp-2">{indicator.description}</p>
      </CardContent>
      <CardFooter className="p-4 pt-0 border-t flex justify-between">
        <div className="text-xs text-muted-foreground">
          {new Date(indicator.lastSeen).toLocaleDateString()}
        </div>
        <div className="flex space-x-1">
          <Button variant="ghost" size="icon" onClick={() => onLookup(indicator)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddToWatchlist(indicator)}>
            <PlusCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}