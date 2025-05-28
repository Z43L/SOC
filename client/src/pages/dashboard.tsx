import { FC } from "react";
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
import { getQueryFn } from "@/lib/queryClient"; 
import { useToast } from "@/hooks/use-toast";

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
  // Inicializar el hook de toast
  const { toast } = useToast();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/dashboard'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: 3,
    retryDelay: 1000,
    onError: (error) => {
      console.error("Error fetching dashboard data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del dashboard. Intente nuevamente.",
        variant: "destructive"
      });
    }
  });
  
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
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="dashboard" />
      
      <MainContent pageTitle="Security Dashboard" organization={organization}>
        {/* Main KPI Metrics */}
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
            onClick={() => window.location.href = '/alerts'}
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
            onClick={() => window.location.href = '/incidents'}
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
        
        {/* Secondary Metrics */}
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
            onClick={() => window.location.href = '/connectors'}
          />
        </div>
        
        {/* Dashboard Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Threat Detection Summary */}
          <div className="col-span-12 lg:col-span-8">
            <ThreatDetectionChart data={data?.alertsByDay || []} />
          </div>
          
          {/* AI Insights */}
          <div className="col-span-12 lg:col-span-4">
            <AIInsights insights={data?.aiInsights || []} isLoading={isLoading} />
          </div>
          
          {/* MITRE ATT&CK Tactics Summary */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <MitreTacticsSummary tactics={data?.mitreTactics || []} isLoading={isLoading} />
          </div>
          
          {/* Compliance Summary */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <ComplianceSummary items={data?.compliance || []} isLoading={isLoading} />
          </div>
          
          {/* Recent Alerts */}
          <div className="col-span-12 lg:col-span-4">
            <RecentAlerts alerts={data?.recentAlerts || []} isLoading={isLoading} />
          </div>
          
          {/* Threat Intel Feed */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <ThreatIntelligence items={data?.threatIntel || []} isLoading={isLoading} />
          </div>
          
          {/* Report Generation Component */}
          <div className="col-span-12 md:col-span-6 lg:col-span-2">
            <ReportGeneration recentReports={data?.recentReports || []} />
          </div>
        </div>
      </MainContent>
    </div>
  );
};

export default Dashboard;
