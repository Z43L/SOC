import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { 
  Loader2, 
  Save, 
  Plug, 
  MessageSquare, 
  Users, 
  Webhook, 
  TestTube, 
  CheckCircle, 
  XCircle,
  Settings,
  Eye,
  EyeOff
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface IntegrationsTabProps {
  user: {
    id: number;
    name: string;
    username: string;
    email: string;
    organizationId: number;
  };
  organization: {
    id: number;
    name: string;
  };
}

interface IntegrationSettings {
  slack: {
    enabled: boolean;
    webhookUrl?: string;
    channel?: string;
    botToken?: string;
  };
  teams: {
    enabled: boolean;
    webhookUrl?: string;
    tenantId?: string;
  };
  webhook: {
    enabled: boolean;
    url?: string;
    secret?: string;
  };
}

interface TestResult {
  success: boolean;
  message: string;
  timestamp: string;
}

export const IntegrationsTab: FC<IntegrationsTabProps> = ({ user, organization }) => {
  const [showSlackToken, setShowSlackToken] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [isConfiguring, setIsConfiguring] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch organization integrations
  const { data: integrations, isLoading: integrationsLoading } = useQuery<IntegrationSettings>({
    queryKey: [`/api/settings/org`],
    queryFn: async () => {
      const response = await getQueryFn<any>({ on401: "throw" })({ queryKey: [`/api/settings/org`] });
      return response.integrations || {
        slack: { enabled: false },
        teams: { enabled: false },
        webhook: { enabled: false },
      };
    },
    initialData: {
      slack: { enabled: false },
      teams: { enabled: false },
      webhook: { enabled: false },
    }
  });

  const [formData, setFormData] = useState<IntegrationSettings>(integrations);

  // Update integrations mutation
  const updateIntegrationsMutation = useMutation({
    mutationFn: async (data: { integrations: Partial<IntegrationSettings> }) => {
      const response = await apiRequest("PATCH", "/api/settings/org", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Integration updated",
        description: "Integration settings have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/settings/org`] });
      setIsConfiguring(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update integration",
        variant: "destructive",
      });
    },
  });

  // Test integration mutation
  const testIntegrationMutation = useMutation({
    mutationFn: async ({ type, config }: { type: string; config: any }) => {
      const response = await apiRequest("POST", `/api/settings/integrations/${type}/test`, config);
      return response.json();
    },
    onSuccess: (data, variables) => {
      const result = {
        success: data.success,
        message: data.message,
        timestamp: new Date().toISOString(),
      };
      setTestResults(prev => ({ ...prev, [variables.type]: result }));
      
      if (data.success) {
        toast({
          title: "Test successful",
          description: `${variables.type} integration is working correctly.`,
        });
      } else {
        toast({
          title: "Test failed",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: any, variables) => {
      const result = {
        success: false,
        message: error.message || "Test failed",
        timestamp: new Date().toISOString(),
      };
      setTestResults(prev => ({ ...prev, [variables.type]: result }));
      
      toast({
        title: "Test failed",
        description: error.message || "Failed to test integration",
        variant: "destructive",
      });
    },
  });

  const handleSlackSave = () => {
    updateIntegrationsMutation.mutate({
      integrations: { slack: formData.slack }
    });
  };

  const handleTeamsSave = () => {
    updateIntegrationsMutation.mutate({
      integrations: { teams: formData.teams }
    });
  };

  const handleWebhookSave = () => {
    updateIntegrationsMutation.mutate({
      integrations: { webhook: formData.webhook }
    });
  };

  const handleTestIntegration = (type: string) => {
    const config = formData[type as keyof IntegrationSettings];
    if (!config.enabled) {
      toast({
        title: "Integration disabled",
        description: "Please enable and configure the integration first.",
        variant: "destructive",
      });
      return;
    }
    
    testIntegrationMutation.mutate({ type, config });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (integrationsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Slack Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            Slack Integration
          </CardTitle>
          <CardDescription>
            Send security alerts and notifications to your Slack channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="slack-enabled">Enable Slack Integration</Label>
              {formData.slack.enabled && (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enabled
                </Badge>
              )}
            </div>
            <Switch
              id="slack-enabled"
              checked={formData.slack.enabled}
              onCheckedChange={(checked) =>
                setFormData(prev => ({
                  ...prev,
                  slack: { ...prev.slack, enabled: checked }
                }))
              }
            />
          </div>

          {formData.slack.enabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="slack-webhook">Webhook URL</Label>
                <Input
                  id="slack-webhook"
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  value={formData.slack.webhookUrl || ""}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      slack: { ...prev.slack, webhookUrl: e.target.value }
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Create a webhook URL in your Slack app settings
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slack-channel">Default Channel</Label>
                <Input
                  id="slack-channel"
                  placeholder="#security-alerts"
                  value={formData.slack.channel || ""}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      slack: { ...prev.slack, channel: e.target.value }
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slack-token">Bot Token (Optional)</Label>
                <div className="relative">
                  <Input
                    id="slack-token"
                    type={showSlackToken ? "text" : "password"}
                    placeholder="xoxb-..."
                    value={formData.slack.botToken || ""}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        slack: { ...prev.slack, botToken: e.target.value }
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowSlackToken(!showSlackToken)}
                  >
                    {showSlackToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  For advanced features like channel creation and user management
                </p>
              </div>

              {testResults.slack && (
                <Alert className={testResults.slack.success ? "border-green-200" : "border-red-200"}>
                  {testResults.slack.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription>
                    <div className="flex justify-between items-start">
                      <span>{testResults.slack.message}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(testResults.slack.timestamp)}
                      </span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSlackSave}
                  disabled={updateIntegrationsMutation.isPending}
                >
                  {updateIntegrationsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleTestIntegration("slack")}
                  disabled={testIntegrationMutation.isPending}
                >
                  {testIntegrationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Microsoft Teams Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Microsoft Teams Integration
          </CardTitle>
          <CardDescription>
            Send security alerts and notifications to your Teams channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="teams-enabled">Enable Teams Integration</Label>
              {formData.teams.enabled && (
                <Badge variant="default" className="bg-blue-100 text-blue-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enabled
                </Badge>
              )}
            </div>
            <Switch
              id="teams-enabled"
              checked={formData.teams.enabled}
              onCheckedChange={(checked) =>
                setFormData(prev => ({
                  ...prev,
                  teams: { ...prev.teams, enabled: checked }
                }))
              }
            />
          </div>

          {formData.teams.enabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="teams-webhook">Teams Webhook URL</Label>
                <Input
                  id="teams-webhook"
                  type="url"
                  placeholder="https://outlook.office.com/webhook/..."
                  value={formData.teams.webhookUrl || ""}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      teams: { ...prev.teams, webhookUrl: e.target.value }
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Configure an Incoming Webhook connector in your Teams channel
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teams-tenant">Tenant ID (Optional)</Label>
                <Input
                  id="teams-tenant"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={formData.teams.tenantId || ""}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      teams: { ...prev.teams, tenantId: e.target.value }
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  For enhanced security and authentication
                </p>
              </div>

              {testResults.teams && (
                <Alert className={testResults.teams.success ? "border-green-200" : "border-red-200"}>
                  {testResults.teams.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription>
                    <div className="flex justify-between items-start">
                      <span>{testResults.teams.message}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(testResults.teams.timestamp)}
                      </span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleTeamsSave}
                  disabled={updateIntegrationsMutation.isPending}
                >
                  {updateIntegrationsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleTestIntegration("teams")}
                  disabled={testIntegrationMutation.isPending}
                >
                  {testIntegrationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Webhook Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-purple-600" />
            Custom Webhook Integration
          </CardTitle>
          <CardDescription>
            Send security alerts to your custom webhook endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="webhook-enabled">Enable Webhook Integration</Label>
              {formData.webhook.enabled && (
                <Badge variant="default" className="bg-purple-100 text-purple-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enabled
                </Badge>
              )}
            </div>
            <Switch
              id="webhook-enabled"
              checked={formData.webhook.enabled}
              onCheckedChange={(checked) =>
                setFormData(prev => ({
                  ...prev,
                  webhook: { ...prev.webhook, enabled: checked }
                }))
              }
            />
          </div>

          {formData.webhook.enabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://your-api.com/webhook"
                  value={formData.webhook.url || ""}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      webhook: { ...prev.webhook, url: e.target.value }
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  POST requests will be sent to this URL with security event data
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook-secret">Webhook Secret</Label>
                <div className="relative">
                  <Input
                    id="webhook-secret"
                    type={showWebhookSecret ? "text" : "password"}
                    placeholder="Enter a secret for signature verification"
                    value={formData.webhook.secret || ""}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        webhook: { ...prev.webhook, secret: e.target.value }
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  >
                    {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used to sign webhook payloads for security verification
                </p>
              </div>

              {testResults.webhook && (
                <Alert className={testResults.webhook.success ? "border-green-200" : "border-red-200"}>
                  {testResults.webhook.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription>
                    <div className="flex justify-between items-start">
                      <span>{testResults.webhook.message}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(testResults.webhook.timestamp)}
                      </span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleWebhookSave}
                  disabled={updateIntegrationsMutation.isPending}
                >
                  {updateIntegrationsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleTestIntegration("webhook")}
                  disabled={testIntegrationMutation.isPending}
                >
                  {testIntegrationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integration Help */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Integration Help
          </CardTitle>
          <CardDescription>
            Learn how to set up and configure your integrations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Slack Setup:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal">
                <li>Go to your Slack workspace settings</li>
                <li>Create a new app or select an existing one</li>
                <li>Enable "Incoming Webhooks" and create a webhook URL</li>
                <li>Copy the webhook URL and paste it above</li>
                <li>Optionally, create a bot token for advanced features</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Microsoft Teams Setup:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal">
                <li>Go to your Teams channel</li>
                <li>Click on "..." and select "Connectors"</li>
                <li>Find and configure "Incoming Webhook"</li>
                <li>Copy the webhook URL and paste it above</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Custom Webhook:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal">
                <li>Set up an endpoint that accepts POST requests</li>
                <li>Configure HTTPS for security</li>
                <li>Implement signature verification using the secret</li>
                <li>Handle the JSON payload containing security events</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
