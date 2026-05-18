import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Loader2, FileText, Upload, Download, Trash2, ShieldCheck,
  ShieldAlert, Plus, Check, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type DocType =
  | "letter_of_intent" | "memorandum_of_understanding" | "master_service_agreement"
  | "consent_form_template" | "data_processing_agreement" | "business_associate_agreement"
  | "kyc_pan" | "kyc_gst" | "kyc_incorporation" | "kyc_other";

type DocStatus =
  | "draft" | "sent" | "viewed" | "signed" | "countersigned"
  | "active" | "expired" | "revoked" | "rejected";

const DOC_TYPE_LABEL: Record<DocType, string> = {
  letter_of_intent: "Letter of Intent",
  memorandum_of_understanding: "Memorandum of Understanding",
  master_service_agreement: "Master Service Agreement",
  consent_form_template: "Consent Form (template)",
  data_processing_agreement: "Data Processing Agreement",
  business_associate_agreement: "Business Associate Agreement",
  kyc_pan: "KYC — PAN",
  kyc_gst: "KYC — GST",
  kyc_incorporation: "KYC — Incorporation Certificate",
  kyc_other: "KYC — Other",
};

const STATUS_STYLE: Record<DocStatus, string> = {
  draft:         "bg-muted text-muted-foreground",
  sent:          "bg-blue-500/10 text-blue-500",
  viewed:        "bg-violet-500/10 text-violet-500",
  signed:        "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  countersigned: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  active:        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expired:       "bg-red-500/10 text-red-500",
  revoked:       "bg-red-500/10 text-red-500",
  rejected:      "bg-red-500/10 text-red-500",
};

type ClinicRow = { id: string; name: string };

