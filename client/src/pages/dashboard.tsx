import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import MetricCard from "@/components/dashboard/MetricCard";
import ThreatDetectionChart from "@/components/dashboard/ThreatDetectionChart";
import AIInsights from "@/components/dashboard/AIInsights";
import RecentAlerts from "@/components/dashboard/RecentAlerts";
import ThreatIntelligence from "@/components/dashboard/ThreatIntelligence";
import MitreTacticsSummary from "@/components/dashboard/MitreTacticsSummary";
import ComplianceSummary from "@/components/dashboard/ComplianceSummary";
import ReportGeneration from "@/components/dashboard/ReportGeneration";
import SeverityDistribution from "@/components/dashboard/SeverityDistribution";
import MttaMetrics from "@/components/dashboard/MttaMetrics";
import PlaybookMetrics from "@/components/dashboard/PlaybookMetrics";
import AgentMetrics from "@/components/dashboard/AgentMetrics";
import ThreatMap from "@/components/dashboard/ThreatMap";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { getQueryFn } from "@/lib/queryClient"; 
import { useToast } from "@/hooks/use-toast";
import useWebSocket from "@/hooks/use-websocket";

interface DashboardProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

const Dashboard: FC<DashboardProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/dashboard', timeRange],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    onError: (error) => {
      console.error("Error fetching dashboard data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del dashboard. Intente nuevamente.",
        variant: "destructive"
      });
    }
  });

  // WebSocket para actualizaciones en tiempo real, pero no bloquea la UI si falla
  const {
    connectionStatus
  } = useWebSocket(
    data ? `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:5000'}/ws/dashboard` : null,
    {
      onMessage: (message) => {
        if (message.type === 'dashboard_update') {
          toast({
            title: "Dashboard Updated",
            description: "Real-time data has been refreshed.",
            variant: "default"
          });
          refetch();
        }
      },
      onError: (error) => {
        console.warn("WebSocket connection error:", error);
      }
    }
  );
  
  // Extract metrics or use defaults if not loaded yet
  const metrics = data?.metrics || [];
  
  // Función para encontrar una métrica por nombre o devolver valores predeterminados
  interface Metric {
  name: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  changePercentage: number;
  progressPercent: number;
  subvalue: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

type MetricName = 'Active Alerts' | 'Open Incidents' | 'MTTD' | 'MTTR' | 'Assets at Risk' | 'Compliance Score' | 'Connector Health' | 'Global Risk Score';

const getMetric = (name: MetricName, defaultValue: number = 0, defaultSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info'): Metric => {
    const metric = metrics.find((m: Metric) => m.name === name);
    return metric || { 
      name,
      value: defaultValue, 
      trend: 'stable', 
      changePercentage: 0, 
      progressPercent: 0,
      subvalue: '',
      severity: defaultSeverity
    };
  };
  
  // Extraer métricas
  const activeAlerts = getMetric('Active Alerts', 0, 'critical');
  const openIncidents = getMetric('Open Incidents', 0, 'medium');
  const mttd = getMetric('MTTD', 0, 'info');
  const mttr = getMetric('MTTR', 0, 'medium');
  const assetsAtRisk = getMetric('Assets at Risk', 0, 'high');
  const complianceScore = getMetric('Compliance Score', 0, 'low');
  const connectorHealth = getMetric('Connector Health', 0, 'info');
  const globalRiskScore = getMetric('Global Risk Score', 0, 'high');

  const handleTimeRangeChange = (range: string) => {
    setTimeRange(range);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Dashboard Refreshed",
        description: "All data has been updated successfully.",
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh dashboard data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDrillDown = (section: string) => {
    switch (section) {
      case 'alerts':
        window.location.href = '/alerts';
        break;
      case 'incidents':
        window.location.href = '/incidents';
        break;
      case 'connectors':
        window.location.href = '/connectors';
        break;
      default:
        break;
    }
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="dashboard" />
      <MainContent pageTitle="Security Dashboard" organization={organization}>
        {/* Indicador de estado de WebSocket, pero no bloquea la UI */}
        <div className="mb-2 text-xs text-right text-gray-400">
          WebSocket: {connectionStatus === 'connected' ? '🟢 Conectado' : connectionStatus === 'reconnecting' ? '🟠 Reconectando' : connectionStatus === 'failed' ? '🔴 Sin conexión' : '⚪ Desconectado'}
        </div>
        {/* Dashboard Filters */}
        <DashboardFilters
          timeRange={timeRange}
          onTimeRangeChange={handleTimeRangeChange}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          lastUpdated={data?.lastUpdated}
        />

        {/* Main KPI Metrics - Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard 
            label="Active Alerts" 
            value={activeAlerts.value} 
            subvalue={activeAlerts.subvalue} 
            trend={activeAlerts.trend as 'up' | 'down' | 'stable'} 
            changePercentage={activeAlerts.changePercentage} 
            progressPercent={activeAlerts.progressPercent} 
            severity="critical" 
            description="Number of unresolved security alerts currently requiring attention. High number indicates increased security activity."
            lastUpdated={new Date()}
            onClick={() => handleDrillDown('alerts')}
          />
          
          <MetricCard 
            label="Open Incidents" 
            value={openIncidents.value} 
            subvalue={openIncidents.subvalue} 
            trend={openIncidents.trend as 'up' | 'down' | 'stable'} 
            changePercentage={openIncidents.changePercentage} 
            progressPercent={openIncidents.progressPercent} 
            severity="medium" 
            description="Number of security incidents currently under investigation or remediation. Measures current incident response workload."
            lastUpdated={new Date()}
            onClick={() => handleDrillDown('incidents')}
          />
          
          <MetricCard 
            label="Global Risk Score" 
            value={globalRiskScore.value} 
            subvalue={globalRiskScore.subvalue} 
            trend={globalRiskScore.trend as 'up' | 'down' | 'stable'} 
            changePercentage={globalRiskScore.changePercentage} 
            progressPercent={globalRiskScore.progressPercent} 
            severity="high" 
            description="Overall security risk assessment on a scale of 0-100. Calculated based on active threats, vulnerabilities, and organizational exposure."
            lastUpdated={new Date()}
          />
          
          <MetricCard 
            label="Assets at Risk" 
            value={assetsAtRisk.value} 
            subvalue={assetsAtRisk.subvalue} 
            trend={assetsAtRisk.trend as 'up' | 'down' | 'stable'} 
            changePercentage={assetsAtRisk.changePercentage} 
            progressPercent={assetsAtRisk.progressPercent} 
            severity="high" 
            description="Number of IT assets (servers, endpoints, applications) with critical or high severity vulnerabilities or active threats."
            lastUpdated={new Date()}
          />
        </div>
        
        {/* Secondary Metrics - Second Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <MetricCard 
            label="MTTD" 
            value={mttd.value} 
            subvalue={mttd.subvalue} 
            trend={mttd.trend as 'up' | 'down' | 'stable'} 
            changePercentage={mttd.changePercentage} 
            progressPercent={mttd.progressPercent} 
            severity="info" 
            description="Mean Time to Detect - Average time (in hours) between a security incident occurring and its detection. Lower is better."
            lastUpdated={new Date()}
          />
          
          <MetricCard 
            label="MTTR" 
            value={mttr.value} 
            subvalue={mttr.subvalue} 
            trend={mttr.trend as 'up' | 'down' | 'stable'} 
            changePercentage={mttr.changePercentage} 
            progressPercent={mttr.progressPercent} 
            severity="medium" 
            description="Mean Time to Respond/Remediate - Average time (in hours) to resolve a security incident after detection. Lower is better."
            lastUpdated={new Date()}
          />
          
          <MetricCard 
            label="Compliance Score" 
            value={complianceScore.value} 
            subvalue={complianceScore.subvalue} 
            trend={complianceScore.trend as 'up' | 'down' | 'stable'} 
            changePercentage={complianceScore.changePercentage} 
            progressPercent={complianceScore.progressPercent} 
            severity="low" 
            description="Security compliance status score (0-100) measuring adherence to regulatory frameworks and security policies."
            lastUpdated={new Date()}
          />
          
          <MetricCard 
            label="Connector Health" 
            value={connectorHealth.value} 
            subvalue={connectorHealth.subvalue} 
            trend={connectorHealth.trend as 'up' | 'down' | 'stable'} 
            changePercentage={connectorHealth.changePercentage} 
            progressPercent={connectorHealth.progressPercent} 
            severity="info" 
            description="Percentage of data connectors operating normally. Monitors the health of security data collection infrastructure."
            lastUpdated={new Date()}
            onClick={() => handleDrillDown('connectors')}
          />
        </div>
        
        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Threat Detection Summary - 8 columns */}
          <div className="col-span-12 lg:col-span-8">
            <ThreatDetectionChart data={data?.alertsByDay || []} />
          </div>
          
          {/* Severity Distribution - 4 columns */}
          <div className="col-span-12 lg:col-span-4">
            <SeverityDistribution data={data?.severityDistribution || { critical: 0, high: 0, medium: 0, low: 0 }} />
          </div>
          
          {/* MTTA/MTTR Metrics - 6 columns */}
          <div className="col-span-12 md:col-span-6">
            <MttaMetrics 
              data={data?.mttaData || []}
              currentMtta={mttd.value}
              currentMttr={mttr.value}
            />
          </div>
          
          {/* Playbook Execution - 6 columns */}
          <div className="col-span-12 md:col-span-6">
            <PlaybookMetrics 
              data={data?.playbookData || []}
              todayStats={data?.playbookStats || { totalRuns: 0, successfulRuns: 0, failedRuns: 0, successRate: 0 }}
            />
          </div>
          
          {/* Agent Health - 8 columns */}
          <div className="col-span-12 lg:col-span-8">
            <AgentMetrics 
              data={data?.agentHealthData || []}
              currentStats={data?.agentStats || { 
                onlineAgents: 0, 
                totalAgents: 0, 
                healthPercentage: 0, 
                avgLatency: 0, 
                topAgents: [] 
              }}
            />
          </div>
          
          {/* AI Insights - 4 columns */}
          <div className="col-span-12 lg:col-span-4">
            <AIInsights insights={data?.aiInsights || []} isLoading={isLoading} />
          </div>
          
          {/* Global Threat Map - 8 columns */}
          <div className="col-span-12 lg:col-span-8">
            <ThreatMap 
              threats={data?.threatLocations || []}
              isLoading={isLoading}
              timeRange={timeRange}
              onLocationClick={(threat) => {
                toast({
                  title: "Threat Location Details",
                  description: `${threat.country}: ${threat.threatCount} threats detected`,
                  variant: "default"
                });
              }}
              onRefresh={refetch}
            />
          </div>
          
          {/* MITRE ATT&CK Tactics Summary - 4 columns */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <MitreTacticsSummary tactics={data?.mitreTactics || []} isLoading={isLoading} />
          </div>
          
          {/* Compliance Summary - 4 columns */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <ComplianceSummary items={data?.compliance || []} isLoading={isLoading} />
          </div>
          
          {/* Recent Alerts - 4 columns */}
          <div className="col-span-12 lg:col-span-4">
            <RecentAlerts alerts={data?.recentAlerts || []} isLoading={isLoading} />
          </div>
          
          {/* Threat Intel Feed - 4 columns */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <ThreatIntelligence items={data?.threatIntel || []} isLoading={isLoading} />
          </div>
          
          {/* Report Generation Component - 8 columns */}
          <div className="col-span-12 md:col-span-6 lg:col-span-8">
            <ReportGeneration recentReports={data?.recentReports || []} />
          </div>
        </div>
      </MainContent>
    </div>
  );
};

export default Dashboard;
