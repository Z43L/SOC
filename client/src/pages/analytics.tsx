import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

interface AnalyticsProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

// Sample data for charts
const alertTrendData = [
  { date: 'Mon', critical: 5, high: 8, medium: 12, low: 4 },
  { date: 'Tue', critical: 3, high: 5, medium: 9, low: 6 },
  { date: 'Wed', critical: 8, high: 7, medium: 10, low: 5 },
  { date: 'Thu', critical: 4, high: 6, medium: 11, low: 8 },
  { date: 'Fri', critical: 12, high: 9, medium: 13, low: 4 },
  { date: 'Sat', critical: 2, high: 3, medium: 6, low: 3 },
  { date: 'Sun', critical: 1, high: 2, medium: 5, low: 4 }
];

const alertSourceData = [
  { name: 'Endpoint Security', value: 35 },
  { name: 'Network IDS', value: 25 },
  { name: 'SIEM', value: 20 },
  { name: 'EDR', value: 15 },
  { name: 'Vulnerability Scanner', value: 5 }
];

const COLORS = ['#1E88E5', '#42A5F5', '#64B5F6', '#90CAF9', '#BBDEFB'];

const mitreTacticsData = [
  { name: 'Initial Access', value: 18 },
  { name: 'Execution', value: 25 },
  { name: 'Persistence', value: 15 },
  { name: 'Privilege Escalation', value: 12 },
  { name: 'Defense Evasion', value: 28 },
  { name: 'Credential Access', value: 22 },
  { name: 'Discovery', value: 16 },
  { name: 'Lateral Movement', value: 9 },
  { name: 'Collection', value: 7 },
  { name: 'Command & Control', value: 14 },
  { name: 'Exfiltration', value: 5 },
  { name: 'Impact', value: 8 }
];

const riskTrendData = [
  { month: 'Jan', risk: 78 },
  { month: 'Feb', risk: 75 },
  { month: 'Mar', risk: 70 },
  { month: 'Apr', risk: 68 },
  { month: 'May', risk: 65 },
  { month: 'Jun', risk: 60 },
  { month: 'Jul', risk: 55 },
  { month: 'Aug', risk: 58 },
  { month: 'Sep', risk: 52 },
  { month: 'Oct', risk: 50 },
  { month: 'Nov', risk: 48 },
  { month: 'Dec', risk: 45 }
];

const timeToRemediateData = [
  { severity: 'Critical', time: 2.5 },
  { severity: 'High', time: 6 },
  { severity: 'Medium', time: 12 },
  { severity: 'Low', time: 48 }
];

