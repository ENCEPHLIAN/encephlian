import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Palette, Type, Save, RefreshCw } from "lucide-react";

// Settings stored in localStorage
const SETTINGS_KEY = "encephlian_admin_settings";

interface AdminSettings {
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
    
    setTimeout(() => {
      setIsSaving(false);
      toast.success("Settings saved successfully");
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure platform behavior and appearance
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Appearance</CardTitle>
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
