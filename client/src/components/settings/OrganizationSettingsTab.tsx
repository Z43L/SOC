import { FC, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Upload, Loader2, Save, Building2, Palette, Shield, Users } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface OrganizationSettingsTabProps {
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

interface OrgSettings {
  branding: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    faviconUrl?: string;
  };
  security: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
    };
    mfaRequired: boolean;
    sessionTimeout: number;
    ipAllowList: string[];
  };
  defaultLocale: string;
  defaultTimezone: string;
  auditRetentionDays: number;
}

const locales = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
];

const timezones = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
  { value: "Asia/Shanghai", label: "China Standard Time (CST)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
];

export const OrganizationSettingsTab: FC<OrganizationSettingsTabProps> = ({ user, organization }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch organization settings
  const { data: settings, isLoading: settingsLoading } = useQuery<OrgSettings>({
    queryKey: [`/api/settings/org`],
    queryFn: getQueryFn<OrgSettings>({ on401: "throw" }),
    initialData: {
      branding: {},
      security: {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: false,
        },
        mfaRequired: false,
        sessionTimeout: 480, // 8 hours in minutes
        ipAllowList: [],
      },
      defaultLocale: "en-US",
      defaultTimezone: "UTC",
      auditRetentionDays: 365,
    }
  });

  const [formData, setFormData] = useState<OrgSettings>(settings);

  // Update organization settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<OrgSettings>) => {
      const response = await apiRequest("PATCH", "/api/settings/org", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings updated",
        description: "Organization settings have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/settings/org`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  // Logo upload callback
  const onLogoDrops = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("logo", file);

      const response = await apiRequest("POST", "/api/settings/org/logo", formDataUpload, {
        headers: {}, // Let the browser set the content-type
      });
      const result = await response.json();

      setFormData(prev => ({
        ...prev,
        branding: { ...prev.branding, logoUrl: result.logoUrl }
      }));
      
      updateSettingsMutation.mutate({ 
        branding: { ...formData.branding, logoUrl: result.logoUrl }
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, updateSettingsMutation, formData.branding]);

  // Favicon upload callback
  const onFaviconDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (preferably ICO or PNG).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 1 * 1024 * 1024) { // 1MB limit for favicon
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 1MB for favicon.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("favicon", file);

      const response = await apiRequest("POST", "/api/settings/org/favicon", formDataUpload, {
        headers: {},
      });
      const result = await response.json();

      setFormData(prev => ({
        ...prev,
        branding: { ...prev.branding, faviconUrl: result.faviconUrl }
      }));
      
      updateSettingsMutation.mutate({ 
        branding: { ...formData.branding, faviconUrl: result.faviconUrl }
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload favicon",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, updateSettingsMutation, formData.branding]);

  const logoDropzone = useDropzone({
    onDrop: onLogoDrops,
    accept: { "image/*": [] },
    maxFiles: 1,
  });

  const faviconDropzone = useDropzone({
    onDrop: onFaviconDrop,
    accept: { "image/*": [] },
    maxFiles: 1,
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(formData);
  };

  const handlePasswordPolicyChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      security: {
        ...prev.security,
        passwordPolicy: {
          ...prev.security.passwordPolicy,
          [field]: value,
        }
      }
    }));
  };

  const handleSecurityChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      security: {
        ...prev.security,
        [field]: value,
      }
    }));
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
      {/* Organization Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Information
          </CardTitle>
          <CardDescription>
            Basic information about your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input id="org-name" value={organization.name} disabled />
              <p className="text-xs text-muted-foreground">
                Contact support to change your organization name
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-id">Organization ID</Label>
              <Input id="org-id" value={organization.id} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Branding
          </CardTitle>
          <CardDescription>
            Customize the appearance of your organization's interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo Upload */}
          <div className="space-y-4">
            <Label>Organization Logo</Label>
            <div className="flex items-center space-x-4">
              {formData.branding.logoUrl && (
                <div className="h-16 w-16 border rounded-lg flex items-center justify-center overflow-hidden">
                  <img 
                    src={formData.branding.logoUrl} 
                    alt="Organization logo" 
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1">
                <div
                  {...logoDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    logoDropzone.isDragActive
                      ? "border-primary bg-primary/10"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  <input {...logoDropzone.getInputProps()} />
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Uploading...
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {logoDropzone.isDragActive
                          ? "Drop your logo here"
                          : "Drag & drop a logo, or click to select"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG up to 5MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Favicon Upload */}
          <div className="space-y-4">
            <Label>Favicon</Label>
            <div className="flex items-center space-x-4">
              {formData.branding.faviconUrl && (
                <div className="h-8 w-8 border rounded flex items-center justify-center overflow-hidden">
                  <img 
                    src={formData.branding.faviconUrl} 
                    alt="Favicon" 
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1">
                <div
                  {...faviconDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    faviconDropzone.isDragActive
                      ? "border-primary bg-primary/10"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  <input {...faviconDropzone.getInputProps()} />
                  <div>
                    <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {faviconDropzone.isDragActive
                        ? "Drop favicon here"
                        : "Click to upload favicon"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ICO, PNG up to 1MB
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Color Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="primary-color"
                  type="color"
                  value={formData.branding.primaryColor || "#0066cc"}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      branding: { ...prev.branding, primaryColor: e.target.value }
                    }))
                  }
                  className="w-12 h-10 p-1 rounded border"
                />
                <Input
                  value={formData.branding.primaryColor || "#0066cc"}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      branding: { ...prev.branding, primaryColor: e.target.value }
                    }))
                  }
                  placeholder="#0066cc"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Secondary Color</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="secondary-color"
                  type="color"
                  value={formData.branding.secondaryColor || "#666666"}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      branding: { ...prev.branding, secondaryColor: e.target.value }
                    }))
                  }
                  className="w-12 h-10 p-1 rounded border"
                />
                <Input
                  value={formData.branding.secondaryColor || "#666666"}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      branding: { ...prev.branding, secondaryColor: e.target.value }
                    }))
                  }
                  placeholder="#666666"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Default User Settings
          </CardTitle>
          <CardDescription>
            Default settings applied to new users in your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-locale">Default Language</Label>
              <Select
                value={formData.defaultLocale}
                onValueChange={(value) =>
                  setFormData(prev => ({ ...prev, defaultLocale: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((locale) => (
                    <SelectItem key={locale.value} value={locale.value}>
                      {locale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-timezone">Default Timezone</Label>
              <Select
                value={formData.defaultTimezone}
                onValueChange={(value) =>
                  setFormData(prev => ({ ...prev, defaultTimezone: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((timezone) => (
                    <SelectItem key={timezone.value} value={timezone.value}>
                      {timezone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Policies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Policies
          </CardTitle>
          <CardDescription>
            Configure organization-wide security requirements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Password Policy */}
          <div className="space-y-4">
            <h4 className="font-medium">Password Policy</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-length">Minimum Length</Label>
                <Input
                  id="min-length"
                  type="number"
                  min="6"
                  max="64"
                  value={formData.security.passwordPolicy.minLength}
                  onChange={(e) =>
                    handlePasswordPolicyChange("minLength", parseInt(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                <Input
                  id="session-timeout"
                  type="number"
                  min="15"
                  max="1440"
                  value={formData.security.sessionTimeout}
                  onChange={(e) =>
                    handleSecurityChange("sessionTimeout", parseInt(e.target.value))
                  }
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="require-uppercase">Require Uppercase Letters</Label>
                  <p className="text-sm text-muted-foreground">
                    Password must contain at least one uppercase letter
                  </p>
                </div>
                <Switch
                  id="require-uppercase"
                  checked={formData.security.passwordPolicy.requireUppercase}
                  onCheckedChange={(checked) =>
                    handlePasswordPolicyChange("requireUppercase", checked)
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="require-lowercase">Require Lowercase Letters</Label>
                  <p className="text-sm text-muted-foreground">
                    Password must contain at least one lowercase letter
                  </p>
                </div>
                <Switch
                  id="require-lowercase"
                  checked={formData.security.passwordPolicy.requireLowercase}
                  onCheckedChange={(checked) =>
                    handlePasswordPolicyChange("requireLowercase", checked)
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="require-numbers">Require Numbers</Label>
                  <p className="text-sm text-muted-foreground">
                    Password must contain at least one number
                  </p>
                </div>
                <Switch
                  id="require-numbers"
                  checked={formData.security.passwordPolicy.requireNumbers}
                  onCheckedChange={(checked) =>
                    handlePasswordPolicyChange("requireNumbers", checked)
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="require-symbols">Require Special Characters</Label>
                  <p className="text-sm text-muted-foreground">
                    Password must contain at least one special character
                  </p>
                </div>
                <Switch
                  id="require-symbols"
                  checked={formData.security.passwordPolicy.requireSymbols}
                  onCheckedChange={(checked) =>
                    handlePasswordPolicyChange("requireSymbols", checked)
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="require-mfa">Require Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Force all users to enable 2FA for their accounts
                  </p>
                </div>
                <Switch
                  id="require-mfa"
                  checked={formData.security.mfaRequired}
                  onCheckedChange={(checked) =>
                    handleSecurityChange("mfaRequired", checked)
                  }
                />
              </div>
            </div>
          </div>

          {/* Audit Settings */}
          <div className="space-y-4">
            <h4 className="font-medium">Audit & Compliance</h4>
            <div className="space-y-2">
              <Label htmlFor="audit-retention">Audit Log Retention (days)</Label>
              <Input
                id="audit-retention"
                type="number"
                min="30"
                max="2555" // 7 years
                value={formData.auditRetentionDays}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, auditRetentionDays: parseInt(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                How long to retain audit logs and settings history
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSaveSettings}
          disabled={updateSettingsMutation.isPending}
          size="lg"
        >
          {updateSettingsMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Organization Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