type DocRow = {
  id: string;
  clinic_id: string;
  doc_type: DocType;
  status: DocStatus;
  version: number;
  file_path: string | null;
  file_sha256: string | null;
  file_size_bytes: number | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_role: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ActivationRow = {
  clinic_id: string;
  clinic_name: string;
  loi_active: boolean;
  mou_active: boolean;
  msa_active: boolean;
  consent_template_active: boolean;
  dpa_active: boolean;
  activation_complete: boolean;
  active_doc_count: number;
  total_doc_count: number;
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY_UPLOAD = {
  doc_type: "" as DocType | "",
  file: null as File | null,
  signed_by_name: "",
  signed_by_role: "",
  effective_date: "",
  expiry_date: "",
  notes: "",
  initial_status: "draft" as DocStatus,
};

export default function AdminClinicDocuments() {
  const queryClient = useQueryClient();
  const [selectedClinic, setSelectedClinic] = useState<string>("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ ...EMPTY_UPLOAD });
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const { data: clinics } = useQuery<ClinicRow[]>({
    queryKey: ["admin-clinics-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_clinics_for_dropdown");
      if (error) throw error;
      return (data as ClinicRow[]) ?? [];
    },
  });

  const { data: activation } = useQuery<ActivationRow[]>({
    queryKey: ["clinic-activation-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_activation_status")
        .select("*")
        .order("clinic_name");
      if (error) throw error;
      return (data as ActivationRow[]) ?? [];
    },
  });

  const { data: docs, isLoading: docsLoading } = useQuery<DocRow[]>({
    queryKey: ["clinic-documents", selectedClinic],
    enabled: !!selectedClinic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_documents")
        .select("*")
        .eq("clinic_id", selectedClinic)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as DocRow[]) ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (form: typeof uploadForm) => {
      if (!selectedClinic || !form.file || !form.doc_type) {
        throw new Error("Pick a clinic, document type, and a file");
      }
      const docId = crypto.randomUUID();
      const path = `${selectedClinic}/${docId}/v1.${form.file.name.split(".").pop() ?? "pdf"}`;

      // 1. Upload to storage
      const { error: upErr } = await supabase.storage
        .from("clinic-documents")
        .upload(path, form.file, {
          contentType: form.file.type || "application/pdf",
          upsert: false,
        });
      if (upErr) throw upErr;

      // 2. Compute SHA-256
      const sha = await sha256Hex(form.file);

      // 3. Insert document row
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error: insertErr } = await supabase
        .from("clinic_documents")
        .insert({
          id: docId,
          clinic_id: selectedClinic,
          doc_type: form.doc_type as DocType,
          status: form.initial_status,
          version: 1,
          file_path: path,
          file_sha256: sha,
          file_size_bytes: form.file.size,
          file_mime: form.file.type || "application/pdf",
          signed_by_name: form.signed_by_name || null,
          signed_by_role: form.signed_by_role || null,
          signed_at: form.initial_status === "signed" || form.initial_status === "active"
            ? new Date().toISOString() : null,
          effective_date: form.effective_date || null,
          expiry_date: form.expiry_date || null,
          notes: form.notes || null,
          created_by: user?.id ?? null,
          signature_method: "manual_upload",
        })
        .select()
        .single();

      if (insertErr) {
        // Roll back the storage upload so we don't orphan a file
        await supabase.storage.from("clinic-documents").remove([path]);
        throw insertErr;
      }
      return inserted as DocRow;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["clinic-documents", selectedClinic] });
      queryClient.invalidateQueries({ queryKey: ["clinic-activation-status"] });
      toast.success(`Uploaded ${DOC_TYPE_LABEL[doc.doc_type]}`, {
        description: `${doc.status} · sha ${doc.file_sha256?.slice(0, 8)}`,
      });
      setUploadOpen(false);
      setUploadForm({ ...EMPTY_UPLOAD });
    },
    onError: (e: any) => toast.error(`Upload failed: ${e.message}`),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DocStatus }) => {
      setBusyRowId(id);
      const patch: Partial<DocRow> = { status };
      if (status === "signed" || status === "active") {
        patch.signed_at = patch.signed_at ?? new Date().toISOString();
      }
      const { error } = await supabase
        .from("clinic_documents")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-documents", selectedClinic] });
      queryClient.invalidateQueries({ queryKey: ["clinic-activation-status"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(`Status update failed: ${e.message}`),
    onSettled: () => setBusyRowId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: DocRow) => {
      // Try to remove the file (best effort); the row delete cascades via FK.
      if (doc.file_path) {
        await supabase.storage.from("clinic-documents").remove([doc.file_path]);
      }
      const { error } = await supabase.from("clinic_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-documents", selectedClinic] });
      queryClient.invalidateQueries({ queryKey: ["clinic-activation-status"] });
      toast.success("Document deleted");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(`Delete failed: ${e.message}`),
  });

  const handleDownload = async (doc: DocRow) => {
    if (!doc.file_path) return;
    const { data, error } = await supabase.storage
      .from("clinic-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error) {
      toast.error(`Could not generate download link: ${error.message}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const selectedActivation = useMemo(
    () => activation?.find((a) => a.clinic_id === selectedClinic),
    [activation, selectedClinic],
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Clinic documents</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Letters of intent, MoUs, MSAs, consent templates, DPAs, KYC. Manual upload for now.
        </p>
      </div>

      {/* Activation snapshot — small grid showing which clinics are paperwork-ready */}
      {activation && activation.length > 0 && (
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium">Activation status</p>
            <p className="text-xs text-muted-foreground">
              {activation.filter((a) => a.activation_complete).length} of {activation.length} clinics ready
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {activation.map((a) => (
              <button
                key={a.clinic_id}
                onClick={() => setSelectedClinic(a.clinic_id)}
                className={cn(
                  "text-left rounded-md border px-3 py-2 transition-colors",
                  selectedClinic === a.clinic_id ? "border-primary bg-primary/5" : "border-border/60 hover:bg-accent/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{a.clinic_name}</p>
                  {a.activation_complete ? (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500">
                      ready
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-600">
                      pending
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  <span className={a.loi_active ? "text-emerald-500" : ""}>LoI</span>
                  <span>·</span>
                  <span className={a.mou_active ? "text-emerald-500" : ""}>MoU</span>
                  <span>·</span>
                  <span className={a.consent_template_active ? "text-emerald-500" : ""}>Consent</span>
                  <span>·</span>
                  <span className={a.dpa_active ? "text-emerald-500" : ""}>DPA</span>
                  <span className="ml-auto opacity-70">{a.active_doc_count}/{a.total_doc_count}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={selectedClinic} onValueChange={setSelectedClinic}>
          <SelectTrigger className="w-72 h-8 text-sm">
            <SelectValue placeholder="Pick a clinic…" />
          </SelectTrigger>
          <SelectContent>
            {clinics?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" disabled={!selectedClinic} onClick={() => setUploadOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Upload document
        </Button>
      </div>

      {!selectedClinic ? (
        <div className="rounded-lg border border-border/60 p-8 text-center text-sm text-muted-foreground">
          Pick a clinic above to manage its documents.
        </div>
      ) : docsLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !docs || docs.length === 0 ? (
        <div className="rounded-lg border border-border/60 p-8 text-center text-sm text-muted-foreground">
          No documents yet for this clinic.
          {selectedActivation && !selectedActivation.activation_complete && (
            <p className="mt-2 text-xs flex items-center justify-center gap-1.5 text-amber-600">
              <AlertCircle className="h-3 w-3" />
              LoI + MoU + Consent template required for activation.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Document</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Signed</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Expires</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Hash</th>
                <th className="px-4 py-2.5 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-accent/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-none">{DOC_TYPE_LABEL[doc.doc_type]}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          v{doc.version}
                          {doc.file_size_bytes ? ` · ${(doc.file_size_bytes / 1024).toFixed(0)} KB` : ""}
                          {doc.signed_by_name ? ` · ${doc.signed_by_name}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={doc.status}
                      onValueChange={(v) => statusMutation.mutate({ id: doc.id, status: v as DocStatus })}
                      disabled={busyRowId === doc.id}
                    >
                      <SelectTrigger className="h-6 w-32 text-[11px] gap-1">
                        <Badge variant="secondary" className={cn("text-[10px] h-4 px-1.5 capitalize", STATUS_STYLE[doc.status])}>
                          {doc.status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {(["draft","sent","viewed","signed","countersigned","active","expired","revoked","rejected"] as DocStatus[]).map((s) => (
                          <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {doc.signed_at ? format(new Date(doc.signed_at), "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {doc.expiry_date ? format(new Date(doc.expiry_date), "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                    {doc.file_sha256?.slice(0, 8) || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={!doc.file_path}
                        onClick={() => handleDownload(doc)}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(doc)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Upload Dialog ───────────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              SHA-256 hash is computed on the client. The document and status changes
              are recorded in audit_logs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Document type *</Label>
              <Select
                value={uploadForm.doc_type}
                onValueChange={(v) => setUploadForm((f) => ({ ...f, doc_type: v as DocType }))}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Pick a type…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{DOC_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">PDF / PNG / JPEG *</Label>
              <Input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setUploadForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
                className="mt-1 h-8 text-xs file:text-xs"
              />
              {uploadForm.file && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {uploadForm.file.name} · {(uploadForm.file.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Initial status</Label>
              <Select
                value={uploadForm.initial_status}
                onValueChange={(v) => setUploadForm((f) => ({ ...f, initial_status: v as DocStatus }))}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft" className="text-xs">draft (internal)</SelectItem>
                  <SelectItem value="sent" className="text-xs">sent (to clinic)</SelectItem>
                  <SelectItem value="signed" className="text-xs">signed (counterparty already signed)</SelectItem>
                  <SelectItem value="active" className="text-xs">active (in force)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Signed by (name)</Label>
                <Input
                  value={uploadForm.signed_by_name}
                  onChange={(e) => setUploadForm((f) => ({ ...f, signed_by_name: e.target.value }))}
                  placeholder="Dr. Priya Sharma"
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Signed by (role)</Label>
                <Input
                  value={uploadForm.signed_by_role}
                  onChange={(e) => setUploadForm((f) => ({ ...f, signed_by_role: e.target.value }))}
                  placeholder="Medical Director"
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Effective date</Label>
                <Input
                  type="date"
                  value={uploadForm.effective_date}
                  onChange={(e) => setUploadForm((f) => ({ ...f, effective_date: e.target.value }))}
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Expires</Label>
                <Input
                  type="date"
                  value={uploadForm.expiry_date}
                  onChange={(e) => setUploadForm((f) => ({ ...f, expiry_date: e.target.value }))}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={uploadForm.notes}
                onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal context for this document…"
                className="mt-1 text-xs min-h-[60px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!uploadForm.doc_type || !uploadForm.file || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate(uploadForm)}
            >
              {uploadMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Alert ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <code className="font-mono text-xs">
                    {DOC_TYPE_LABEL[deleteTarget.doc_type]} v{deleteTarget.version}
                  </code>{" "}
                  will be permanently removed from storage and the database. This action
                  is recorded in audit_logs.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
