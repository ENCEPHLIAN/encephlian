import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Mail, MailX, Palette, Type, Save, RefreshCw } from "lucide-react";

// Settings stored in localStorage for now (can be moved to Supabase later)
const SETTINGS_KEY = "encephlian_admin_settings";

interface AdminSettings {
  emailNotificationsEnabled: boolean;
  selectedFont: string;
}

const FONT_OPTIONS = [
  { value: "system", label: "System Default", family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { value: "inter", label: "Inter", family: "'Inter', sans-serif" },
  { value: "geist", label: "Geist Sans", family: "'Geist Sans', sans-serif" },
  { value: "sf-pro", label: "SF Pro Display", family: "'SF Pro Display', -apple-system, sans-serif" },
  { value: "plus-jakarta", label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif" },
];

export default function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>({
    emailNotificationsEnabled: true,
    selectedFont: "system",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch {
        // Use defaults
      }
    }
  }, []);

  // Apply font when changed
  useEffect(() => {
    const font = FONT_OPTIONS.find(f => f.value === settings.selectedFont);
    if (font) {
      document.documentElement.style.setProperty('--font-sans', font.family);
    }
  }, [settings.selectedFont]);

  const handleSave = () => {
    setIsSaving(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    // Store email setting separately for edge functions to check
    localStorage.setItem("encephlian_emails_enabled", String(settings.emailNotificationsEnabled));
    
    setTimeout(() => {
      setIsSaving(false);
      toast.success("Settings saved successfully");
    }, 500);
  };

  const handleEmailToggle = (enabled: boolean) => {
    setSettings(prev => ({ ...prev, emailNotificationsEnabled: enabled }));
    localStorage.setItem("encephlian_emails_enabled", String(enabled));
    toast.info(enabled ? "Email notifications enabled" : "Email notifications disabled");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Configure platform behavior and appearance
        </p>
      </div>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {settings.emailNotificationsEnabled ? (
              <Mail className="h-5 w-5 text-green-500" />
            ) : (
              <MailX className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-base font-mono">Email Notifications</CardTitle>
              <CardDescription>
                Control Resend email delivery (receipts, notifications, support)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Enable Email Sending</Label>
              <p className="text-xs text-muted-foreground">
                Toggle off to prevent Resend API calls during testing (free tier: 100/day, 3000/month)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge 
                variant={settings.emailNotificationsEnabled ? "default" : "secondary"}
                className="font-mono text-xs"
              >
                {settings.emailNotificationsEnabled ? "ACTIVE" : "DISABLED"}
              </Badge>
              <Switch
                checked={settings.emailNotificationsEnabled}
                onCheckedChange={handleEmailToggle}
              />
            </div>
          </div>
          
          {!settings.emailNotificationsEnabled && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Email notifications are currently disabled. No emails will be sent via Resend.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-mono">Appearance</CardTitle>
              <CardDescription>
                Customize the PaaS visual appearance for clinicians
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-muted-foreground" />
              <Label>Primary Font</Label>
            </div>
            <Select 
              value={settings.selectedFont} 
              onValueChange={(v) => setSettings(prev => ({ ...prev, selectedFont: v }))}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(font => (
                  <SelectItem key={font.value} value={font.value}>
                    <span style={{ fontFamily: font.family }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Note: ENCEPHLIAN branding always uses Montserrat regardless of this setting
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-muted-foreground">Font Preview</Label>
            <div 
              className="p-4 border rounded-lg bg-muted/30"
              style={{ fontFamily: FONT_OPTIONS.find(f => f.value === settings.selectedFont)?.family }}
            >
              <p className="text-lg font-semibold">The quick brown fox jumps over the lazy dog</p>
              <p className="text-sm text-muted-foreground mt-2">
                ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
