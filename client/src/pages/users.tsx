import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, InsertUser, insertUserSchema, Organization } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

interface UsersProps {
  user: User;
  organization: Organization;
}

// Helper to generate initials for the Sidebar
const getUserInitials = (name: string) => {
  if (!name) return "";
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
};

const Users: FC<UsersProps> = ({ user, organization }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);

  const usersQueryKey = [`/api/organizations/${organization.id}/users`, organization.id];

  const { data: orgUsers = [], isLoading } = useQuery<User[] | null>({
    queryKey: usersQueryKey,
    queryFn: getQueryFn<User[] | null>({ on401: "throw" }),
  });

  const addUserForm = useForm<Omit<InsertUser, 'organizationId'>>({
    resolver: zodResolver(insertUserSchema.omit({ organizationId: true })),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
      role: "Security Analyst",
    },
  });

  const editUserForm = useForm<Omit<InsertUser, 'organizationId' | 'password'>>({
    resolver: zodResolver(insertUserSchema.omit({ organizationId: true, password: true })),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      role: "Security Analyst",
    },
  });

  const addUserMutation = useMutation<Response, Error, Omit<InsertUser, 'organizationId'>>({
    mutationFn: async (newUserData) => {
      return apiRequest('POST', `/api/organizations/${organization.id}/users`, newUserData);
    },
    onSuccess: async (response) => {
      const newUser = await response.json() as User;
      toast({
        title: "User Added",
        description: `User ${newUser.name} has been added successfully.`,
      });
      setIsAddUserDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      addUserForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Error Adding User",
        description: error.message || "Could not add user.",
        variant: "destructive",
      });
    }
  });

  const updateUserMutation = useMutation<Response, Error, { userId: number, userData: Omit<InsertUser, 'organizationId' | 'password'> }>({
    mutationFn: async ({ userId, userData }) => {
      return apiRequest('PUT', `/api/users/${userId}`, userData);
    },
    onSuccess: async (response) => {
      const updatedUser = await response.json() as User;
      toast({
        title: "User Updated",
        description: `User ${updatedUser.name} has been updated.`,
      });
      setIsEditUserDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
    },
    onError: (error) => {
      toast({
        title: "Error Updating User",
        description: error.message || "Could not update user.",
        variant: "destructive",
      });
    }
  });

  const deleteUserMutation = useMutation<Response, Error, number>({
    mutationFn: async (userId) => {
      return apiRequest('DELETE', `/api/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "User Deleted",
        description: `User has been deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
    },
    onError: (error) => {
      toast({
        title: "Error Deleting User",
        description: error.message || "Could not delete user.",
        variant: "destructive",
      });
    }
  });

  const onAddUserSubmit = (data: Omit<InsertUser, 'organizationId'>) => {
    addUserMutation.mutate(data);
  };

  const onEditUserSubmit = (data: Omit<InsertUser, 'organizationId' | 'password'>) => {
    if (selectedUser) {
      updateUserMutation.mutate({ userId: selectedUser.id, userData: data });
    }
  };

  const openEditDialog = (userToEdit: User) => {
    setSelectedUser(userToEdit);
    editUserForm.reset({
      name: userToEdit.name,
      username: userToEdit.username,
      email: userToEdit.email,
      role: userToEdit.role,
    });
    setIsEditUserDialogOpen(true);
  };

  const handleDeleteUser = (userId: number) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      deleteUserMutation.mutate(userId);
    }
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
      <Sidebar user={{ name: user.name, initials: getUserInitials(user.name), role: user.role }} activeSection="users" />

      <MainContent pageTitle="Users & Roles" organization={organization}>
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage users within {organization.name}</CardDescription>
                </div>
                <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { addUserForm.reset(); setIsAddUserDialogOpen(true); }}>
                      <i className="fas fa-user-plus mr-2"></i> Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add New User</DialogTitle>
                      <DialogDescription>
                        Create a new user account for your organization: {organization.name}.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...addUserForm}>
                      <form onSubmit={addUserForm.handleSubmit(onAddUserSubmit)} className="space-y-4 py-4">
                        <FormField
                          control={addUserForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <Input placeholder="John Doe" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addUserForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="johndoe" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addUserForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="john.doe@example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addUserForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="••••••••" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addUserForm.control}
                          name="role"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Role</FormLabel>
                              <FormControl>
                                <select {...field} className="w-full bg-background border border-input rounded px-3 py-2 text-sm">
                                  <option value="Security Analyst">Security Analyst</option>
                                  <option value="Security Manager">Security Manager</option>
                                  <option value="Administrator">Administrator</option>
                                  <option value="Read Only">Read Only</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>Cancel</Button>
                          <Button type="submit" disabled={addUserMutation.isPending}>
                            {addUserMutation.isPending ? 
                              <><i className="fas fa-spinner fa-spin mr-2"></i>Adding...</> : 
                              "Add User"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    <span>Loading users...</span>
                  </div>
                ) : !orgUsers || orgUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <i className="fas fa-users text-3xl mb-3"></i>
                    <p>No users found for {organization.name}.</p>
                    <p className="text-sm">Click \"Add User\" to create the first user for this organization.</p>
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
                      <tbody className="divide-y divide-border">
                        {orgUsers.map((orgUser) => (
                          <tr key={orgUser.id} className="hover:bg-muted/50">
                            <td className="p-3">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                  <span className="text-sm text-foreground">{getUserInitials(orgUser.name)}</span>
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm font-medium text-foreground">{orgUser.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">{orgUser.email}</td>
                            <td className="p-3 text-sm text-muted-foreground">{orgUser.username}</td>
                            <td className="p-3">{getRoleBadge(orgUser.role)}</td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {orgUser.lastLogin ? new Date(orgUser.lastLogin).toLocaleString() : 'Never'}
                            </td>
                            <td className="p-3 text-sm">
                              <div className="flex space-x-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditDialog(orgUser)} title="Edit User">
                                  <i className="fas fa-edit"></i>
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
                                  onClick={() => handleDeleteUser(orgUser.id)} 
                                  disabled={deleteUserMutation.isPending && deleteUserMutation.variables === orgUser.id}
                                  title="Delete User"
                                >
                                  {deleteUserMutation.isPending && deleteUserMutation.variables === orgUser.id ? 
                                    <i className="fas fa-spinner fa-spin"></i> : 
                                    <i className="fas fa-trash"></i>}
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

          {selectedUser && (
            <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Edit User: {selectedUser.name}</DialogTitle>
                  <DialogDescription>
                    Update the details for {selectedUser.name} in {organization.name}.
                  </DialogDescription>
                </DialogHeader>
                <Form {...editUserForm}>
                  <form onSubmit={editUserForm.handleSubmit(onEditUserSubmit)} className="space-y-4 py-4">
                    <FormField
                      control={editUserForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editUserForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="johndoe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editUserForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john.doe@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editUserForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <FormControl>
                            <select {...field} className="w-full bg-background border border-input rounded px-3 py-2 text-sm">
                              <option value="Security Analyst">Security Analyst</option>
                              <option value="Security Manager">Security Manager</option>
                              <option value="Administrator">Administrator</option>
                              <option value="Read Only">Read Only</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsEditUserDialogOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={updateUserMutation.isPending}>
                        {updateUserMutation.isPending ? 
                          <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : 
                          "Save Changes"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}

          <TabsContent value="roles">
            <Card>
              <CardHeader>
                <CardTitle>Roles & Permissions</CardTitle>
                <CardDescription>
                  Define roles and manage permissions for your organization. (Coming Soon)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>Role management features will be implemented here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </MainContent>
    </div>
  );
};

export default Users;