const Analytics: FC<AnalyticsProps> = ({ user, organization }) => {
  const [dateRange, setDateRange] = useState<string>("7d");
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="analytics" />
      
      <MainContent pageTitle="Security Analytics" organization={organization}>
        <Card className="mb-6">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="text-xs text-muted-foreground mr-2">Date Range</label>
                <select 
                  className="bg-background border border-gray-700 rounded px-2 py-1 text-sm"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                >
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              
              <div>
                <Button variant="outline" size="sm">
                  <i className="fas fa-filter mr-2"></i> Advanced Filters
                </Button>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <i className="fas fa-download mr-2"></i> Export Data
              </Button>
              <Button size="sm">
                <i className="fas fa-print mr-2"></i> Generate Report
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">Total Alerts</p>
                <h3 className="text-3xl font-bold mt-1">1,247</h3>
                <p className="text-green-500 text-xs mt-1">
                  <i className="fas fa-arrow-down mr-1"></i> 12% from previous period
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">Mean Time to Detect</p>
                <h3 className="text-3xl font-bold mt-1">42m</h3>
                <p className="text-green-500 text-xs mt-1">
                  <i className="fas fa-arrow-down mr-1"></i> 8% from previous period
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">Mean Time to Respond</p>
                <h3 className="text-3xl font-bold mt-1">3.2h</h3>
                <p className="text-green-500 text-xs mt-1">
                  <i className="fas fa-arrow-down mr-1"></i> 15% from previous period
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">Security Risk Score</p>
                <h3 className="text-3xl font-bold mt-1">65</h3>
                <p className="text-red-500 text-xs mt-1">
                  <i className="fas fa-arrow-up mr-1"></i> 5% from previous period
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12">
            <Tabs defaultValue="alerts">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="alerts">Alert Analytics</TabsTrigger>
                <TabsTrigger value="threatHunting">Threat Hunting</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
                <TabsTrigger value="performance">SOC Performance</TabsTrigger>
              </TabsList>
              
              <TabsContent value="alerts">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-8">
                    <Card className="h-80">
                      <CardHeader>
                        <CardTitle>Alert Trend</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={alertTrendData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                            <XAxis dataKey="date" tick={{ fill: '#A0A0A0' }} />
                            <YAxis tick={{ fill: '#A0A0A0' }} />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#242424', 
                                borderColor: '#333',
                                color: '#E1E1E1' 
                              }}
                            />
                            <Legend />
                            <Area 
                              type="monotone" 
                              dataKey="critical" 
                              stackId="1"
                              stroke="#CF6679" 
                              fill="#CF6679" 
                              fillOpacity={0.8}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="high" 
                              stackId="1"
                              stroke="#F44336" 
                              fill="#F44336" 
                              fillOpacity={0.7}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="medium" 
                              stackId="1"
                              stroke="#FFB74D" 
                              fill="#FFB74D" 
                              fillOpacity={0.6}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="low" 
                              stackId="1"
                              stroke="#4CAF50" 
                              fill="#4CAF50" 
                              fillOpacity={0.5}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="col-span-12 lg:col-span-4">
                    <Card className="h-80">
                      <CardHeader>
                        <CardTitle>Alert Sources</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={alertSourceData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                              {alertSourceData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#242424', 
                                borderColor: '#333',
                                color: '#E1E1E1' 
                              }}
                              formatter={(value) => [`${value} alerts`, 'Count']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="col-span-12">
                    <Card>
                      <CardHeader>
                        <CardTitle>MITRE ATT&CK Tactics Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={mitreTacticsData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            layout="vertical"
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                            <XAxis type="number" tick={{ fill: '#A0A0A0' }} />
                            <YAxis 
                              dataKey="name" 
                              type="category" 
                              tick={{ fill: '#A0A0A0' }} 
                              width={150}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#242424', 
                                borderColor: '#333',
                                color: '#E1E1E1' 
                              }}
                            />
                            <Bar dataKey="value" fill="#1E88E5" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="threatHunting">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-6">
                    <Card className="h-80">
                      <CardHeader>
                        <CardTitle>Top Attack Patterns</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span>Phishing Attempts</span>
                            <div className="w-1/2 bg-gray-800 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full" style={{ width: '85%' }}></div>
                            </div>
                            <span className="text-sm">85%</span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span>RDP Brute Force</span>
                            <div className="w-1/2 bg-gray-800 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full" style={{ width: '72%' }}></div>
                            </div>
                            <span className="text-sm">72%</span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span>Malware Downloads</span>
                            <div className="w-1/2 bg-gray-800 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full" style={{ width: '64%' }}></div>
                            </div>
                            <span className="text-sm">64%</span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span>SQL Injection</span>
                            <div className="w-1/2 bg-gray-800 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full" style={{ width: '48%' }}></div>
                            </div>
                            <span className="text-sm">48%</span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span>XSS Attacks</span>
                            <div className="w-1/2 bg-gray-800 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full" style={{ width: '37%' }}></div>
                            </div>
                            <span className="text-sm">37%</span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span>File-less Malware</span>
                            <div className="w-1/2 bg-gray-800 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full" style={{ width: '25%' }}></div>
                            </div>
                            <span className="text-sm">25%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="col-span-12 lg:col-span-6">
                    <Card className="h-80">
                      <CardHeader>
                        <CardTitle>Most Targeted Assets</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <div className="flex items-center">
                              <i className="fas fa-server text-blue-500 mr-3"></i>
                              <div>
                                <p className="font-medium text-sm">Web Server</p>
                                <p className="text-xs text-muted-foreground">web-srv-01.internal</p>
                              </div>
                            </div>
                            <span className="text-sm bg-blue-900 bg-opacity-20 text-blue-500 px-2 py-1 rounded">142 events</span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <div className="flex items-center">
                              <i className="fas fa-database text-blue-500 mr-3"></i>
                              <div>
                                <p className="font-medium text-sm">Database Server</p>
                                <p className="text-xs text-muted-foreground">db-prod-02.internal</p>
                              </div>
                            </div>
                            <span className="text-sm bg-blue-900 bg-opacity-20 text-blue-500 px-2 py-1 rounded">98 events</span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <div className="flex items-center">
                              <i className="fas fa-envelope text-blue-500 mr-3"></i>
                              <div>
                                <p className="font-medium text-sm">Email Gateway</p>
                                <p className="text-xs text-muted-foreground">mail-gw.internal</p>
                              </div>
                            </div>
                            <span className="text-sm bg-blue-900 bg-opacity-20 text-blue-500 px-2 py-1 rounded">76 events</span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <div className="flex items-center">
                              <i className="fas fa-key text-blue-500 mr-3"></i>
                              <div>
                                <p className="font-medium text-sm">Domain Controller</p>
                                <p className="text-xs text-muted-foreground">dc-01.internal</p>
                              </div>
                            </div>
                            <span className="text-sm bg-blue-900 bg-opacity-20 text-blue-500 px-2 py-1 rounded">63 events</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="compliance">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Compliance Status</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-6">
                        <div className="space-y-6">
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">PCI-DSS</span>
                              <span className="text-sm text-green-500">92%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2.5">
                              <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '92%' }}></div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">HIPAA</span>
                              <span className="text-sm text-green-500">88%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2.5">
                              <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '88%' }}></div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">ISO 27001</span>
                              <span className="text-sm text-green-500">95%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2.5">
                              <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '95%' }}></div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">GDPR</span>
                              <span className="text-sm text-orange-500">78%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2.5">
                              <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: '78%' }}></div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">NIST CSF</span>
                              <span className="text-sm text-green-500">85%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2.5">
                              <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '85%' }}></div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="col-span-12 lg:col-span-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Security Controls Status</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-6">
                        <div className="space-y-3">
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span className="text-sm">Multi-Factor Authentication</span>
                            <span className="text-xs bg-green-900 bg-opacity-20 text-green-500 px-2 py-1 rounded">
                              <i className="fas fa-check-circle mr-1"></i> Compliant
                            </span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span className="text-sm">Data Encryption</span>
                            <span className="text-xs bg-green-900 bg-opacity-20 text-green-500 px-2 py-1 rounded">
                              <i className="fas fa-check-circle mr-1"></i> Compliant
                            </span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span className="text-sm">Access Controls</span>
                            <span className="text-xs bg-orange-700 bg-opacity-20 text-orange-500 px-2 py-1 rounded">
                              <i className="fas fa-exclamation-circle mr-1"></i> Partial
                            </span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span className="text-sm">Security Awareness Training</span>
                            <span className="text-xs bg-green-900 bg-opacity-20 text-green-500 px-2 py-1 rounded">
                              <i className="fas fa-check-circle mr-1"></i> Compliant
                            </span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span className="text-sm">Incident Response Plan</span>
                            <span className="text-xs bg-red-700 bg-opacity-20 text-red-500 px-2 py-1 rounded">
                              <i className="fas fa-times-circle mr-1"></i> Non-Compliant
                            </span>
                          </div>
                          
                          <div className="bg-background-lighter p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span className="text-sm">Vulnerability Management</span>
                            <span className="text-xs bg-orange-700 bg-opacity-20 text-orange-500 px-2 py-1 rounded">
                              <i className="fas fa-exclamation-circle mr-1"></i> Partial
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="performance">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-6">
                    <Card className="h-80">
                      <CardHeader>
                        <CardTitle>Security Risk Trend</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={riskTrendData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                            <XAxis dataKey="month" tick={{ fill: '#A0A0A0' }} />
                            <YAxis tick={{ fill: '#A0A0A0' }} domain={[40, 80]} />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#242424', 
                                borderColor: '#333',
                                color: '#E1E1E1' 
                              }}
                              formatter={(value) => [`${value}`, 'Risk Score']}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="risk" 
                              stroke="#1E88E5" 
                              activeDot={{ r: 8 }}
                              strokeWidth={2}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="col-span-12 lg:col-span-6">
                    <Card className="h-80">
                      <CardHeader>
                        <CardTitle>Time to Remediate by Severity</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={timeToRemediateData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                            <XAxis dataKey="severity" tick={{ fill: '#A0A0A0' }} />
                            <YAxis tick={{ fill: '#A0A0A0' }} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fill: '#A0A0A0' }} />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#242424', 
                                borderColor: '#333',
                                color: '#E1E1E1' 
                              }}
                              formatter={(value) => [`${value} hours`, 'Average Time']}
                            />
                            <Bar dataKey="time" fill="#1E88E5">
                              <Cell fill="#CF6679" />
                              <Cell fill="#F44336" />
                              <Cell fill="#FFB74D" />
                              <Cell fill="#4CAF50" />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="col-span-12">
                    <Card>
                      <CardHeader>
                        <CardTitle>SOC Team Performance</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-6">
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead>
                              <tr className="text-left bg-background-lighter">
                                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Analyst</th>
                                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Alerts Handled</th>
                                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Avg. Response Time</th>
                                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Avg. Resolution Time</th>
                                <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Accuracy</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              <tr className="hover:bg-background-lighter">
                                <td className="p-3 text-sm">John Doe</td>
                                <td className="p-3 text-sm">145</td>
                                <td className="p-3 text-sm">12 min</td>
                                <td className="p-3 text-sm">1.5 hours</td>
                                <td className="p-3 text-sm">98%</td>
                              </tr>
                              <tr className="hover:bg-background-lighter">
                                <td className="p-3 text-sm">Jane Smith</td>
                                <td className="p-3 text-sm">132</td>
                                <td className="p-3 text-sm">15 min</td>
                                <td className="p-3 text-sm">1.7 hours</td>
                                <td className="p-3 text-sm">97%</td>
                              </tr>
                              <tr className="hover:bg-background-lighter">
                                <td className="p-3 text-sm">Michael Brown</td>
                                <td className="p-3 text-sm">98</td>
                                <td className="p-3 text-sm">18 min</td>
                                <td className="p-3 text-sm">2.1 hours</td>
                                <td className="p-3 text-sm">95%</td>
                              </tr>
                              <tr className="hover:bg-background-lighter">
                                <td className="p-3 text-sm">Sarah Johnson</td>
                                <td className="p-3 text-sm">154</td>
                                <td className="p-3 text-sm">10 min</td>
                                <td className="p-3 text-sm">1.3 hours</td>
                                <td className="p-3 text-sm">99%</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </MainContent>
    </div>
  );
};

export default Analytics;
