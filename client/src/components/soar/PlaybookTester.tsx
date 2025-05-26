import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Pause, 
  Square, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  TestTube,
  FileText,
  Settings,
  Monitor,
  Zap
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface TestExecution {
  id: string;
  playbookId: string;
  playbookName: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startTime: string;
  endTime?: string;
  steps: TestStep[];
  testData: any;
  results: any;
}

interface TestStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  endTime?: string;
  duration?: number;
  output?: any;
  error?: string;
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  testData: any;
  expectedResults: string[];
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'critical-malware',
    name: 'Critical Malware Alert',
    description: 'Tests response to critical malware detection',
    triggerType: 'alert',
    testData: {
      alert: {
        id: 12345,
        title: 'Critical Malware Detected',
        severity: 'critical',
        category: 'malware',
        sourceHost: 'workstation-001',
        sourceIp: '192.168.1.100',
        timestamp: new Date().toISOString()
      }
    },
    expectedResults: [
      'Slack notification sent',
      'Host isolated successfully',
      'Security incident created',
      'Management notified'
    ]
  },
  {
    id: 'phishing-attempt',
    name: 'Phishing Email Attack',
    description: 'Tests phishing response workflow',
    triggerType: 'alert',
    testData: {
      alert: {
        id: 12346,
        title: 'Phishing Email Detected',
        severity: 'high',
        category: 'phishing',
        targetUser: 'john.doe',
        maliciousDomain: 'evil-site.com',
        timestamp: new Date().toISOString()
      }
    },
    expectedResults: [
      'User account disabled',
      'Password reset initiated',
      'Malicious domain blocked',
      'User notified via email'
    ]
  },
  {
    id: 'vulnerability-critical',
    name: 'Critical Vulnerability',
    description: 'Tests critical vulnerability response',
    triggerType: 'alert',
    testData: {
      alert: {
        id: 12347,
        title: 'Critical Vulnerability - Apache Log4j',
        severity: 'critical',
        category: 'vulnerability',
        software: 'Apache Log4j',
        version: '2.14.1',
        cveId: '2021-44228',
        cvssScore: 10.0,
        timestamp: new Date().toISOString()
      }
    },
    expectedResults: [
      'Asset inventory completed',
      'Emergency patch ticket created',
      'Patching scheduled',
      'Stakeholders notified'
    ]
  },
  {
    id: 'incident-escalation',
    name: 'Incident Status Change',
    description: 'Tests incident status update notifications',
    triggerType: 'incident',
    testData: {
      incident: {
        id: 789,
        title: 'Security Breach Investigation',
        status: 'investigating',
        previousStatus: 'new',
        severity: 'critical',
        assignedTo: 'security-team',
        updatedAt: new Date().toISOString()
      }
    },
    expectedResults: [
      'Team notified via Slack',
      'Management email sent',
      'Executive notification sent',
      'Status dashboard updated'
    ]
  }
];

interface PlaybookTesterProps {
  playbooks: any[];
}

