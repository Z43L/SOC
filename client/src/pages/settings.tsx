import { FC } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserSettingsTab } from "@/components/settings/UserSettingsTab";
import { OrganizationSettingsTab } from "@/components/settings/OrganizationSettingsTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { AuditTab } from "@/components/settings/AuditTab";
import { User, Shield, Building2, Plug, History } from "lucide-react";

interface SettingsProps {
  user: {
    id: number;
    name: string;
    initials: string;
    role: string;
    username: string;
    email: string;
    organizationId: number;
  };
  organization: {
    id: number;
    name: string;
  };
}

const Settings: FC<SettingsProps> = ({ user, organization }) => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="settings" />
      
      <MainContent pageTitle="Settings" organization={organization}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground mt-2">
              Manage your account preferences, organization settings, and system configuration.
            </p>
          </div>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-8">
              <TabsTrigger value="profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="organization" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organization
              </TabsTrigger>
              <TabsTrigger value="integrations" className="flex items-center gap-2">
                <Plug className="h-4 w-4" />
                Integrations
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <UserSettingsTab user={user} organization={organization} />
            </TabsContent>

            <TabsContent value="security">
              <SecurityTab user={user} organization={organization} />
            </TabsContent>

            <TabsContent value="organization">
              <OrganizationSettingsTab user={user} organization={organization} />
            </TabsContent>

            <TabsContent value="integrations">
              <IntegrationsTab user={user} organization={organization} />
            </TabsContent>

            <TabsContent value="audit">
              <AuditTab user={user} organization={organization} />
            </TabsContent>
          </Tabs>
        </div>
      </MainContent>
    </div>
  );
};

export default Settings;
