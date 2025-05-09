import { FC } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ApiKeyConfig } from "@/components/settings/ApiKeyConfig";
import { AutoUpdates } from "@/components/configuration/AutoUpdates";

interface ConfigurationProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

const Configuration: FC<ConfigurationProps> = ({ user, organization }) => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="configuration" />
      
      <MainContent pageTitle="System Configuration" organization={organization}>
        <Tabs defaultValue="general">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="api">API Access</TabsTrigger>
            <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <div className="space-y-6">
              <AutoUpdates />
              
              <Card>
                <CardHeader>
                  <CardTitle>General Configuration</CardTitle>
                  <CardDescription>Configure basic system settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">System Name</label>
                      <input 
                        type="text" 
                        value="SOC-Inteligente"
                        className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2"
                      />
                      <p className="text-xs text-muted-foreground">The name of your Security Operations Center</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Time Zone</label>
                      <select className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2">
                        <option>UTC (Coordinated Universal Time)</option>
                        <option>America/New_York (Eastern Time)</option>
                        <option>America/Chicago (Central Time)</option>
                        <option>America/Denver (Mountain Time)</option>
                        <option>America/Los_Angeles (Pacific Time)</option>
                        <option>Europe/London (GMT)</option>
                        <option>Europe/Paris (Central European Time)</option>
                        <option>Asia/Tokyo (Japan Standard Time)</option>
                      </select>
                      <p className="text-xs text-muted-foreground">Default time zone for displaying dates and times</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Data Retention</label>
                      <select className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2">
                        <option>30 Days</option>
                        <option>60 Days</option>
                        <option>90 Days</option>
                        <option>180 Days</option>
                        <option>1 Year</option>
                        <option>2 Years</option>
                        <option>Custom</option>
                      </select>
                      <p className="text-xs text-muted-foreground">How long to retain security event data</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Theme</label>
                      <select className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2">
                        <option>Dark (Default)</option>
                        <option>Light</option>
                        <option>System Preference</option>
                      </select>
                      <p className="text-xs text-muted-foreground">Interface color scheme</p>
                    </div>
                    
                    <div className="pt-4">
                      <Button>Save Changes</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="integrations">
            <div className="space-y-6">
              <ApiKeyConfig />

              <Card>
                <CardHeader>
                  <CardTitle>External Integrations Configuration</CardTitle>
                  <CardDescription>Configure external system integrations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-10 text-muted-foreground">
                    <p>Additional integration settings are managed in the Connectors section.</p>
                    <Button className="mt-2" variant="outline" onClick={() => window.location.href = "/connectors"}>
                      Go to Connectors
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>Configure alert and system notifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Email Notifications</h3>
                    
                    <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                      <div>
                        <p className="font-medium">Critical Alerts</p>
                        <p className="text-sm text-muted-foreground">Send email for critical severity alerts</p>
                      </div>
                      <div>
                        <input type="checkbox" id="critical-alerts" className="mr-2" checked />
                        <label htmlFor="critical-alerts">Enabled</label>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                      <div>
                        <p className="font-medium">High Severity Alerts</p>
                        <p className="text-sm text-muted-foreground">Send email for high severity alerts</p>
                      </div>
                      <div>
                        <input type="checkbox" id="high-alerts" className="mr-2" checked />
                        <label htmlFor="high-alerts">Enabled</label>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                      <div>
                        <p className="font-medium">System Status</p>
                        <p className="text-sm text-muted-foreground">Send email for system status changes</p>
                      </div>
                      <div>
                        <input type="checkbox" id="system-status" className="mr-2" checked />
                        <label htmlFor="system-status">Enabled</label>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                      <div>
                        <p className="font-medium">Weekly Reports</p>
                        <p className="text-sm text-muted-foreground">Send weekly security summary reports</p>
                      </div>
                      <div>
                        <input type="checkbox" id="weekly-reports" className="mr-2" checked />
                        <label htmlFor="weekly-reports">Enabled</label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">SMTP Settings</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">SMTP Server</label>
                        <input 
                          type="text" 
                          placeholder="smtp.example.com"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">SMTP Port</label>
                        <input 
                          type="text" 
                          placeholder="587"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">SMTP Username</label>
                        <input 
                          type="text" 
                          placeholder="username@example.com"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">SMTP Password</label>
                        <input 
                          type="password" 
                          placeholder="••••••••"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">From Email</label>
                      <input 
                        type="email" 
                        placeholder="soc-alerts@example.com"
                        className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2"
                      />
                    </div>
                    
                    <div className="pt-2">
                      <Button variant="outline" size="sm" className="mr-2">Test Connection</Button>
                      <Button size="sm">Save SMTP Settings</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>Manage API access and keys</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-md font-medium">API Access</h3>
                      <div>
                        <input type="checkbox" id="api-enabled" className="mr-2" checked />
                        <label htmlFor="api-enabled">Enabled</label>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Allow external systems to access SOC data via API</p>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">API Keys</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-left bg-background-lighter">
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Key Name</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Created</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Last Used</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          <tr className="hover:bg-background-lighter">
                            <td className="p-3">Integration Key</td>
                            <td className="p-3 text-sm text-muted-foreground">2023-03-15</td>
                            <td className="p-3 text-sm text-muted-foreground">2023-04-05</td>
                            <td className="p-3"><span className="px-2 py-1 text-xs rounded-full bg-green-900 bg-opacity-20 text-green-500">Active</span></td>
                            <td className="p-3">
                              <Button variant="ghost" size="sm" className="text-destructive">Revoke</Button>
                            </td>
                          </tr>
                          <tr className="hover:bg-background-lighter">
                            <td className="p-3">Report Generator</td>
                            <td className="p-3 text-sm text-muted-foreground">2023-02-10</td>
                            <td className="p-3 text-sm text-muted-foreground">2023-04-06</td>
                            <td className="p-3"><span className="px-2 py-1 text-xs rounded-full bg-green-900 bg-opacity-20 text-green-500">Active</span></td>
                            <td className="p-3">
                              <Button variant="ghost" size="sm" className="text-destructive">Revoke</Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    
                    <Button>
                      <i className="fas fa-plus mr-2"></i> Generate New API Key
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-md font-medium">API Rate Limiting</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Rate Limit (requests per minute)</label>
                        <input 
                          type="number" 
                          value="60"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Burst Limit</label>
                        <input 
                          type="number" 
                          value="100"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Button>Save API Settings</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="backup">
            <Card>
              <CardHeader>
                <CardTitle>Backup & Restore</CardTitle>
                <CardDescription>Manage system backups and restore points</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Automatic Backups</h3>
                    
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <input type="checkbox" id="auto-backup" className="mr-2" checked />
                        <label htmlFor="auto-backup" className="font-medium">Enable Automatic Backups</label>
                      </div>
                      <p className="text-sm text-muted-foreground">Schedule regular system backups</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Backup Frequency</label>
                      <select className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2">
                        <option>Daily</option>
                        <option>Weekly</option>
                        <option>Monthly</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Backup Time</label>
                      <input 
                        type="time" 
                        value="02:00"
                        className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2"
                      />
                      <p className="text-xs text-muted-foreground">Scheduled backup time (server time)</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Retention Period</label>
                      <select className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2">
                        <option>7 Days</option>
                        <option>14 Days</option>
                        <option>30 Days</option>
                        <option>90 Days</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Manual Backup</h3>
                    <Button>
                      <i className="fas fa-download mr-2"></i> Create Backup Now
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Recent Backups</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-left bg-background-lighter">
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Backup Date</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Type</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Size</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Status</th>
                            <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          <tr className="hover:bg-background-lighter">
                            <td className="p-3">2023-04-05 02:00:00</td>
                            <td className="p-3 text-sm text-muted-foreground">Automated</td>
                            <td className="p-3 text-sm text-muted-foreground">245 MB</td>
                            <td className="p-3"><span className="px-2 py-1 text-xs rounded-full bg-green-900 bg-opacity-20 text-green-500">Complete</span></td>
                            <td className="p-3">
                              <Button variant="ghost" size="sm" className="mr-2">Download</Button>
                              <Button variant="ghost" size="sm">Restore</Button>
                            </td>
                          </tr>
                          <tr className="hover:bg-background-lighter">
                            <td className="p-3">2023-04-04 02:00:00</td>
                            <td className="p-3 text-sm text-muted-foreground">Automated</td>
                            <td className="p-3 text-sm text-muted-foreground">240 MB</td>
                            <td className="p-3"><span className="px-2 py-1 text-xs rounded-full bg-green-900 bg-opacity-20 text-green-500">Complete</span></td>
                            <td className="p-3">
                              <Button variant="ghost" size="sm" className="mr-2">Download</Button>
                              <Button variant="ghost" size="sm">Restore</Button>
                            </td>
                          </tr>
                          <tr className="hover:bg-background-lighter">
                            <td className="p-3">2023-04-03 15:30:22</td>
                            <td className="p-3 text-sm text-muted-foreground">Manual</td>
                            <td className="p-3 text-sm text-muted-foreground">238 MB</td>
                            <td className="p-3"><span className="px-2 py-1 text-xs rounded-full bg-green-900 bg-opacity-20 text-green-500">Complete</span></td>
                            <td className="p-3">
                              <Button variant="ghost" size="sm" className="mr-2">Download</Button>
                              <Button variant="ghost" size="sm">Restore</Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-md font-medium">Restore from Backup</h3>
                    <div className="p-4 bg-background-lighter border border-warning rounded">
                      <h4 className="text-warning font-medium mb-2">Warning: Data Loss Risk</h4>
                      <p className="text-sm">Restoring from a backup will replace all current data with the data from the selected backup. This action cannot be undone.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Upload Backup File</label>
                      <div className="flex items-center">
                        <input 
                          type="file"
                          className="w-full max-w-md bg-background border border-gray-700 rounded px-3 py-2"
                        />
                        <Button className="ml-2" variant="outline">Upload & Restore</Button>
                      </div>
                    </div>
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

export default Configuration;