import { FC, ReactNode } from 'react';
import { ThreatIntel } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Globe, Loader2, MoreVertical } from 'lucide-react';

interface ThreatIntelligenceProps {
  items: ThreatIntel[];
  isLoading: boolean;
}

const ThreatIntelligence: FC<ThreatIntelligenceProps> = ({ items, isLoading }) => {
  // Asegurar que items sea un array
  const displayItems = Array.isArray(items) ? items : [];
  
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'apt':
        return (
          <Badge variant="outline" className="border-red-500 text-red-500">
            APT
          </Badge>
        );
      case 'vulnerability':
        return (
          <Badge variant="outline" className="border-destructive text-destructive">
            Vulnerability
          </Badge>
        );
      case 'ransomware':
        return (
          <Badge variant="outline" className="border-orange-500 text-orange-500">
            Ransomware
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-500">
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Badge>
        );
    }
  };
  
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs} hours ago`;
    
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays} days ago`;
  };
  
  const formatIocs = (iocs: unknown): ReactNode => {
    if (!iocs || typeof iocs !== 'object') return null;
    
    const iocsObj = iocs as Record<string, unknown>;
    const entries: ReactNode[] = [];
    
    if (iocsObj.ips) {
      const ips = Array.isArray(iocsObj.ips) ? iocsObj.ips.join(', ') : String(iocsObj.ips);
      entries.push(<p key="ips">IP: {ips}</p>);
    }
    if (iocsObj.domains) {
      const domains = Array.isArray(iocsObj.domains) ? iocsObj.domains.join(', ') : String(iocsObj.domains);
      entries.push(<p key="domains">Domain: {domains}</p>);
    }
    if (iocsObj.hashes) {
      const hashes = iocsObj.hashes;
      const hashDisplay = Array.isArray(hashes) 
        ? hashes.map((h: string) => h.substring(0, 7) + '...').join(', ')
        : typeof hashes === 'string' ? hashes.substring(0, 7) + '...' : '';
      entries.push(<p key="hashes">Hash: {hashDisplay}</p>);
    }
    if (iocsObj.cve) {
      entries.push(<p key="cve">CVE: {String(iocsObj.cve)}</p>);
    }
    
    return entries.length ? <>{entries}</> : null;
  };
  
  const getRelevanceBadge = (relevance: string | null) => {
    if (!relevance) return null;
    
    switch (relevance) {
      case 'high':
        return (
          <Badge variant="outline" className="border-red-500 text-red-500">Relevance: High</Badge>
        );
      case 'medium':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">Relevance: Medium</Badge>
        );
      case 'low':
        return (
          <Badge variant="outline" className="border-green-500 text-green-500">Relevance: Low</Badge>
        );
      default:
        return null;
    }
  };
  
  return (
    <Card>
      <CardHeader className="p-4 pb-0 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md font-medium">Threat Intelligence</CardTitle>
        <div className="flex items-center space-x-2">
          <Select defaultValue="all">
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="osint">OSINT</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span>Loading threat intelligence...</span>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Globe className="h-12 w-12 mb-2 opacity-20" />
            <span>No threat intelligence available</span>
          </div>
        ) : (
          displayItems.map(item => (
            <div key={item.id} className="mb-4 p-3 bg-muted/40 rounded-lg border border-border">
              <div className="flex justify-between items-start mb-2">
                {getTypeBadge(item.type)}
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(new Date(item.createdAt || new Date()))}
                </span>
              </div>
              <p className="text-sm font-medium mb-1">{item.title}</p>
              <p className="text-xs text-muted-foreground mb-3">{item.description}</p>
              
              {item.iocs && (
                <div className="bg-background/40 p-2 rounded text-xs font-mono text-muted-foreground mb-2 overflow-x-auto">
                  {formatIocs(item.iocs)}
                </div>
              )}
              
              <div className="flex justify-between items-center">
                {getRelevanceBadge(item.relevance)}
                <Button variant="link" className="text-xs p-0 h-auto">
                  {item.type === 'vulnerability' ? 'View Advisory' : 'Add to Watchlist'}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default ThreatIntelligence;
