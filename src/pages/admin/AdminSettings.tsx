import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Type, Save, RefreshCw, Globe, Shield, Database, Cpu, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const SETTINGS_KEY = "encephlian_admin_settings";

interface AdminSettings {
  selectedFont: string;
  tablePageSize: number;
  autoRefreshInterval: number;
  showStudyIds: boolean;
}

const FONT_OPTIONS = [
  { value: "system", label: "System Default", family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { value: "inter", label: "Inter", family: "'Inter', sans-serif" },
  { value: "geist", label: "Geist Sans", family: "'Geist Sans', sans-serif" },
  { value: "sf-pro", label: "SF Pro Display", family: "'SF Pro Display', -apple-system, sans-serif" },
  { value: "plus-jakarta", label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif" },
];

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/30">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>({
    selectedFont: "system",
    tablePageSize: 50,
    autoRefreshInterval: 30,
    showStudyIds: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try { setSettings(prev => ({ ...prev, ...JSON.parse(stored) })); } catch { /* use defaults */ }
    }
  }, []);

  useEffect(() => {
    const font = FONT_OPTIONS.find(f => f.value === settings.selectedFont);
    if (font) document.documentElement.style.setProperty("--font-sans", font.family);
  }, [settings.selectedFont]);

  const { data: sysInfo } = useQuery({
    queryKey: ["admin-sys-info"],
    queryFn: async () => {
      const { data: clinics } = await supabase.from("clinics").select("id", { count: "exact", head: true });
      const { count: userCount } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      const { count: studyCount } = await supabase.rpc("admin_get_all_studies").then(r => ({ count: r.data?.length ?? 0 }));
      return {
        clinics: (clinics as any)?.length ?? 0,
        users: userCount ?? 0,
        studies: studyCount,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "not set",
        buildTime: new Date().toISOString(),
      };
    },
  });

  const handleSave = () => {
    setIsSaving(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setTimeout(() => { setIsSaving(false); toast.success("Settings saved"); }, 300);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Platform configuration and preferences</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { localStorage.removeItem(SETTINGS_KEY); window.location.reload(); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Appearance */}
      <Section title="Appearance" icon={Type}>
        <Row label="Primary Font" desc="Applies to the admin interface">
          <Select value={settings.selectedFont} onValueChange={(v) => setSettings(p => ({ ...p, selectedFont: v }))}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map(f => (
                <SelectItem key={f.value} value={f.value}>
                  <span style={{ fontFamily: f.family }}>{f.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Preview">
          <span
            className="text-sm text-muted-foreground"
            style={{ fontFamily: FONT_OPTIONS.find(f => f.value === settings.selectedFont)?.family }}
          >
            The quick brown fox
          </span>
        </Row>
      </Section>

      {/* Table / UX */}
      <Section title="Interface" icon={Globe}>
        <Row label="Table page size" desc="Rows per page in admin tables">
          <Select value={String(settings.tablePageSize)} onValueChange={(v) => setSettings(p => ({ ...p, tablePageSize: Number(v) }))}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Auto-refresh interval" desc="Dashboard and studies polling">
          <Select value={String(settings.autoRefreshInterval)} onValueChange={(v) => setSettings(p => ({ ...p, autoRefreshInterval: Number(v) }))}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[15, 30, 60, 300].map(n => <SelectItem key={n} value={String(n)}>{n}s</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Show full study IDs" desc="Display UUIDs instead of truncated keys">
          <Switch checked={settings.showStudyIds} onCheckedChange={(v) => setSettings(p => ({ ...p, showStudyIds: v }))} />
        </Row>
      </Section>

      {/* Security */}
      <Section title="Security" icon={Shield}>
        <Row label="TFA enforcement" desc="All management accounts must have TFA enabled">
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">Enforced</Badge>
        </Row>
        <Row label="Session timeout" desc="Inactive sessions are invalidated by Supabase">
          <Badge variant="secondary" className="text-[10px]">Supabase-managed</Badge>
        </Row>
        <Row label="CORS policy" desc="All backend services — allow_origins">
          <Badge variant="secondary" className="text-[10px] font-mono">*</Badge>
        </Row>
        <Row label="API key auth" desc="All service-to-service calls require ENCEPH_API_KEY">
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">Enabled</Badge>
        </Row>
      </Section>

      {/* Platform info */}
      <Section title="Platform" icon={Database}>
        <Row label="Supabase URL">
          <span className="text-xs font-mono text-muted-foreground truncate max-w-[260px]">
            {sysInfo?.supabaseUrl ?? "—"}
          </span>
        </Row>
        <Row label="Blob storage" desc="Azure Blob — Central India">
          <span className="text-xs font-mono text-muted-foreground">encephblob</span>
        </Row>
        <Row label="Container registry">
          <span className="text-xs font-mono text-muted-foreground">enceph.azurecr.io</span>
        </Row>
        <Row label="Resource group">
          <span className="text-xs font-mono text-muted-foreground">enceph-mvp-rg</span>
        </Row>
      </Section>

      {/* DB warning */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          The <code className="font-mono">neurologist</code>, <code className="font-mono">clinic_admin</code>, and <code className="font-mono">ops</code> enum values still exist in the Supabase <code className="font-mono">app_role</code> database type.
          Run a migration to drop them: <code className="font-mono">ALTER TYPE app_role RENAME VALUE 'neurologist' TO...</code> or recreate the enum with only <code className="font-mono">super_admin</code>, <code className="font-mono">management</code>, <code className="font-mono">clinician</code>.
        </p>
      </div>
    </div>
  );
}
