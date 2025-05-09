import { FC, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface UsersProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

const Users: FC<UsersProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });
  
  const handleAddUser = () => {
    toast({
      title: "User Added",
      description: "The new user has been added successfully.",
    });
    setIsDialogOpen(false);
  };
  
  const getRoleBadge = (role: string) => {
    switch (role.toLowerCase()) {
      case 'administrator':
        return <Badge className="bg-red-700 bg-opacity-20 text-red-500">Administrator</Badge>;
      case 'security analyst':
        return <Badge className="bg-blue-900 bg-opacity-20 text-blue-500">Security Analyst</Badge>;
      case 'security manager':
        return <Badge className="bg-purple-700 bg-opacity-20 text-purple-400">Security Manager</Badge>;
      case 'executive':
        return <Badge className="bg-orange-700 bg-opacity-20 text-orange-500">Executive</Badge>;
      case 'read only':
        return <Badge className="bg-gray-700 bg-opacity-20 text-gray-400">Read Only</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="users" />
      
      <MainContent pageTitle="Users & Roles" organization={organization}>
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="activity">User Activity</TabsTrigger>
          </TabsList>
          
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage users who have access to the platform</CardDescription>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <i className="fas fa-user-plus mr-2"></i> Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add New User</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Full Name</label>
                        <input 
                          type="text" 
                          placeholder="John Doe"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Email</label>
                        <input 
                          type="email" 
                          placeholder="john.doe@example.com"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Username</label>
                        <input 
                          type="text" 
                          placeholder="johndoe"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Role</label>
                        <select className="w-full bg-background border border-gray-700 rounded px-3 py-2">
                          <option>Security Analyst</option>
                          <option>Security Manager</option>
                          <option>Administrator</option>
                          <option>Executive</option>
                          <option>Read Only</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Password</label>
                        <input 
                          type="password" 
                          placeholder="••••••••"
                          className="w-full bg-background border border-gray-700 rounded px-3 py-2"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleAddUser}>Create User</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    <span>Loading users...</span>
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <i className="fas fa-users text-3xl mb-3"></i>
                    <p>No users found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-left bg-background-lighter">
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Name</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Email</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Username</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Role</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Last Login</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-background-lighter">
                            <td className="p-3">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                                  <span className="text-sm text-white">{user.name.split(' ').map(n => n[0]).join('')}</span>
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm font-medium text-text-primary">{user.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">{user.email}</td>
                            <td className="p-3 text-sm text-muted-foreground">{user.username}</td>
                            <td className="p-3">{getRoleBadge(user.role)}</td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                            </td>
                            <td className="p-3 text-sm">
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">
                                  <i className="fas fa-edit"></i>
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <i className="fas fa-key"></i>
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <i className="fas fa-trash"></i>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="roles">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Administrator</CardTitle>
                  <CardDescription>Full system access and management capabilities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Permissions:</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>User Management</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>System Configuration</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Alert Management</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Incident Response</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Reporting & Analytics</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Integration Management</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full">Edit Role</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Security Analyst</CardTitle>
                  <CardDescription>SOC operations, alert triage, and incident response</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Permissions:</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Alerts</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Respond to Incidents</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Run Standard Reports</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Threat Intelligence</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>User Management</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>System Configuration</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full">Edit Role</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Security Manager</CardTitle>
                  <CardDescription>Oversight of security operations and team management</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Permissions:</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>All Analyst Permissions</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Create Custom Reports</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Manage Playbooks</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Team Performance</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>System Configuration</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>Integration Management</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full">Edit Role</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Executive</CardTitle>
                  <CardDescription>High-level overview and reporting access</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Permissions:</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>Dashboard Access</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Reports</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>High-level Analytics</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>Alert Management</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>Incident Response</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>User Management</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full">Edit Role</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Read Only</CardTitle>
                  <CardDescription>View-only access across the platform</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Permissions:</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Dashboards</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Alerts (No Action)</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-check text-green-500 mr-2"></i>
                        <span>View Reports</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>Modify Any Settings</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>Respond to Incidents</span>
                      </div>
                      <div className="flex items-center">
                        <i className="fas fa-times text-red-500 mr-2"></i>
                        <span>Run Custom Reports</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full">Edit Role</Button>
                </CardFooter>
              </Card>
              
              <Card className="border-dashed border-2 border-gray-700 flex flex-col justify-center items-center p-6">
                <div className="text-center">
                  <i className="fas fa-plus-circle text-3xl text-muted-foreground mb-3"></i>
                  <h3 className="font-medium mb-2">Create Custom Role</h3>
                  <p className="text-sm text-muted-foreground mb-4">Define a role with custom permissions</p>
                  <Button variant="outline">Add New Role</Button>
                </div>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="teams">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Teams</CardTitle>
                  <CardDescription>Organize users into functional teams</CardDescription>
                </div>
                <Button>
                  <i className="fas fa-plus mr-2"></i> Create Team
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-background-lighter p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium">SOC Team</h3>
                      <Badge className="bg-green-900 bg-opacity-20 text-green-500">Active</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">Primary security operations team responsible for daily monitoring and response.</p>
                    <div className="flex -space-x-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">JD</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">AS</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">MB</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">+2</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-users"></i>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-background-lighter p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium">Threat Intelligence</h3>
                      <Badge className="bg-green-900 bg-opacity-20 text-green-500">Active</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">Specialists focused on threat research, analysis and intelligence gathering.</p>
                    <div className="flex -space-x-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">SJ</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">RB</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">+1</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-users"></i>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-background-lighter p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium">Incident Response</h3>
                      <Badge className="bg-green-900 bg-opacity-20 text-green-500">Active</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">Advanced team handling complex security incidents and breaches.</p>
                    <div className="flex -space-x-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">TK</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">AM</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">JD</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">+3</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-users"></i>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-background-lighter p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium">Vulnerability Management</h3>
                      <Badge className="bg-green-900 bg-opacity-20 text-green-500">Active</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">Team responsible for vulnerability scanning, analysis and remediation tracking.</p>
                    <div className="flex -space-x-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">RL</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">CP</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-users"></i>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-background-lighter p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium">Security Engineering</h3>
                      <Badge className="bg-yellow-700 bg-opacity-20 text-yellow-500">Forming</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">Technical team for security tool deployment, integration and maintenance.</p>
                    <div className="flex -space-x-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border-2 border-background-lighter">
                        <span className="text-xs text-white">BT</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-users"></i>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>User Activity Log</CardTitle>
                <CardDescription>Track user actions within the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div>
                        <label className="text-xs text-muted-foreground mr-2">Filter by User</label>
                        <select className="bg-background border border-gray-700 rounded px-2 py-1 text-sm">
                          <option value="">All Users</option>
                          <option value="1">John Doe</option>
                          <option value="2">Jane Smith</option>
                          <option value="3">Michael Brown</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-muted-foreground mr-2">Action Type</label>
                        <select className="bg-background border border-gray-700 rounded px-2 py-1 text-sm">
                          <option value="">All Actions</option>
                          <option value="login">Login</option>
                          <option value="logout">Logout</option>
                          <option value="alert">Alert Management</option>
                          <option value="incident">Incident Response</option>
                          <option value="config">Configuration Change</option>
                        </select>
                      </div>
                    </div>
                    
                    <Button variant="outline" size="sm">
                      <i className="fas fa-calendar-alt mr-2"></i> Date Range
                    </Button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-left bg-background-lighter">
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Timestamp</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">User</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Action</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">Details</th>
                          <th className="p-3 text-xs font-medium text-muted-foreground tracking-wider">IP Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 09:45:23</td>
                          <td className="p-3 text-sm">John Doe</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-green-900 bg-opacity-20 text-green-500">Login</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">Successful login</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.102</td>
                        </tr>
                        
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 10:12:05</td>
                          <td className="p-3 text-sm">John Doe</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-blue-900 bg-opacity-20 text-blue-500">Alert Update</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">Changed alert #432 status to "In Progress"</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.102</td>
                        </tr>
                        
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 11:30:18</td>
                          <td className="p-3 text-sm">Jane Smith</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-orange-700 bg-opacity-20 text-orange-500">Configuration</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">Modified alert rule configuration</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.145</td>
                        </tr>
                        
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 12:15:44</td>
                          <td className="p-3 text-sm">Michael Brown</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-purple-700 bg-opacity-20 text-purple-400">Report</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">Generated Executive Summary report</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.156</td>
                        </tr>
                        
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 13:05:37</td>
                          <td className="p-3 text-sm">John Doe</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-red-700 bg-opacity-20 text-red-500">Incident</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">Created new incident #89 from alert #432</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.102</td>
                        </tr>
                        
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 15:22:08</td>
                          <td className="p-3 text-sm">Sarah Johnson</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-green-900 bg-opacity-20 text-green-500">Login</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">Successful login</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.178</td>
                        </tr>
                        
                        <tr className="hover:bg-background-lighter">
                          <td className="p-3 text-sm text-muted-foreground">2023-10-02 16:44:51</td>
                          <td className="p-3 text-sm">Jane Smith</td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline" className="bg-yellow-700 bg-opacity-20 text-yellow-500">Logout</Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">User logged out</td>
                          <td className="p-3 text-sm text-muted-foreground">192.168.1.145</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="flex justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing 7 of 248 activities
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
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </MainContent>
    </div>
  );
};

export default Users;