export default function PlaybookTester({ playbooks }: PlaybookTesterProps) {
  const { toast } = useToast();
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>('');
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [customTestData, setCustomTestData] = useState<string>('{}');
  const [activeExecution, setActiveExecution] = useState<TestExecution | null>(null);
  const [testHistory, setTestHistory] = useState<TestExecution[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Test execution mutation
  const executeTestMutation = useMutation({
    mutationFn: async ({ playbookId, testData }: { playbookId: string, testData: any }) => {
      const res = await apiRequest('POST', `/api/playbooks/${playbookId}/test`, {
        testData,
        mode: 'dry-run'
      });
      return await res.json();
    },
    onSuccess: (data) => {
      const execution: TestExecution = {
        id: data.executionId || `test-${Date.now()}`,
        playbookId: selectedPlaybook,
        playbookName: playbooks.find(p => p.id === selectedPlaybook)?.name || 'Unknown',
        status: 'running',
        startTime: new Date().toISOString(),
        steps: [],
        testData: JSON.parse(customTestData),
        results: {}
      };

      setActiveExecution(execution);
      setTestHistory(prev => [execution, ...prev]);

      toast({
        title: "Test Execution Started",
        description: "Playbook test is running in dry-run mode",
      });

      // Simulate step-by-step execution
      simulateExecution(execution);
    },
    onError: (error: Error) => {
      toast({
        title: "Test Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const simulateExecution = async (execution: TestExecution) => {
    const playbook = playbooks.find(p => p.id === execution.playbookId);
    if (!playbook || !playbook.actions) return;

    const steps: TestStep[] = playbook.actions.map((action: any, index: number) => ({
      id: action.id,
      name: action.name,
      status: 'pending' as const
    }));

    setActiveExecution(prev => prev ? { ...prev, steps } : null);

    // Simulate step execution
    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      const step = steps[i];
      step.status = 'running';
      step.startTime = new Date().toISOString();

      setActiveExecution(prev => prev ? { ...prev, steps: [...steps] } : null);

      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));

      // Simulate success/failure (90% success rate)
      const isSuccess = Math.random() > 0.1;
      step.status = isSuccess ? 'completed' : 'failed';
      step.endTime = new Date().toISOString();
      step.duration = Math.floor(Math.random() * 3000) + 500;

      if (isSuccess) {
        step.output = {
          success: true,
          message: `${step.name} executed successfully`,
          data: { processed: true, timestamp: new Date().toISOString() }
        };
      } else {
        step.error = `Simulated failure in ${step.name}`;
      }

      setActiveExecution(prev => prev ? { ...prev, steps: [...steps] } : null);
    }

    // Complete execution
    const finalStatus = steps.every(s => s.status === 'completed') ? 'completed' : 'failed';
    
    setActiveExecution(prev => prev ? {
      ...prev,
      status: finalStatus,
      endTime: new Date().toISOString(),
      results: {
        totalSteps: steps.length,
        completedSteps: steps.filter(s => s.status === 'completed').length,
        failedSteps: steps.filter(s => s.status === 'failed').length,
        duration: Date.now() - new Date(execution.startTime).getTime()
      }
    } : null);

    setTestHistory(prev => 
      prev.map(exec => 
        exec.id === execution.id 
          ? { 
              ...exec, 
              status: finalStatus, 
              endTime: new Date().toISOString(),
              steps,
              results: {
                totalSteps: steps.length,
                completedSteps: steps.filter(s => s.status === 'completed').length,
                failedSteps: steps.filter(s => s.status === 'failed').length,
                duration: Date.now() - new Date(execution.startTime).getTime()
              }
            }
          : exec
      )
    );

    toast({
      title: finalStatus === 'completed' ? "Test Completed Successfully" : "Test Completed with Errors",
      description: `${steps.filter(s => s.status === 'completed').length}/${steps.length} steps completed`,
      variant: finalStatus === 'completed' ? "default" : "destructive"
    });
  };

  const handleScenarioSelect = (scenarioId: string) => {
    const scenario = TEST_SCENARIOS.find(s => s.id === scenarioId);
    if (scenario) {
      setSelectedScenario(scenarioId);
      setCustomTestData(JSON.stringify(scenario.testData, null, 2));
    }
  };

  const handleStartTest = () => {
    if (!selectedPlaybook) {
      toast({
        title: "No Playbook Selected",
        description: "Please select a playbook to test",
        variant: "destructive"
      });
      return;
    }

    try {
      const testData = JSON.parse(customTestData);
      executeTestMutation.mutate({ playbookId: selectedPlaybook, testData });
    } catch (error) {
      toast({
        title: "Invalid Test Data",
        description: "Please provide valid JSON test data",
        variant: "destructive"
      });
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getExecutionProgress = (execution: TestExecution) => {
    if (!execution.steps.length) return 0;
    const completed = execution.steps.filter(s => s.status === 'completed' || s.status === 'failed').length;
    return (completed / execution.steps.length) * 100;
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <TestTube className="h-4 w-4" />
          Test Playbooks
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Playbook Testing Environment
          </DialogTitle>
          <DialogDescription>
            Test playbooks with simulated data in a safe environment
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="setup" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="setup">Test Setup</TabsTrigger>
              <TabsTrigger value="execution">Live Execution</TabsTrigger>
              <TabsTrigger value="history">Test History</TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="flex-1 overflow-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Playbook</CardTitle>
                    <CardDescription>Choose a playbook to test</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select value={selectedPlaybook} onValueChange={setSelectedPlaybook}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select playbook..." />
                      </SelectTrigger>
                      <SelectContent>
                        {playbooks.map(playbook => (
                          <SelectItem key={playbook.id} value={playbook.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{playbook.name}</span>
                              <Badge variant="outline" className="ml-2">
                                {playbook.actions?.length || 0} steps
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedPlaybook && (
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-medium mb-2">Playbook Details</h4>
                        {(() => {
                          const playbook = playbooks.find(p => p.id === selectedPlaybook);
                          return playbook ? (
                            <div className="space-y-1 text-sm">
                              <p><strong>Category:</strong> {playbook.category}</p>
                              <p><strong>Trigger:</strong> {playbook.trigger?.type}</p>
                              <p><strong>Steps:</strong> {playbook.actions?.length || 0}</p>
                              <p><strong>Status:</strong> {playbook.status}</p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Test Scenario</CardTitle>
                    <CardDescription>Choose a predefined scenario or create custom test data</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select value={selectedScenario} onValueChange={handleScenarioSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select test scenario..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TEST_SCENARIOS.map(scenario => (
                          <SelectItem key={scenario.id} value={scenario.id}>
                            <div>
                              <div className="font-medium">{scenario.name}</div>
                              <div className="text-xs text-muted-foreground">{scenario.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedScenario && (
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-medium mb-2">Expected Results</h4>
                        <ul className="text-sm space-y-1">
                          {TEST_SCENARIOS.find(s => s.id === selectedScenario)?.expectedResults.map((result, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              {result}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Test Data</CardTitle>
                  <CardDescription>JSON data that will be passed to the playbook execution</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={customTestData}
                    onChange={(e) => setCustomTestData(e.target.value)}
                    placeholder="Enter JSON test data..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      Tests run in dry-run mode and don't affect production systems
                    </div>
                    
                    <Button 
                      onClick={handleStartTest}
                      disabled={!selectedPlaybook || activeExecution?.status === 'running'}
                      className="flex items-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Start Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="execution" className="flex-1 overflow-auto">
              {activeExecution ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Test Execution: {activeExecution.playbookName}</span>
                        <Badge 
                          variant={
                            activeExecution.status === 'completed' ? 'default' :
                            activeExecution.status === 'failed' ? 'destructive' :
                            'secondary'
                          }
                        >
                          {activeExecution.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Started: {new Date(activeExecution.startTime).toLocaleString()}
                        {activeExecution.endTime && (
                          <span> • Duration: {Math.round((new Date(activeExecution.endTime).getTime() - new Date(activeExecution.startTime).getTime()) / 1000)}s</span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Progress</span>
                          <span>{getExecutionProgress(activeExecution).toFixed(0)}%</span>
                        </div>
                        <Progress value={getExecutionProgress(activeExecution)} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Execution Steps</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {activeExecution.steps.map((step, index) => (
                            <div key={step.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                              <div className="mt-1">
                                {getStepStatusIcon(step.status)}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium">{step.name}</h4>
                                  {step.duration && (
                                    <span className="text-xs text-muted-foreground">
                                      {step.duration}ms
                                    </span>
                                  )}
                                </div>
                                
                                {step.status === 'running' && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Executing step...
                                  </p>
                                )}
                                
                                {step.output && (
                                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(step.output, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                
                                {step.error && (
                                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                    {step.error}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Active Test</h3>
                    <p className="text-muted-foreground text-center">
                      Start a test from the Test Setup tab to see live execution details here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-auto">
              <div className="space-y-4">
                {testHistory.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Test History</h3>
                      <p className="text-muted-foreground text-center">
                        Test executions will appear here once you start running tests.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  testHistory.map(execution => (
                    <Card key={execution.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{execution.playbookName}</span>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={
                                execution.status === 'completed' ? 'default' :
                                execution.status === 'failed' ? 'destructive' :
                                'secondary'
                              }
                            >
                              {execution.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(execution.startTime).toLocaleString()}
                            </span>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Total Steps</p>
                            <p className="font-medium">{execution.results?.totalSteps || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Completed</p>
                            <p className="font-medium text-green-600">{execution.results?.completedSteps || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Failed</p>
                            <p className="font-medium text-red-600">{execution.results?.failedSteps || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duration</p>
                            <p className="font-medium">{execution.results?.duration ? `${Math.round(execution.results.duration / 1000)}s` : 'N/A'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
