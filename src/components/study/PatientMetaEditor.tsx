import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { Pencil, Loader2 } from "lucide-react";

interface PatientMeta {
  patient_name?: string | null;
  patient_id?: string | null;
  patient_age?: string | number | null;
  patient_gender?: string | null;
  patient_sex?: string | null;
  patient_dob?: string | null;
  indication?: string | null;
  [key: string]: unknown;
}

interface Props {
  studyId: string;
  meta: PatientMeta;
  onSaved: (updated: PatientMeta) => void;
  compact?: boolean;
}

function isPlaceholderId(v: string | null | undefined): boolean {
  if (!v) return true;
  return v === "Pending" || v.startsWith("PT-") || v === "X";
}

export function PatientMetaEditor({ studyId, meta, onSaved, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const initialName = isPlaceholderId(meta.patient_name) ? "" : (meta.patient_name ?? "");
  const initialId   = isPlaceholderId(meta.patient_id)   ? "" : (meta.patient_id   ?? "");

  const [form, setForm] = useState({
    patient_name:   initialName,
    patient_id:     initialId,
    patient_age:    String(meta.patient_age    ?? ""),
    patient_gender: meta.patient_gender ?? meta.patient_sex ?? "",
    patient_dob:    meta.patient_dob    ?? "",
    indication:     meta.indication     ?? "",
  });

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated: PatientMeta = {
        ...meta,
        patient_name:   form.patient_name   || null,
        patient_id:     form.patient_id     || null,
        patient_age:    form.patient_age    || null,
        patient_gender: form.patient_gender || null,
        patient_dob:    form.patient_dob    || null,
        indication:     form.indication     || null,
      };
      const { error } = await supabase.from("studies").update({ meta: updated }).eq("id", studyId);
      if (error) throw error;
      toast.success("Patient details saved");
      onSaved(updated);
      setOpen(false);
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-6 w-6" : "h-7 gap-1.5 text-xs"}
        onClick={() => setOpen(true)}
        title="Edit patient details"
      >
        <Pencil className={compact ? "h-3 w-3" : "h-3 w-3"} />
        {!compact && "Edit"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Patient demographics</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pm-name" className="text-xs">Patient name</Label>
                <Input
                  id="pm-name"
                  placeholder="Full name"
                  value={form.patient_name}
                  onChange={field("patient_name")}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-id" className="text-xs">Patient / MRN ID</Label>
                <Input
                  id="pm-id"
                  placeholder="Hospital ID or MRN"
                  value={form.patient_id}
                  onChange={field("patient_id")}
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pm-age" className="text-xs">Age</Label>
                <Input
                  id="pm-age"
                  type="number"
                  min={0}
                  max={120}
                  placeholder="Years"
                  value={form.patient_age}
                  onChange={field("patient_age")}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sex</Label>
                <Select
                  value={form.patient_gender}
                  onValueChange={v => setForm(f => ({ ...f, patient_gender: v }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="X">Other / Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-dob" className="text-xs">Date of birth</Label>
                <Input
                  id="pm-dob"
                  type="date"
                  value={form.patient_dob}
                  onChange={field("patient_dob")}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pm-indication" className="text-xs">Clinical indication</Label>
              <Input
                id="pm-indication"
                placeholder="e.g. Routine EEG — r/o epilepsy"
                value={form.indication}
                onChange={field("indication")}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
