import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Alerts from "@/pages/alerts";
import Incident from "@/pages/incident";
import IncidentNew from "@/pages/incident-new";
import Incidents from "@/pages/incidents";
import Playbooks from "@/pages/playbooks";
import ThreatIntelligence from "@/pages/threat-intelligence";
import Analytics from "@/pages/analytics";
import Reports from "@/pages/reports";
import Users from "@/pages/users";
import Connectors from "@/pages/connectors";
import Configuration from "@/pages/configuration";
import Settings from "@/pages/settings";
import Soar from "@/pages/soar";
import Agents from "@/pages/agents";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "./lib/protected-route";
import { useState, useMemo } from "react";
import BillingPage from "./pages/billing";
function Router() {
  const { user } = useAuth();
  
  const organization = useMemo(() => ({
  name: user?.organizationId ? `Organization ${user.organizationId}` : "Organization",
}), [user?.organizationId]);

  // Extract user information for the sidebar
  const userInfo = user ? {
    name: user.name,
    initials: user.name.split(' ').map(name => name[0]).join('').toUpperCase(),
    role: user.role,
  } : {
    name: '',
    initials: '',
    role: '',
  };

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <ProtectedRoute path="/dashboard" component={() => <Dashboard user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/alerts" component={() => <Alerts user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/incident/new" component={() => <IncidentNew id="new" user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/incident/:id" component={({ id }) => <Incident id={id} user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/incidents" component={() => <Incidents user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/threat-intelligence" component={() => <ThreatIntelligence user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/soar" component={() => <Soar user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/playbooks" component={() => <Playbooks user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/analytics" component={() => <Analytics user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/reports" component={() => <Reports user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/users" component={() => <Users user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/connectors" component={() => <Connectors user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/agents" component={() => <Agents user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/settings" component={() => <Settings user={userInfo} organization={organization} />} />
      <ProtectedRoute path="/configuration" component={() => <Configuration user={userInfo} organization={organization} />} />
      {/* La página de facturación ahora maneja su propia autenticación */}
      <Route path="/billing" component={BillingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantProvider 
          initialOrganizationId={null}
          initialUserRole={null}
          initialLanguage="es"
        >
          <Router />
          <Toaster />
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
