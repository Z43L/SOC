import { FC, useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { MapPin, MoreVertical, RefreshCw, Filter, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Leaflet imports with dynamic loading to avoid SSR issues
import 'leaflet/dist/leaflet.css';

interface ThreatLocation {
  id: string;
  lat: number;
  lon: number;
  country: string;
  city?: string;
  threatCount: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  lastSeen: Date;
  threatTypes: string[];
  ip?: string;
}

interface ThreatMapProps {
  threats: ThreatLocation[];
  isLoading?: boolean;
  timeRange?: string;
  onLocationClick?: (threat: ThreatLocation) => void;
  onRefresh?: () => void;
}

const ThreatMap: FC<ThreatMapProps> = ({ 
  threats = [], 
  isLoading = false, 
  timeRange = '24h',
  onLocationClick,
  onRefresh 
}) => {
  const { toast } = useToast();
  const mapRef = useRef<any>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [mapLoaded, setMapLoaded] = useState(false);

  // Filter threats by severity
  const filteredThreats = selectedSeverity === 'all' 
    ? threats 
    : threats.filter(threat => threat.severity === selectedSeverity);

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626'; // red-600
      case 'high': return '#ea580c';     // orange-600
      case 'medium': return '#ca8a04';   // yellow-600
      case 'low': return '#16a34a';      // green-600
      default: return '#6b7280';         // gray-500
    }
  };

  // Get marker size based on threat count
  const getMarkerSize = (threatCount: number) => {
    if (threatCount > 100) return 15;
    if (threatCount > 50) return 12;
    if (threatCount > 10) return 10;
    return 8;
  };

  // Initialize map
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    
    const initializeMap = async () => {
      try {
        // Check if DOM element exists before initializing
        const mapElement = document.getElementById('threat-map');
        if (!mapElement) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.warn(`Map container element not found, retrying... (${retryCount}/${maxRetries})`);
            setTimeout(initializeMap, 100);
            return;
          } else {
            throw new Error('Map container element not found after multiple retries');
          }
        }

        // Dynamic import to avoid SSR issues
        const L = await import('leaflet');
        const leaflet = L.default || L;
        
        // Fix default markers
        delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
        leaflet.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        });

        if (!mapRef.current) {
          // Check if container has dimensions
          const containerRect = mapElement.getBoundingClientRect();
          if (containerRect.width === 0 || containerRect.height === 0) {
            if (retryCount < maxRetries) {
              retryCount++;
              console.warn(`Map container has zero dimensions, retrying... (${retryCount}/${maxRetries})`);
              setTimeout(initializeMap, 200);
              return;
            } else {
              throw new Error('Map container has zero dimensions after multiple retries');
            }
          }

          // Initialize map centered on world view
          const map = leaflet.map('threat-map', {
            center: [20, 0],
            zoom: 2,
            zoomControl: true,
            attributionControl: false
          });

          // Add tile layer (OpenStreetMap) with error handling
          const tileLayer = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18,
            errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
          });

          tileLayer.on('tileerror', (e: any) => {
            console.warn('Tile loading error:', e);
          });

          tileLayer.addTo(map);

          mapRef.current = map;
          setMapLoaded(true);
        }
      } catch (error) {
        console.error('Error initializing map:', error);
        toast({
          title: "Map Error",
          description: "Failed to initialize threat map. Please refresh the page.",
          variant: "destructive"
        });
      }
    };

    // Add a small delay to ensure DOM is ready
    const timeoutId = setTimeout(initializeMap, 50);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapLoaded(false);
      }
    };
  }, [toast]);

  // Update markers when threats change
  useEffect(() => {
    const updateMarkers = async () => {
      if (!mapRef.current || !mapLoaded) return;

      try {
        const L = await import('leaflet');
        const leaflet = L.default || L;
        
        // Verify map is still valid
        if (!mapRef.current || !mapRef.current.getContainer) {
          console.warn('Map reference invalid during marker update');
          return;
        }
        
        // Clear existing markers
        mapRef.current.eachLayer((layer: any) => {
          if (layer instanceof leaflet.Marker || layer instanceof leaflet.CircleMarker) {
            mapRef.current.removeLayer(layer);
          }
        });

        // Add new markers
        filteredThreats.forEach((threat, index) => {
          const marker = leaflet.circleMarker([threat.lat, threat.lon], {
            radius: getMarkerSize(threat.threatCount),
            fillColor: getSeverityColor(threat.severity),
            color: '#ffffff',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.7,
            className: threat.severity === 'critical' ? 'threat-marker-pulse' : 'threat-marker'
          });

          // Create popup content with enhanced styling
          const popupContent = `
            <div class="threat-popup">
              <h4 class="font-semibold">${threat.country}${threat.city ? `, ${threat.city}` : ''}</h4>
              <p><strong>Threats:</strong> ${threat.threatCount}</p>
              <p><strong>Severity:</strong> <span class="severity-${threat.severity}">${threat.severity.toUpperCase()}</span></p>
              <p><strong>Types:</strong> ${threat.threatTypes.join(', ')}</p>
              <p><strong>Last Seen:</strong> ${new Date(threat.lastSeen).toLocaleString()}</p>
              ${threat.ip ? `<p><strong>Source IP:</strong> ${threat.ip}</p>` : ''}
              <div class="mt-2">
                <button class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700" 
                        onclick="window.dispatchEvent(new CustomEvent('threat-drill-down', { detail: '${threat.id}' }))">
                  View Details
                </button>
              </div>
            </div>
          `;

          marker.bindPopup(popupContent);
          
          // Add click handler
          marker.on('click', () => {
            if (onLocationClick) {
              onLocationClick(threat);
            }
          });

          // Add marker with slight delay for animation effect
          setTimeout(() => {
            if (mapRef.current) {
              marker.addTo(mapRef.current);
            }
          }, index * 50);
        });

      } catch (error) {
        console.error('Error updating markers:', error);
      }
    };

    updateMarkers();
  }, [filteredThreats, mapLoaded, onLocationClick]);

  const handleExport = (format: string) => {
    toast({
      title: "Export Started",
      description: `Exporting threat map data as ${format.toUpperCase()}...`,
      variant: "default"
    });
  };

  const severityOptions = [
    { value: 'all', label: 'All Severities', count: threats.length },
    { value: 'critical', label: 'Critical', count: threats.filter(t => t.severity === 'critical').length },
    { value: 'high', label: 'High', count: threats.filter(t => t.severity === 'high').length },
    { value: 'medium', label: 'Medium', count: threats.filter(t => t.severity === 'medium').length },
    { value: 'low', label: 'Low', count: threats.filter(t => t.severity === 'low').length }
  ];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center space-x-2">
          <Globe className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg font-semibold">Global Threat Map</CardTitle>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Severity Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                <Filter className="h-3 w-3 mr-1" />
                {selectedSeverity === 'all' ? 'All' : selectedSeverity.charAt(0).toUpperCase() + selectedSeverity.slice(1)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {severityOptions.map(option => (
                <DropdownMenuItem 
                  key={option.value}
                  onClick={() => setSelectedSeverity(option.value)}
                  className={selectedSeverity === option.value ? 'bg-accent' : ''}
                >
                  <div className="flex justify-between items-center w-full">
                    <span>{option.label}</span>
                    <span className="text-muted-foreground text-xs ml-2">({option.count})</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* More Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative h-96">
          {isLoading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <div className="flex items-center space-x-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading threat data...</span>
              </div>
            </div>
          )}
          
          <div 
            id="threat-map" 
            className="w-full h-full rounded-b-lg"
            style={{ minHeight: '400px' }}
          />
          
          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-card border rounded-md p-3 shadow-lg z-[1000]">
            <h4 className="text-xs font-semibold mb-2">Threat Severity</h4>
            <div className="space-y-1">
              {[
                { severity: 'critical', label: 'Critical', color: '#dc2626' },
                { severity: 'high', label: 'High', color: '#ea580c' },
                { severity: 'medium', label: 'Medium', color: '#ca8a04' },
                { severity: 'low', label: 'Low', color: '#16a34a' }
              ].map(item => (
                <div key={item.severity} className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full border border-white"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs">{item.label}</span>
                </div>
              ))}
            </div>
            
            <div className="mt-3 pt-2 border-t">
              <h5 className="text-xs font-medium mb-1">Size = Threat Count</h5>
              <div className="text-xs text-muted-foreground">
                {filteredThreats.length} locations ({timeRange})
              </div>
            </div>
          </div>

          {/* Stats Overlay */}
          <div className="absolute top-4 right-4 bg-card border rounded-md p-3 shadow-lg z-[1000]">
            <div className="space-y-1">
              <div className="text-xs">
                <span className="font-medium">Total Threats:</span> {threats.reduce((sum, t) => sum + t.threatCount, 0)}
              </div>
              <div className="text-xs">
                <span className="font-medium">Countries:</span> {new Set(threats.map(t => t.country)).size}
              </div>
              <div className="text-xs">
                <span className="font-medium">Active Sources:</span> {threats.length}
              </div>
              <div className="text-xs">
                <span className="font-medium">Critical:</span> 
                <span className="ml-1 text-red-600 font-semibold">
                  {threats.filter(t => t.severity === 'critical').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ThreatMap;