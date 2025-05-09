import { FC, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface ReportsProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

const Reports: FC<ReportsProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  
  const handleGenerateReport = (reportType: string) => {
    setIsGenerating(true);
    
    // Simulate report generation
    setTimeout(() => {
      setIsGenerating(false);
      toast({
        title: "Report Generated",
        description: `Your ${reportType} report has been generated successfully.`,
      });
    }, 2000);
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Executive Summary</CardTitle>
                  <CardDescription>
                    High-level overview of security posture and key incidents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Security metrics</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Critical incidents</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Risk assessment</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Compliance status</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Action recommendations</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    onClick={() => handleGenerateReport("Executive Summary")}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf mr-2"></i>
                        Generate Report
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Threat Intelligence</CardTitle>
                  <CardDescription>
                    Detailed analysis of threats and intelligence
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Emerging threats</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>IOC summary</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Threat actor profiles</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Mitigation recommendations</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Industry-specific threats</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    onClick={() => handleGenerateReport("Threat Intelligence")}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf mr-2"></i>
                        Generate Report
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Security Incidents</CardTitle>
                  <CardDescription>
                    Comprehensive incident analysis and response
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Incident timeline</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Attack vectors</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Impact assessment</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Response actions</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Lessons learned</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    onClick={() => handleGenerateReport("Security Incidents")}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf mr-2"></i>
                        Generate Report
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Vulnerability Assessment</CardTitle>
                  <CardDescription>
                    Detailed analysis of system vulnerabilities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Vulnerability summary</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Risk-based prioritization</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Patch status</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Remediation plan</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Trending vulnerabilities</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    onClick={() => handleGenerateReport("Vulnerability Assessment")}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf mr-2"></i>
                        Generate Report
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Compliance Report</CardTitle>
                  <CardDescription>
                    Regulatory compliance status and gaps
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Compliance frameworks</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Control effectiveness</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Gap analysis</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Remediation roadmap</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Evidence collection</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    onClick={() => handleGenerateReport("Compliance Report")}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf mr-2"></i>
                        Generate Report
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>SOC Performance</CardTitle>
                  <CardDescription>
                    Security operations center efficiency metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Analyst performance</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>MTTD & MTTR</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Alert triaging</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Incident handling</span>
                    </div>
                    <div className="flex items-center">
                      <i className="fas fa-check text-green-500 mr-2"></i>
                      <span>Resource utilization</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    onClick={() => handleGenerateReport("SOC Performance")}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-file-pdf mr-2"></i>
                        Generate Report
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="scheduled">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Reports</CardTitle>
                <CardDescription>Manage your automated report delivery</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left bg-background-lighter">
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Report Type</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Frequency</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Recipients</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Next Run</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Executive Summary</td>
                        <td className="p-3 text-sm">Weekly</td>
                        <td className="p-3 text-sm">3 recipients</td>
                        <td className="p-3 text-sm">Monday, 9:00 AM</td>
                        <td className="p-3 text-sm">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 bg-opacity-20 text-green-500">
                            Active
                          </span>
                        </td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-edit"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-trash"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Security Incidents</td>
                        <td className="p-3 text-sm">Daily</td>
                        <td className="p-3 text-sm">5 recipients</td>
                        <td className="p-3 text-sm">Tomorrow, 8:00 AM</td>
                        <td className="p-3 text-sm">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 bg-opacity-20 text-green-500">
                            Active
                          </span>
                        </td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-edit"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-trash"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Compliance Report</td>
                        <td className="p-3 text-sm">Monthly</td>
                        <td className="p-3 text-sm">2 recipients</td>
                        <td className="p-3 text-sm">1st of next month</td>
                        <td className="p-3 text-sm">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 bg-opacity-20 text-green-500">
                            Active
                          </span>
                        </td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-edit"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-trash"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Vulnerability Assessment</td>
                        <td className="p-3 text-sm">Bi-weekly</td>
                        <td className="p-3 text-sm">4 recipients</td>
                        <td className="p-3 text-sm">Next Friday</td>
                        <td className="p-3 text-sm">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-700 bg-opacity-20 text-red-500">
                            Paused
                          </span>
                        </td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-edit"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-trash"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-4">
                  <Button>
                    <i className="fas fa-plus mr-2"></i> Schedule New Report
                  </Button>
                </div>
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
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left bg-background-lighter">
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Report Name</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Generated On</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Generated By</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Format</th>
                        <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Executive Summary - Q3 2023</td>
                        <td className="p-3 text-sm">Oct 02, 2023</td>
                        <td className="p-3 text-sm">John Doe</td>
                        <td className="p-3 text-sm">PDF</td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-download"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-share-alt"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Threat Intelligence Briefing</td>
                        <td className="p-3 text-sm">Sep 28, 2023</td>
                        <td className="p-3 text-sm">Auto-generated</td>
                        <td className="p-3 text-sm">PDF</td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-download"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-share-alt"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Security Incidents - September</td>
                        <td className="p-3 text-sm">Sep 30, 2023</td>
                        <td className="p-3 text-sm">Auto-generated</td>
                        <td className="p-3 text-sm">PDF, XLSX</td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-download"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-share-alt"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">PCI-DSS Compliance Assessment</td>
                        <td className="p-3 text-sm">Sep 15, 2023</td>
                        <td className="p-3 text-sm">Jane Smith</td>
                        <td className="p-3 text-sm">PDF</td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-download"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-share-alt"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">Vulnerability Report - Q3</td>
                        <td className="p-3 text-sm">Sep 10, 2023</td>
                        <td className="p-3 text-sm">Auto-generated</td>
                        <td className="p-3 text-sm">PDF, CSV</td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-download"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-share-alt"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <tr className="hover:bg-background-lighter">
                        <td className="p-3 text-sm">SOC Performance - August</td>
                        <td className="p-3 text-sm">Sep 02, 2023</td>
                        <td className="p-3 text-sm">Michael Brown</td>
                        <td className="p-3 text-sm">PDF</td>
                        <td className="p-3 text-sm">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-download"></i>
                            </Button>
                            <Button variant="ghost" size="sm">
                              <i className="fas fa-share-alt"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing 6 of 42 reports
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <i className="fas fa-arrow-left mr-1"></i> Previous
                    </Button>
                    <Button variant="outline" size="sm">
                      Next <i className="fas fa-arrow-right ml-1"></i>
                    </Button>
                  </div>
                </div>
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
                    <label className="text-sm font-medium block mb-2">Report Title</label>
                    <input 
                      type="text" 
                      placeholder="Enter report title" 
                      className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">Time Range</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Start Date</label>
                        <input 
                          type="date" 
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">End Date</label>
                        <input 
                          type="date" 
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">Report Sections</label>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-executive" className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-executive">Executive Summary</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-alerts" defaultChecked className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-alerts">Alert Statistics</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-incidents" defaultChecked className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-incidents">Security Incidents</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-threats" className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-threats">Threat Intelligence</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-vulnerabilities" defaultChecked className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-vulnerabilities">Vulnerabilities</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-compliance" className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-compliance">Compliance Status</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="section-recommendations" defaultChecked className="rounded border-gray-700 bg-background" />
                        <label htmlFor="section-recommendations">Recommendations</label>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">Report Format</label>
                    <div className="flex space-x-4">
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="format-pdf" name="format" defaultChecked className="rounded-full border-gray-700 bg-background" />
                        <label htmlFor="format-pdf">PDF</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="format-xlsx" name="format" className="rounded-full border-gray-700 bg-background" />
                        <label htmlFor="format-xlsx">Excel</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="format-csv" name="format" className="rounded-full border-gray-700 bg-background" />
                        <label htmlFor="format-csv">CSV</label>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">Delivery Options</label>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="delivery-email" defaultChecked className="rounded border-gray-700 bg-background" />
                        <label htmlFor="delivery-email">Send via Email</label>
                      </div>
                      <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 ml-6" id="email-options">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Recipients (comma-separated)</label>
                            <input 
                              type="text" 
                              placeholder="email@example.com" 
                              className="w-full bg-background border border-gray-700 rounded px-3 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Subject</label>
                            <input 
                              type="text" 
                              placeholder="Security Report" 
                              className="w-full bg-background border border-gray-700 rounded px-3 py-1 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="delivery-download" defaultChecked className="rounded border-gray-700 bg-background" />
                        <label htmlFor="delivery-download">Available for Download</label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="delivery-schedule" className="rounded border-gray-700 bg-background" />
                        <label htmlFor="delivery-schedule">Schedule Recurring</label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <Button variant="outline">
                      <i className="fas fa-save mr-2"></i> Save Template
                    </Button>
                    <Button>
                      <i className="fas fa-file-alt mr-2"></i> Generate Report
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
