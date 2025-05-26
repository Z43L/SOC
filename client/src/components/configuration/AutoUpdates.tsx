import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle, Clock, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

export function AutoUpdates() {
  const [loading, setLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<null | { 
    success: boolean; 
    message: string; 
    details?: any;
    updatedMetrics?: string[];
  }>(null);
  const [updateType, setUpdateType] = useState<"all" | "feeds" | "alerts" | "metrics">("all");
  const { toast } = useToast();

  const handleUpdate = async () => {
    if (loading) return;
    
    setLoading(true);
    setUpdateStatus(null);
    
    try {
      const res = await apiRequest("POST", "/api/refresh-data", { type: updateType });
      const data = await res.json();
      
      setUpdateStatus(data);
      
      toast({
        title: data.success ? "Actualización exitosa" : "Error en la actualización",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error en la actualización",
        description: "No se pudo completar la actualización de datos.",
        variant: "destructive",
      });
      
      setUpdateStatus({
        success: false,
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Actualizaciones Automáticas de Datos Reales
        </CardTitle>
        <CardDescription>
          Configura y controla las actualizaciones automáticas de datos del sistema desde fuentes externas de inteligencia de amenazas
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="manual">Actualización Manual</TabsTrigger>
            <TabsTrigger value="scheduled">Programación</TabsTrigger>
          </TabsList>
          
          <TabsContent value="manual" className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Select 
                  value={updateType} 
                  onValueChange={(value) => setUpdateType(value as any)}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Tipo de actualización" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los datos</SelectItem>
                    <SelectItem value="feeds">Solo Threat Intelligence</SelectItem>
                    <SelectItem value="alerts">Solo Alertas</SelectItem>
                    <SelectItem value="metrics">Solo Métricas</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  onClick={handleUpdate} 
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Actualizar Ahora
                    </>
                  )}
                </Button>
              </div>
              
              {updateStatus && (
                <Alert variant={updateStatus.success ? "default" : "destructive"}>
                  <div className="flex items-center gap-2">
                    {updateStatus.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <AlertTitle>{updateStatus.success ? "Éxito" : "Error"}</AlertTitle>
                  </div>
                  <AlertDescription>
                    {updateStatus.message}
                    
                    {updateStatus.updatedMetrics && updateStatus.updatedMetrics.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold">Métricas actualizadas:</p>
                        <ul className="list-disc list-inside">
                          {updateStatus.updatedMetrics.map((metric) => (
                            <li key={metric}>{metric}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {updateStatus.details && (
                      <div className="mt-2">
                        <p className="font-semibold">Detalles:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {updateStatus.details.feeds && (
                            <div>
                              <p className="font-medium">Threat Intelligence:</p>
                              <p className={updateStatus.details.feeds.success ? "text-green-600" : "text-red-600"}>
                                {updateStatus.details.feeds.success ? "Éxito" : "Error"} - {updateStatus.details.feeds.message}
                              </p>
                            </div>
                          )}
                          
                          {updateStatus.details.alerts && (
                            <div>
                              <p className="font-medium">Alertas:</p>
                              <p className={updateStatus.details.alerts.success ? "text-green-600" : "text-red-600"}>
                                {updateStatus.details.alerts.success ? "Éxito" : "Error"} - {updateStatus.details.alerts.message}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="scheduled" className="space-y-4">
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>Actualizaciones programadas</AlertTitle>
              <AlertDescription>
                <p className="mb-2">El sistema está configurado para actualizar automáticamente los datos:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Datos de Threat Intelligence y Alertas: <span className="font-medium">cada 3 horas</span></li>
                  <li>Métricas del sistema: <span className="font-medium">cada 1 hora</span></li>
                </ul>
              </AlertDescription>
            </Alert>
            
            <div className="rounded-md border p-4">
              <h4 className="mb-2 font-medium">Última actualización automática:</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{new Date().toLocaleString()}</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          La actualización automática recupera datos de las siguientes fuentes externas:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            <span>VirusTotal: Información sobre malware y archivos maliciosos</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            <span>AbuseIPDB: Información sobre IPs maliciosas</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            <span>AlienVault OTX: Feeds de inteligencia sobre amenazas</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            <span>MISP: Indicadores de compromiso y amenazas</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}