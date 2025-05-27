import { FC } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bug,
  Cog,
  CreditCard,
  Globe,
  Laptop,
  Lock,
  LogOut,
  Shield,
  UserCircle,
  Users,
  Zap
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

interface SidebarProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  activeSection?: string;
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}

const NavItem: FC<NavItemProps> = ({ href, label, icon, active }) => {
  return (
    <Link href={href}>
      <div className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent hover:text-accent-foreground",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
    </Link>
  );
};

const Sidebar: FC<SidebarProps> = ({ user, activeSection }) => {
  const [location] = useLocation();
  const { logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex h-screen flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/">
          <div className="flex items-center gap-2 font-semibold">
            <Shield className="h-6 w-6" />
            <span className="text-xl font-bold">SOC Inteligente</span>
          </div>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
          <div className="mb-2">
            <h2 className="px-4 text-xs font-semibold text-muted-foreground tracking-tight mb-1">
              Vista general
            </h2>
            <NavItem 
              href="/dashboard" 
              label="Dashboard" 
              icon={<Activity className="h-4 w-4" />} 
              active={location === "/dashboard"} 
            />
            <NavItem 
              href="/alerts" 
              label="Alertas" 
              icon={<AlertTriangle className="h-4 w-4" />} 
              active={location === "/alerts"} 
            />
            <NavItem 
              href="/incidents" 
              label="Incidentes" 
              icon={<Bug className="h-4 w-4" />} 
              active={location === "/incidents"} 
            />
          </div>
          
          <div className="mb-2">
            <h2 className="px-4 text-xs font-semibold text-muted-foreground tracking-tight mb-1">
              Inteligencia
            </h2>
            <NavItem 
              href="/threat-intelligence" 
              label="Inteligencia de amenazas" 
              icon={<Globe className="h-4 w-4" />} 
              active={location === "/threat-intelligence"} 
            />
            <NavItem 
              href="/analytics" 
              label="Analítica" 
              icon={<BarChart3 className="h-4 w-4" />} 
              active={location === "/analytics"} 
            />
          </div>
          
          <div className="mb-2">
            <h2 className="px-4 text-xs font-semibold text-muted-foreground tracking-tight mb-1">
              Operaciones
            </h2>
            <NavItem 
              href="/soar" 
              label="SOAR" 
              icon={<Zap className="h-4 w-4" />} 
              active={location === "/soar"} 
            />
            <NavItem 
              href="/connectors" 
              label="Conectores" 
              icon={<Laptop className="h-4 w-4" />} 
              active={location === "/connectors"} 
            />
            <NavItem 
              href="/agents" 
              label="Agentes" 
              icon={<Shield className="h-4 w-4" />} 
              active={location === "/agents"} 
            />
          </div>
          
          <div className="mb-2">
            <h2 className="px-4 text-xs font-semibold text-muted-foreground tracking-tight mb-1">
              Sistema
            </h2>
            <NavItem 
              href="/users" 
              label="Usuarios" 
              icon={<Users className="h-4 w-4" />} 
              active={location === "/users"} 
            />
            <NavItem 
              href="/reports" 
              label="Informes" 
              icon={<Bell className="h-4 w-4" />} 
              active={location === "/reports"} 
            />
            <NavItem 
              href="/settings" 
              label="Settings" 
              icon={<Cog className="h-4 w-4" />} 
              active={location === "/settings"} 
            />
            <NavItem 
              href="/configuration" 
              label="Configuración" 
              icon={<Lock className="h-4 w-4" />} 
              active={location === "/configuration"} 
            />
            <NavItem 
              href="/billing" 
              label="Facturación y Planes" 
              icon={<CreditCard className="h-4 w-4" />} 
              active={location === "/billing"} 
            />
          </div>
        </nav>
      </div>
      <div className="mt-auto p-4">
        <Separator className="mb-4" />
        <div className="flex items-center gap-4 px-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-sm font-medium leading-none">{user.name}</div>
            <div className="text-xs text-muted-foreground leading-none mt-1">
              {user.role}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;