import { FC, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { 
  Loader2, 
  Shield, 
  Smartphone, 
  Key, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Monitor,
  LogOut
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SecurityTabProps {
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

interface UserSettings {
  mfaEnabled: boolean;
  mfaSecret?: string;
}

interface ActiveSession {
  id: string;
  deviceInfo: string;
  location: string;
  lastActivity: string;
  current: boolean;
}

export const SecurityTab: FC<SecurityTabProps> = ({ user, organization }) => {
  const [isEnablingMfa, setIsEnablingMfa] = useState(false);
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user settings for MFA status
  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: [`/api/settings/user`],
    queryFn: getQueryFn<UserSettings>({ on401: "throw" }),
    initialData: {
      mfaEnabled: false,
    }
  });

  // Fetch active sessions
  const { data: sessions, isLoading: sessionsLoading } = useQuery<ActiveSession[]>({
    queryKey: [`/api/settings/user/sessions`],
    queryFn: getQueryFn<ActiveSession[]>({ on401: "throw" }),
    initialData: []
  });

  // Enable MFA mutation
  const enableMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/settings/user/mfa/enable");
      return response.json();
    },
    onSuccess: (data) => {
      setMfaQrCode(data.qrCode);
      setShowMfaSetup(true);
      setIsEnablingMfa(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enable MFA",
        variant: "destructive",
      });
      setIsEnablingMfa(false);
    },
  });

  // Verify and confirm MFA setup
  const verifyMfaMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/settings/user/mfa/verify", { token });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "MFA Enabled",
        description: "Two-factor authentication has been successfully enabled.",
      });
      setShowMfaSetup(false);
      setMfaQrCode("");
      setMfaToken("");
      queryClient.invalidateQueries({ queryKey: [`/api/settings/user`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Invalid verification code",
        variant: "destructive",
      });
    },
  });

  // Disable MFA mutation
  const disableMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/settings/user/mfa/disable");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "MFA Disabled",
        description: "Two-factor authentication has been disabled.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/settings/user`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to disable MFA",
        variant: "destructive",
      });
    },
  });

  // Terminate session mutation
  const terminateSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/settings/user/sessions/${sessionId}/terminate`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Session terminated",
        description: "The session has been successfully terminated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/settings/user/sessions`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to terminate session",
        variant: "destructive",
      });
    },
  });

  const handleEnableMfa = () => {
    setIsEnablingMfa(true);
    enableMfaMutation.mutate();
  };

  const handleVerifyMfa = () => {
    if (!mfaToken.trim()) {
      toast({
        title: "Error",
        description: "Please enter the verification code",
        variant: "destructive",
      });
      return;
    }
    verifyMfaMutation.mutate(mfaToken);
  };

  const handleDisableMfa = () => {
    if (window.confirm("Are you sure you want to disable two-factor authentication? This will make your account less secure.")) {
      disableMfaMutation.mutate();
    }
  };

  const handleTerminateSession = (sessionId: string) => {
    if (window.confirm("Are you sure you want to terminate this session?")) {
      terminateSessionMutation.mutate(sessionId);
    }
  };

  const formatLastActivity = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account with 2FA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label>Status</Label>
                {settings.mfaEnabled ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Disabled
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {settings.mfaEnabled 
                  ? "Your account is protected with two-factor authentication"
                  : "Enable 2FA to secure your account with an authenticator app"
                }
              </p>
            </div>
            <div className="space-x-2">
              {settings.mfaEnabled ? (
                <Button 
                  variant="destructive" 
                  onClick={handleDisableMfa}
                  disabled={disableMfaMutation.isPending}
                >
                  {disableMfaMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Disabling...
                    </>
                  ) : (
                    "Disable 2FA"
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={handleEnableMfa}
                  disabled={isEnablingMfa || enableMfaMutation.isPending}
                >
                  {isEnablingMfa || enableMfaMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-4 w-4 mr-2" />
                      Enable 2FA
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {!settings.mfaEnabled && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                For enhanced security, we recommend enabling two-factor authentication. 
                You'll need an authenticator app like Google Authenticator or Authy.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Active Sessions
          </CardTitle>
          <CardDescription>
            Manage your active login sessions across different devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No active sessions found.
            </p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      <span className="font-medium">{session.deviceInfo}</span>
                      {session.current && (
                        <Badge variant="outline" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="mr-4">📍 {session.location}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last activity: {formatLastActivity(session.lastActivity)}
                      </span>
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTerminateSession(session.id)}
                      disabled={terminateSessionMutation.isPending}
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Terminate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Security Recommendations
          </CardTitle>
          <CardDescription>
            Follow these best practices to keep your account secure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-medium">Use a strong password</h4>
                <p className="text-sm text-muted-foreground">
                  Your password should be at least 12 characters long and include a mix of letters, numbers, and symbols.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              {settings.mfaEnabled ? (
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
              )}
              <div>
                <h4 className="font-medium">Enable two-factor authentication</h4>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security with 2FA using an authenticator app.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-medium">Keep your sessions secure</h4>
                <p className="text-sm text-muted-foreground">
                  Regularly review and terminate unused sessions, especially on shared devices.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MFA Setup Dialog */}
      <Dialog open={showMfaSetup} onOpenChange={setShowMfaSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app, then enter the verification code.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {mfaQrCode && (
              <div className="flex justify-center">
                <div 
                  className="border rounded-lg p-4 bg-white"
                  dangerouslySetInnerHTML={{ __html: mfaQrCode }}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="mfa-token">Verification Code</Label>
              <Input
                id="mfa-token"
                placeholder="Enter 6-digit code"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                maxLength={6}
                className="text-center text-lg tracking-widest"
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowMfaSetup(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleVerifyMfa}
                disabled={verifyMfaMutation.isPending || !mfaToken.trim()}
              >
                {verifyMfaMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Enable"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
