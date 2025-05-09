import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { ThreatIntel } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimeAgo } from "@/lib/utils/severityUtils";
import { useToast } from "@/hooks/use-toast";

// Nuevos componentes para Threat Intelligence
import FeedManagement from "@/components/threat-intelligence/FeedManagement";
import ThreatIntelViewer from "@/components/threat-intelligence/ThreatIntelViewer";

interface ThreatIntelligenceProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

const ThreatIntelligence: FC<ThreatIntelligenceProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeTiTab, setActiveTiTab] = useState<string>("feeds");
  
  const { data: threatIntel = [], isLoading } = useQuery<ThreatIntel[]>({
    queryKey: ['/api/threat-intel'],
  });
  
  const filteredIntel = threatIntel.filter(item => {
    const matchesSource = sourceFilter === 'all' || item.source.toLowerCase().includes(sourceFilter.toLowerCase());
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    return matchesSource && matchesType;
  });
  
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'apt':
        return (
          <Badge variant="outline" className="bg-red-700 bg-opacity-20 text-red-500">
            APT
          </Badge>
        );
      case 'vulnerability':
        return (
          <Badge variant="outline" className="bg-destructive bg-opacity-20 text-destructive">
            Vulnerability
          </Badge>
        );
      case 'ransomware':
        return (
          <Badge variant="outline" className="bg-orange-700 bg-opacity-20 text-orange-500">
            Ransomware
          </Badge>
        );
      case 'malware':
        return (
          <Badge variant="outline" className="bg-purple-700 bg-opacity-20 text-purple-400">
            Malware
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-blue-900 bg-opacity-20 text-blue-500">
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Badge>
        );
    }
  };
  
  const formatIocs = (iocs: any) => {
    if (!iocs) return null;
    
    const entries = [];
    
    if (iocs.ips) {
      entries.push(<p key="ips">IP: {Array.isArray(iocs.ips) ? iocs.ips.join(', ') : iocs.ips}</p>);
    }
    if (iocs.domains) {
      entries.push(<p key="domains">Domain: {Array.isArray(iocs.domains) ? iocs.domains.join(', ') : iocs.domains}</p>);
    }
    if (iocs.hashes) {
      const hashDisplay = Array.isArray(iocs.hashes) 
        ? iocs.hashes.map((h: any) => h.substring(0, 7) + '...').join(', ')
        : iocs.hashes.substring(0, 7) + '...';
      entries.push(<p key="hashes">Hash: {hashDisplay}</p>);
    }
    if (iocs.cve) {
      entries.push(<p key="cve">CVE: {iocs.cve}</p>);
    }
    if (iocs.cvss) {
      entries.push(<p key="cvss">CVSS: {iocs.cvss}</p>);
    }
    if (iocs.fileTypes) {
      entries.push(<p key="fileTypes">File Types: {Array.isArray(iocs.fileTypes) ? iocs.fileTypes.join(', ') : iocs.fileTypes}</p>);
    }
    if (iocs.emailSubjects) {
      entries.push(<p key="emailSubjects">Email Subjects: {Array.isArray(iocs.emailSubjects) ? iocs.emailSubjects.join(', ') : iocs.emailSubjects}</p>);
    }
    
    return entries;
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="threat-intelligence" />
      
      <MainContent pageTitle="Threat Intelligence" organization={organization}>
        <Tabs defaultValue="feeds" value={activeTiTab} onValueChange={setActiveTiTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="feeds">Feed Management</TabsTrigger>
            <TabsTrigger value="indicators">Indicators</TabsTrigger>
            <TabsTrigger value="legacy">Legacy View</TabsTrigger>
          </TabsList>
          
          {/* Tab para gestión de feeds */}
          <TabsContent value="feeds">
            <FeedManagement />
          </TabsContent>
          
          {/* Tab para visualización de indicadores */}
          <TabsContent value="indicators">
            <ThreatIntelViewer />
          </TabsContent>
          
          {/* Tab para la vista anterior */}
          <TabsContent value="legacy">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12">
                <Card className="mb-6">
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-4 items-center">
                      <div>
                        <label className="text-xs text-muted-foreground mr-2">Source</label>
                        <select 
                          className="bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                          value={sourceFilter}
                          onChange={(e) => setSourceFilter(e.target.value)}
                        >
                          <option value="all">All Sources</option>
                          <option value="osint">OSINT</option>
                          <option value="vendor">Vendor Advisory</option>
                          <option value="external">External Intelligence</option>
                          <option value="internal">Internal Analysis</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-muted-foreground mr-2">Type</label>
                        <select 
                          className="bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                          value={typeFilter}
                          onChange={(e) => setTypeFilter(e.target.value)}
                        >
                          <option value="all">All Types</option>
                          <option value="apt">APT</option>
                          <option value="vulnerability">Vulnerability</option>
                          <option value="ransomware">Ransomware</option>
                          <option value="malware">Malware</option>
                          <option value="phishing">Phishing</option>
                        </select>
                      </div>
                    </div>
                    
                    <div>
                      <Button>
                        <i className="fas fa-plus mr-2"></i> Add Custom Intelligence
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="col-span-12 lg:col-span-8">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Threat Intelligence Feed</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {filteredIntel.length} {filteredIntel.length === 1 ? 'item' : 'items'}
                    </span>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        <span>Loading threat intelligence...</span>
                      </div>
                    ) : filteredIntel.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <i className="fas fa-globe-americas text-3xl mb-3"></i>
                        <p>No threat intelligence matches the selected filters</p>
                        {(sourceFilter !== 'all' || typeFilter !== 'all') && (
                          <button 
                            className="mt-3 text-primary hover:underline"
                            onClick={() => {
                              setSourceFilter('all');
                              setTypeFilter('all');
                            }}
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredIntel.map(item => (
                          <div key={item.id} className="p-4 bg-background-lighter rounded-lg border border-gray-700">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-2">
                                {getTypeBadge(item.type)}
                                <h3 className="font-medium text-text-primary">{item.title}</h3>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatTimeAgo(item.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                            
                            {item.iocs && (
                              <div className="bg-background p-3 rounded text-xs font-mono text-muted-foreground mb-3 overflow-x-auto">
                                {formatIocs(item.iocs)}
                              </div>
                            )}
                            
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-background">
                                  Source: {item.source}
                                </Badge>
                                {item.confidence && (
                                  <Badge variant="outline" className="bg-background">
                                    Confidence: {item.confidence}%
                                  </Badge>
                                )}
                                {item.relevance && (
                                  <Badge variant="outline" className={`bg-background ${
                                    item.relevance === 'high' 
                                      ? 'text-red-500' 
                                      : item.relevance === 'medium' 
                                      ? 'text-yellow-500' 
                                      : 'text-green-500'
                                  }`}>
                                    Relevance: {item.relevance.charAt(0).toUpperCase() + item.relevance.slice(1)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    toast({
                                      title: "Added to Watchlist",
                                      description: `"${item.title}" has been added to your watchlist.`,
                                    });
                                  }}
                                >
                                  <i className="fas fa-plus mr-1"></i> Add to Watchlist
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    toast({
                                      title: "Searching Environment",
                                      description: `Scanning your environment for indicators related to "${item.title}".`,
                                    });
                                  }}
                                >
                                  <i className="fas fa-search mr-1"></i> Search Environment
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              <div className="col-span-12 lg:col-span-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Watchlists</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">Active Threat Actors</p>
                          <p className="text-xs text-muted-foreground">12 entities</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "Watchlist Viewed",
                              description: "Active Threat Actors watchlist loaded.",
                            });
                          }}
                        >
                          <i className="fas fa-eye"></i>
                        </Button>
                      </div>
                      
                      <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">Critical Vulnerabilities</p>
                          <p className="text-xs text-muted-foreground">8 CVEs</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "Watchlist Viewed",
                              description: "Critical Vulnerabilities watchlist loaded.",
                            });
                          }}
                        >
                          <i className="fas fa-eye"></i>
                        </Button>
                      </div>
                      
                      <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">Ransomware Indicators</p>
                          <p className="text-xs text-muted-foreground">15 indicators</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "Watchlist Viewed",
                              description: "Ransomware Indicators watchlist loaded.",
                            });
                          }}
                        >
                          <i className="fas fa-eye"></i>
                        </Button>
                      </div>
                      
                      <Button 
                        className="w-full"
                        onClick={() => {
                          toast({
                            title: "Create Watchlist",
                            description: "New watchlist creation form opened.",
                          });
                        }}
                      >
                        <i className="fas fa-plus mr-2"></i> Create New Watchlist
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Intelligence Search</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="ioc">
                      <TabsList className="w-full mb-4">
                        <TabsTrigger value="ioc" className="flex-1">IOC Lookup</TabsTrigger>
                        <TabsTrigger value="cve" className="flex-1">CVE Search</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="ioc">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Indicator Type</label>
                            <select 
                              className="w-full bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                              id="ioc-type"
                            >
                              <option>IP Address</option>
                              <option>Domain</option>
                              <option>File Hash</option>
                              <option>URL</option>
                              <option>Email</option>
                            </select>
                          </div>
                          
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Indicator Value</label>
                            <input 
                              type="text" 
                              placeholder="Enter value..." 
                              className="w-full bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                              id="ioc-value"
                            />
                          </div>
                          
                          <Button 
                            className="w-full"
                            onClick={() => {
                              const iocType = (document.getElementById('ioc-type') as HTMLSelectElement)?.value || 'IP Address';
                              const iocValue = (document.getElementById('ioc-value') as HTMLInputElement)?.value;
                              
                              if (!iocValue) {
                                toast({
                                  title: "Search Error",
                                  description: "Please enter an indicator value to search.",
                                  variant: "destructive"
                                });
                                return;
                              }
                              
                              toast({
                                title: "IOC Search",
                                description: `Searching for ${iocType}: ${iocValue} in threat intelligence database.`,
                              });
                            }}
                          >
                            Search
                          </Button>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="cve">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">CVE ID</label>
                            <input 
                              type="text" 
                              placeholder="CVE-YYYY-NNNNN" 
                              className="w-full bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                              id="cve-id"
                            />
                          </div>
                          
                          <Button 
                            className="w-full"
                            onClick={() => {
                              const cveId = (document.getElementById('cve-id') as HTMLInputElement)?.value;
                              
                              if (!cveId) {
                                toast({
                                  title: "Search Error",
                                  description: "Please enter a CVE ID to search.",
                                  variant: "destructive"
                                });
                                return;
                              }
                              
                              if (!cveId.match(/^CVE-\d{4}-\d{4,}$/i)) {
                                toast({
                                  title: "Invalid Format",
                                  description: "Please enter a valid CVE ID (e.g., CVE-2023-12345).",
                                  variant: "destructive"
                                });
                                return;
                              }
                              
                              toast({
                                title: "CVE Search",
                                description: `Searching for vulnerability information for ${cveId}.`,
                              });
                              
                              // Clear form and force URL back to root if opened with query params
                              // (simulating handling a deeplink)
                              if (window.location.search.includes("cve")) {
                                const locationObj = window.location;
                                locationObj.pathname = "/";
                                locationObj.search = "";
                                history.replaceState(locationObj, "");
                              }
                            }}
                          >
                            <i className="fas fa-search mr-2"></i> Search
                          </Button>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </MainContent>
    </div>
  );
};

export default ThreatIntelligence;
