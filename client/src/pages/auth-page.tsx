import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertUser, insertUserSchema } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { z } from "zod";
import { useState } from "react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginData = z.infer<typeof loginSchema>;

const organizationRegisterSchema = z.object({
  organizationName: z.string().min(2, { message: "Organization name must be at least 2 characters." }),
  adminName: z.string().min(2, { message: "Your name must be at least 2 characters." }),
  adminUsername: z.string().min(2, { message: "Username must be at least 2 characters." }),
  adminEmail: z.string().email({ message: "Please enter a valid email address." }),
  adminPassword: z.string().min(8, { message: "Password must be at least 8 characters." }),
  passwordConfirm: z.string().min(8, { message: "Password confirmation must be at least 8 characters." }),
}).refine(data => data.adminPassword === data.passwordConfirm, {
  message: "Passwords do not match",
  path: ["passwordConfirm"],
});

type OrganizationRegisterData = z.infer<typeof organizationRegisterSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, navigate] = useLocation();
  
  useEffect(() => {
    if (registerMutation.isSuccess) {
      navigate("/dashboard");
    }
  }, [registerMutation.isSuccess, navigate]);

  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const defaultTab = searchParams.get('action') === 'register' ? 'register' : 'login';
  const planParam = searchParams.get('plan');
  
  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<OrganizationRegisterData>({
    resolver: zodResolver(organizationRegisterSchema),
    defaultValues: {
      organizationName: "",
      adminName: "",
      adminUsername: "",
      adminEmail: "",
      adminPassword: "",
      passwordConfirm: "",
    },
  });

  const onLoginSubmit = (data: LoginData) => {
    loginMutation.mutate(data, {
      onSuccess: () => {
        navigate('/dashboard');
      },
      onError: (error) => {
        // Resetear el formulario solo en caso de error
        loginForm.reset({
          username: data.username,
          password: ''
        });
      }
    });
  };

  const onRegisterSubmit = (values: OrganizationRegisterData) => {
    const { organizationName, adminName, adminUsername, adminEmail, adminPassword } = values;
    registerMutation.mutate({
      name: adminName,
      username: adminUsername,
      email: adminEmail,
      password: adminPassword,
      role: 'Administrator',
      organizationName: organizationName,
    } as any);
  };

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 p-8">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2">SOC-Inteligente</h1>
          <p className="text-muted-foreground mb-8">
            The AI-powered Security Operations Center platform
          </p>

          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register Organization</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Login</CardTitle>
                  <CardDescription>
                    Enter your credentials to access your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...loginForm}>
                    <form
                      onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                      className="space-y-4"
                    >
                      <FormField
                        control={loginForm.control}
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
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                {...field}
                                autoComplete="current-password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Logging in...
                          </>
                        ) : (
                          "Login"
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Register Organization</CardTitle>
                  <CardDescription>
                    Create a new organization and administrator account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...registerForm}>
                    <form
                      onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                      className="space-y-4"
                    >
                      <FormField
                        control={registerForm.control}
                        name="organizationName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Your Organization Inc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="adminName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="adminUsername"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Administrator Username</FormLabel>
                            <FormControl>
                              <Input placeholder="adminuser" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="adminEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Administrator Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="admin@example.com"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="adminPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Administrator Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="********"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="passwordConfirm"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Administrator Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="********"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Registering...
                          </>
                        ) : (
                          "Register Organization"
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
                <CardFooter className="text-sm text-muted-foreground">
                  By registering, you agree to our Terms of Service and Privacy
                  Policy.
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="hidden lg:flex flex-col bg-gradient-to-br from-primary to-primary/80 text-primary-foreground w-1/2 p-12 justify-center">
        <div className="max-w-xl">
          <h1 className="text-4xl font-bold mb-6">AI-Powered Security Operations Center</h1>
          <ul className="space-y-4 mb-8">
            <li className="flex gap-2 items-start">
              <div className="bg-primary-foreground/20 p-1 rounded-full mt-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <strong className="block font-medium">AI-Enhanced Threat Detection</strong>
                <span className="text-primary-foreground/80">
                  Identify threats faster with machine learning algorithms that adapt
                  to your environment.
                </span>
              </div>
            </li>
            <li className="flex gap-2 items-start">
              <div className="bg-primary-foreground/20 p-1 rounded-full mt-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <strong className="block font-medium">Automated Response</strong>
                <span className="text-primary-foreground/80">
                  Configurable incident response playbooks to automate remediation
                  of common threats.
                </span>
              </div>
            </li>
            <li className="flex gap-2 items-start">
              <div className="bg-primary-foreground/20 p-1 rounded-full mt-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <strong className="block font-medium">Integrated Threat Intelligence</strong>
                <span className="text-primary-foreground/80">
                  Seamlessly integrate with external threat intelligence feeds to
                  stay ahead of emerging threats.
                </span>
              </div>
            </li>
          </ul>
          <p className="text-lg">
            SOC-Inteligente helps you monitor, detect, and respond to security threats
            across your entire infrastructure with the power of artificial intelligence.
          </p>
        </div>
      </div>
    </div>
  );
}