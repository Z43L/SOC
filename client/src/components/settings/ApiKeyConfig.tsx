import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle, Loader2, LucideSparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

type ApiProvider = "openai" | "anthropic" | "huggingface";
type ProviderStatus = "not_configured" | "configured" | "error";

interface AIConfigStatus {
  openai: {
    configured: boolean;
    status: ProviderStatus;
    message?: string;
  };
  anthropic: {
    configured: boolean;
    status: ProviderStatus;
    message?: string;
  };
  default_provider: ApiProvider | null;
}

export function ApiKeyConfig() {
  const [openAiKey, setOpenAiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [defaultProvider, setDefaultProvider] = useState<ApiProvider>("openai");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Consultar estado actual de configuración de IA
  const { data: aiStatus, isLoading, refetch } = useQuery<AIConfigStatus>({
    queryKey: ["/api/ai/status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/ai/status");
      return response.json();
    },
    initialData: {
      openai: { configured: false, status: "not_configured" },
      anthropic: { configured: false, status: "not_configured" },
      default_provider: null
    }
  });

  // Actualizar el proveedor predeterminado cuando cambian los datos
  useEffect(() => {
    if (aiStatus?.default_provider) {
      setDefaultProvider(aiStatus.default_provider);
    }
  }, [aiStatus]);

  const handleSetOpenAIKey = async () => {
    if (!openAiKey.trim()) {
      toast({
        title: "Error",
        description: "API key cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/ai/set-api-key", { 
        provider: "openai", 
        apiKey: openAiKey 
      });
      setOpenAiKey("");
      toast({
        title: "Success",
        description: "OpenAI API key has been set successfully",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set OpenAI API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetAnthropicKey = async () => {
    if (!anthropicKey.trim()) {
      toast({
        title: "Error",
        description: "API key cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/ai/set-api-key", { 
        provider: "anthropic", 
        apiKey: anthropicKey 
      });
      setAnthropicKey("");
      toast({
        title: "Success",
        description: "Anthropic API key has been set successfully",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set Anthropic API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefaultProvider = async (provider: ApiProvider) => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/ai/set-default-provider", { provider });
      setDefaultProvider(provider);
      toast({
        title: "Success",
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} is now the default AI provider`,
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set default AI provider. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestAI = async (provider: ApiProvider) => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/ai/test", { provider });
      toast({
        title: "Success",
        description: `Successfully tested ${provider.charAt(0).toUpperCase() + provider.slice(1)} integration`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to test ${provider} integration. Please check your API key.`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5" />
          Advanced AI Integration Settings
        </CardTitle>
        <CardDescription>
          Configure AI models to enhance threat detection and security analysis capabilities
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="providers">
          <TabsList className="mb-4">
            <TabsTrigger value="providers">AI Providers</TabsTrigger>
            <TabsTrigger value="configuration">Advanced Configuration</TabsTrigger>
          </TabsList>
          
          <TabsContent value="providers" className="space-y-6">
            {/* OpenAI Configuration */}
            <div className="space-y-4">
              <div className="border rounded-md p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">OpenAI</h3>
                    {aiStatus?.openai.status === "configured" && (
                      <Badge variant="outline" className="bg-green-900 bg-opacity-20 text-green-500 border-green-800">
                        <CheckCircle className="mr-1 h-3 w-3" /> Configured
                      </Badge>
                    )}
                    {aiStatus?.openai.status === "error" && (
                      <Badge variant="outline" className="bg-red-900 bg-opacity-20 text-red-500 border-red-800">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Error
                      </Badge>
                    )}
                    {aiStatus?.default_provider === "openai" && (
                      <Badge variant="outline" className="bg-blue-900 bg-opacity-20 text-blue-500 border-blue-800">
                        Default
                      </Badge>
                    )}
                  </div>
                  
                  <div>
                    {aiStatus?.openai.configured && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestAI("openai")}
                        disabled={isSubmitting}
                      >
                        Test Connection
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                  OpenAI provides state-of-the-art models like GPT-4o for comprehensive threat analysis, 
                  anomaly detection, and security recommendations.
                </p>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="Enter your OpenAI API key"
                      value={openAiKey}
                      onChange={(e) => setOpenAiKey(e.target.value)}
                    />
                    <Button 
                      onClick={handleSetOpenAIKey} 
                      disabled={isSubmitting || !openAiKey.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Setting...
                        </>
                      ) : (
                        "Set Key"
                      )}
                    </Button>
                  </div>
                  
                  {aiStatus?.openai.configured && !aiStatus?.openai.status.includes("error") && (
                    <div className="mt-2">
                      {aiStatus?.default_provider !== "openai" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefaultProvider("openai")}
                          disabled={isSubmitting}
                        >
                          Set as Default Provider
                        </Button>
                      ) : (
                        <p className="text-xs text-green-500">
                          OpenAI is configured as the default provider for all AI operations.
                        </p>
                      )}
                    </div>
                  )}

                  {aiStatus?.openai.status === "error" && aiStatus?.openai.message && (
                    <p className="text-xs text-red-500 mt-2">
                      Error: {aiStatus.openai.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Anthropic Configuration */}
            <div className="space-y-4">
              <div className="border rounded-md p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">Anthropic</h3>
                    {aiStatus?.anthropic.status === "configured" && (
                      <Badge variant="outline" className="bg-green-900 bg-opacity-20 text-green-500 border-green-800">
                        <CheckCircle className="mr-1 h-3 w-3" /> Configured
                      </Badge>
                    )}
                    {aiStatus?.anthropic.status === "error" && (
                      <Badge variant="outline" className="bg-red-900 bg-opacity-20 text-red-500 border-red-800">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Error
                      </Badge>
                    )}
                    {aiStatus?.default_provider === "anthropic" && (
                      <Badge variant="outline" className="bg-blue-900 bg-opacity-20 text-blue-500 border-blue-800">
                        Default
                      </Badge>
                    )}
                  </div>
                  
                  <div>
                    {aiStatus?.anthropic.configured && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestAI("anthropic")}
                        disabled={isSubmitting}
                      >
                        Test Connection
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                  Anthropic's Claude models offer sophisticated pattern analysis and context-aware 
                  security intelligence capabilities for enhanced threat detection.
                </p>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="Enter your Anthropic API key"
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                    />
                    <Button 
                      onClick={handleSetAnthropicKey} 
                      disabled={isSubmitting || !anthropicKey.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Setting...
                        </>
                      ) : (
                        "Set Key"
                      )}
                    </Button>
                  </div>
                  
                  {aiStatus?.anthropic.configured && !aiStatus?.anthropic.status.includes("error") && (
                    <div className="mt-2">
                      {aiStatus?.default_provider !== "anthropic" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefaultProvider("anthropic")}
                          disabled={isSubmitting}
                        >
                          Set as Default Provider
                        </Button>
                      ) : (
                        <p className="text-xs text-green-500">
                          Anthropic is configured as the default provider for all AI operations.
                        </p>
                      )}
                    </div>
                  )}

                  {aiStatus?.anthropic.status === "error" && aiStatus?.anthropic.message && (
                    <p className="text-xs text-red-500 mt-2">
                      Error: {aiStatus.anthropic.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="rounded-md bg-amber-50 p-4 border border-amber-200 dark:bg-amber-950 dark:border-amber-800 mt-4">
              <h3 className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2" /> Security Note
              </h3>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Your API keys are stored securely on the server and used only for the AI-powered features in this application.
                The keys are never exposed to the client-side code or other users.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="configuration" className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-md font-medium">AI Model Configuration</h3>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Alert Analysis Settings</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Minimum Severity for AI Analysis</label>
                          <select className="w-full bg-background border border-gray-700 rounded px-3 py-2 mt-1">
                            <option value="all">All Alerts</option>
                            <option value="medium">Medium and Above</option>
                            <option value="high">High and Above</option>
                            <option value="critical">Critical Only</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">Auto-Analysis</label>
                          <select className="w-full bg-background border border-gray-700 rounded px-3 py-2 mt-1">
                            <option value="enabled">Enabled</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </div>
                      </div>
                      
                      <Button size="sm">Save Settings</Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-2">
                  <AccordionTrigger>Threat Intelligence Settings</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Enrichment Level</label>
                          <select className="w-full bg-background border border-gray-700 rounded px-3 py-2 mt-1">
                            <option value="basic">Basic</option>
                            <option value="standard" selected>Standard</option>
                            <option value="comprehensive">Comprehensive</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">IoC Correlation</label>
                          <select className="w-full bg-background border border-gray-700 rounded px-3 py-2 mt-1">
                            <option value="enabled">Enabled</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </div>
                      </div>
                      
                      <Button size="sm">Save Settings</Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-3">
                  <AccordionTrigger>Advanced Model Selection</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Analysis Type Mappings</h4>
                        <p className="text-xs text-muted-foreground">Configure which AI model to use for each type of analysis</p>
                        
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <label className="text-sm">Alert Analysis:</label>
                            <select className="col-span-2 bg-background border border-gray-700 rounded px-3 py-1 text-sm">
                              <option value="auto">Auto-select</option>
                              <option value="openai-gpt4o">OpenAI GPT-4o</option>
                              <option value="anthropic-claude">Anthropic Claude</option>
                            </select>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <label className="text-sm">Incident Correlation:</label>
                            <select className="col-span-2 bg-background border border-gray-700 rounded px-3 py-1 text-sm">
                              <option value="auto">Auto-select</option>
                              <option value="openai-gpt4o">OpenAI GPT-4o</option>
                              <option value="anthropic-claude">Anthropic Claude</option>
                            </select>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <label className="text-sm">Threat Intel Analysis:</label>
                            <select className="col-span-2 bg-background border border-gray-700 rounded px-3 py-1 text-sm">
                              <option value="auto">Auto-select</option>
                              <option value="openai-gpt4o">OpenAI GPT-4o</option>
                              <option value="anthropic-claude">Anthropic Claude</option>
                            </select>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <label className="text-sm">Log Pattern Detection:</label>
                            <select className="col-span-2 bg-background border border-gray-700 rounded px-3 py-1 text-sm">
                              <option value="auto">Auto-select</option>
                              <option value="openai-gpt4o">OpenAI GPT-4o</option>
                              <option value="anthropic-claude">Anthropic Claude</option>
                            </select>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <label className="text-sm">Anomaly Detection:</label>
                            <select className="col-span-2 bg-background border border-gray-700 rounded px-3 py-1 text-sm">
                              <option value="auto">Auto-select</option>
                              <option value="openai-gpt4o">OpenAI GPT-4o</option>
                              <option value="anthropic-claude">Anthropic Claude</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      
                      <Button size="sm">Save Mappings</Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}