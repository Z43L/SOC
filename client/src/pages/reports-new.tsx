import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { 
  ReportTemplate, 
  ReportGenerated, 
  InsertReportTemplate, 
  ReportType, 
  ReportFormatType,
  User,
  Organization 
} from "@shared/schema";
import { format } from "date-fns";
import { AlertCircle, Download, Calendar, Clock, FileText, Play, Settings, Trash2, Edit, Plus } from "lucide-react";

interface ReportsProps {
  user: User;
  organization: Organization;
}

const Reports: FC<ReportsProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState<{ [key: number]: boolean }>({});
  const [reportFormData, setReportFormData] = useState({
    title: '',
    description: '',
    type: 'custom' as ReportType,
    format: 'pdf' as ReportFormatType,
    periodFrom: '',
    periodTo: '',
    parameters: {
      sections: {
        executive: false,
        alerts: true,
        incidents: true,
        threats: false,
        vulnerabilities: true,
        compliance: false,
        recommendations: true
      }
    },
    notifyEmails: [],
    scheduleCron: '',
    isEnabled: true
  });

  // Data fetching
  const { data: templates = [], isLoading: templatesLoading } = useQuery<ReportTemplate[]>({
    queryKey: ['/api/report-templates'],
    queryFn: getQueryFn(),
  });

  const { data: generatedReports = [], isLoading: reportsLoading } = useQuery<ReportGenerated[]>({
    queryKey: ['/api/reports'],
    queryFn: getQueryFn(),
  });

  const { data: reportStats } = useQuery({
    queryKey: ['/api/reports/statistics'],
    queryFn: getQueryFn(),
  });

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: Omit<InsertReportTemplate, 'organizationId'>) => {
      const response = await apiRequest('POST', '/api/report-templates', templateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/report-templates'] });
      setIsTemplateDialogOpen(false);
      resetForm();
      toast({
        title: "Template Created",
        description: "Report template has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Creating Template",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const generateReportMutation = useMutation({
    mutationFn: async ({ templateId, customData }: { templateId?: number; customData?: any }) => {
      const response = await apiRequest('POST', '/api/reports/generate', {
        templateId,
        ...customData
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      toast({
        title: "Report Generation Started",
        description: `Report "${data.name}" is being generated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await apiRequest('DELETE', `/api/report-templates/${templateId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/report-templates'] });
      toast({
        title: "Template Deleted",
        description: "Report template has been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Helper functions
  const handleGenerateReport = async (template: ReportTemplate) => {
    setIsGenerating(prev => ({ ...prev, [template.id]: true }));
    try {
      await generateReportMutation.mutateAsync({ templateId: template.id });
    } finally {
      setIsGenerating(prev => ({ ...prev, [template.id]: false }));
    }
  };

  const handleCustomReportGenerate = async () => {
    const customData = {
      name: reportFormData.title,
      type: reportFormData.type,
      format: reportFormData.format,
      periodFrom: new Date(reportFormData.periodFrom),
      periodTo: new Date(reportFormData.periodTo),
      parameters: reportFormData.parameters
    };
    
    await generateReportMutation.mutateAsync({ customData });
  };

  const resetForm = () => {
    setReportFormData({
      title: '',
      description: '',
      type: 'custom',
      format: 'pdf',
      periodFrom: '',
      periodTo: '',
      parameters: {
        sections: {
          executive: false,
          alerts: true,
          incidents: true,
          threats: false,
          vulnerabilities: true,
          compliance: false,
          recommendations: true
        }
      },
      notifyEmails: [],
      scheduleCron: '',
      isEnabled: true
    });
  };

  const getTypeIcon = (type: ReportType) => {
    switch (type) {
      case 'executive_summary': return 'fas fa-chart-line';
      case 'technical_incidents': return 'fas fa-exclamation-triangle';
      case 'compliance_audit': return 'fas fa-shield-alt';
      case 'agent_health': return 'fas fa-heartbeat';
      case 'vulnerability_assessment': return 'fas fa-bug';
      case 'threat_intelligence': return 'fas fa-eye';
      case 'soc_performance': return 'fas fa-tachometer-alt';
      default: return 'fas fa-file-alt';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-900 bg-opacity-20 text-green-500">Completed</Badge>;
      case 'generating':
        return <Badge className="bg-blue-900 bg-opacity-20 text-blue-500">Generating</Badge>;
      case 'scheduled':
        return <Badge className="bg-yellow-900 bg-opacity-20 text-yellow-500">Scheduled</Badge>;
      case 'failed':
        return <Badge className="bg-red-900 bg-opacity-20 text-red-500">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatTypeLabel = (type: ReportType) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="reports" />
      
      <MainContent pageTitle="Security Reports" organization={organization}>
        <Tabs defaultValue="templates">
          <TabsList className="mb-6">
            <TabsTrigger value="templates">Report Templates</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
            <TabsTrigger value="history">Report History</TabsTrigger>
            <TabsTrigger value="custom">Custom Reports</TabsTrigger>
          </TabsList>
          
          <TabsContent value="templates">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold">Report Templates</h3>
                <p className="text-sm text-muted-foreground">Manage and generate security reports</p>
              </div>
              <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Report Template</DialogTitle>
                    <DialogDescription>
                      Configure a new automated report template
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="template-name">Template Name</Label>
                        <Input
                          id="template-name"
                          value={reportFormData.title}
                          onChange={(e) => setReportFormData(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Enter template name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="template-type">Report Type</Label>
                        <Select
                          value={reportFormData.type}
                          onValueChange={(value: ReportType) => setReportFormData(prev => ({ ...prev, type: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select report type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="executive_summary">Executive Summary</SelectItem>
                            <SelectItem value="technical_incidents">Technical Incidents</SelectItem>
                            <SelectItem value="compliance_audit">Compliance Audit</SelectItem>
                            <SelectItem value="agent_health">Agent Health</SelectItem>
                            <SelectItem value="vulnerability_assessment">Vulnerability Assessment</SelectItem>
                            <SelectItem value="threat_intelligence">Threat Intelligence</SelectItem>
                            <SelectItem value="soc_performance">SOC Performance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="template-description">Description</Label>
                      <Textarea
                        id="template-description"
                        value={reportFormData.description}
                        onChange={(e) => setReportFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe this report template"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="schedule-cron">Schedule (Cron)</Label>
                        <Input
                          id="schedule-cron"
                          value={reportFormData.scheduleCron}
                          onChange={(e) => setReportFormData(prev => ({ ...prev, scheduleCron: e.target.value }))}
                          placeholder="0 9 * * 1 (Weekly Monday 9AM)"
                        />
                      </div>
                      <div>
                        <Label htmlFor="report-format">Format</Label>
                        <Select
                          value={reportFormData.format}
                          onValueChange={(value: ReportFormatType) => setReportFormData(prev => ({ ...prev, format: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pdf">PDF</SelectItem>
                            <SelectItem value="html">HTML</SelectItem>
                            <SelectItem value="xlsx">Excel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="template-enabled"
                        checked={reportFormData.isEnabled}
                        onCheckedChange={(checked) => setReportFormData(prev => ({ ...prev, isEnabled: checked }))}
                      />
                      <Label htmlFor="template-enabled">Enable automated generation</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => createTemplateMutation.mutate({
                        name: reportFormData.title,
                        description: reportFormData.description,
                        type: reportFormData.type,
                        parameters: reportFormData.parameters,
                        scheduleCron: reportFormData.scheduleCron,
                        format: reportFormData.format,
                        isEnabled: reportFormData.isEnabled,
                        createdBy: user.id
                      })}
                      disabled={createTemplateMutation.isPending || !reportFormData.title}
                    >
                      {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {templatesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-700 rounded w-full"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {[1, 2, 3].map((j) => (
                          <div key={j} className="h-3 bg-gray-700 rounded w-full"></div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <Card key={template.id} className="relative">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center">
                            <i className={`${getTypeIcon(template.type)} mr-2 text-blue-500`}></i>
                            {template.name}
                          </CardTitle>
                          <CardDescription>{template.description}</CardDescription>
                        </div>
                        <div className="flex space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(template)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => deleteTemplateMutation.mutate(template.id)}
                            disabled={deleteTemplateMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>Type:</span>
                          <Badge variant="secondary">{formatTypeLabel(template.type)}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Format:</span>
                          <span className="uppercase">{template.format}</span>
                        </div>
                        {template.scheduleCron && (
                          <div className="flex items-center justify-between">
                            <span>Schedule:</span>
                            <span>{template.scheduleCron}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span>Status:</span>
                          {template.isEnabled ? (
                            <Badge className="bg-green-900 bg-opacity-20 text-green-500">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        className="w-full" 
                        onClick={() => handleGenerateReport(template)}
                        disabled={isGenerating[template.id]}
                      >
                        {isGenerating[template.id] ? (
                          <>
                            <Clock className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Generate Now
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
                
                {templates.length === 0 && (
                  <div className="col-span-full">
                    <Card className="text-center py-12">
                      <CardContent>
                        <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">No Report Templates</h3>
                        <p className="text-muted-foreground mb-4">
                          Create your first report template to get started with automated reporting.
                        </p>
                        <Button onClick={() => setIsTemplateDialogOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Create Template
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="scheduled">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Reports</CardTitle>
                <CardDescription>Manage your automated report delivery</CardDescription>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-gray-700 rounded animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-left bg-background-lighter">
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Report Type</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Schedule</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Format</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Last Run</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {templates.filter(t => t.isEnabled && t.scheduleCron).map((template) => (
                          <tr key={template.id} className="hover:bg-background-lighter">
                            <td className="p-3 text-sm">{formatTypeLabel(template.type)}</td>
                            <td className="p-3 text-sm font-mono text-xs">{template.scheduleCron}</td>
                            <td className="p-3 text-sm uppercase">{template.format}</td>
                            <td className="p-3 text-sm">
                              {template.lastRunAt ? format(new Date(template.lastRunAt), 'MMM dd, HH:mm') : 'Never'}
                            </td>
                            <td className="p-3 text-sm">{getStatusBadge('active')}</td>
                            <td className="p-3 text-sm">
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(template)}>
                                  <Settings className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {templates.filter(t => t.isEnabled && t.scheduleCron).length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p>No scheduled reports configured</p>
                              <p className="text-sm">Create a template with a schedule to see it here</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Report History</CardTitle>
                <CardDescription>Previously generated reports</CardDescription>
              </CardHeader>
              <CardContent>
                {reportsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-16 bg-gray-700 rounded animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-left bg-background-lighter">
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Report Name</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Type</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Generated</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {generatedReports.map((report) => (
                            <tr key={report.id} className="hover:bg-background-lighter">
                              <td className="p-3 text-sm font-medium">{report.name}</td>
                              <td className="p-3 text-sm">
                                <Badge variant="secondary">{formatTypeLabel(report.type)}</Badge>
                              </td>
                              <td className="p-3 text-sm">
                                {format(new Date(report.createdAt), 'MMM dd, yyyy HH:mm')}
                              </td>
                              <td className="p-3 text-sm">{getStatusBadge(report.status)}</td>
                              <td className="p-3 text-sm">
                                <div className="flex space-x-2">
                                  {report.status === 'completed' && report.filePath && (
                                    <Button variant="ghost" size="sm">
                                      <Download className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {report.status === 'failed' && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleGenerateReport({ id: report.templateId } as ReportTemplate)}
                                    >
                                      <Play className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {generatedReports.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No reports generated yet</p>
                                <p className="text-sm">Generate your first report to see it here</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {generatedReports.length > 0 && (
                      <div className="flex justify-between mt-4">
                        <div className="text-sm text-muted-foreground">
                          Showing {generatedReports.length} reports
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="custom">
            <Card>
              <CardHeader>
                <CardTitle>Custom Report Builder</CardTitle>
                <CardDescription>Create a tailored security report</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <Label>Report Title</Label>
                    <Input 
                      value={reportFormData.title}
                      onChange={(e) => setReportFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter report title" 
                    />
                  </div>
                  
                  <div>
                    <Label>Time Range</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Start Date</Label>
                        <Input 
                          type="date" 
                          value={reportFormData.periodFrom}
                          onChange={(e) => setReportFormData(prev => ({ ...prev, periodFrom: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">End Date</Label>
                        <Input 
                          type="date" 
                          value={reportFormData.periodTo}
                          onChange={(e) => setReportFormData(prev => ({ ...prev, periodTo: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Report Sections</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-executive" 
                          checked={reportFormData.parameters.sections.executive}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, executive: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-executive">Executive Summary</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-alerts" 
                          checked={reportFormData.parameters.sections.alerts}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, alerts: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-alerts">Alert Statistics</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-incidents" 
                          checked={reportFormData.parameters.sections.incidents}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, incidents: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-incidents">Security Incidents</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-threats" 
                          checked={reportFormData.parameters.sections.threats}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, threats: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-threats">Threat Intelligence</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-vulnerabilities" 
                          checked={reportFormData.parameters.sections.vulnerabilities}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, vulnerabilities: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-vulnerabilities">Vulnerabilities</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-compliance" 
                          checked={reportFormData.parameters.sections.compliance}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, compliance: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-compliance">Compliance Status</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="section-recommendations" 
                          checked={reportFormData.parameters.sections.recommendations}
                          onCheckedChange={(checked) => setReportFormData(prev => ({
                            ...prev,
                            parameters: {
                              ...prev.parameters,
                              sections: { ...prev.parameters.sections, recommendations: checked as boolean }
                            }
                          }))}
                        />
                        <Label htmlFor="section-recommendations">Recommendations</Label>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Report Format</Label>
                    <Select 
                      value={reportFormData.format} 
                      onValueChange={(value: ReportFormatType) => setReportFormData(prev => ({ ...prev, format: value }))}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="xlsx">Excel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <Button variant="outline" onClick={resetForm}>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button 
                      onClick={handleCustomReportGenerate}
                      disabled={generateReportMutation.isPending || !reportFormData.title || !reportFormData.periodFrom || !reportFormData.periodTo}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {generateReportMutation.isPending ? "Generating..." : "Generate Report"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </MainContent>
    </div>
  );
};

export default Reports;
