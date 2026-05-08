import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileSignature, PenLine, ShieldCheck, Brain, Waves } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { studyTriageIsPaid, triageTokensForSla } from "@/shared/tokenEconomy";

export default function StudyReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rtRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [editedDraft, setEditedDraft] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [signing, setSigning] = useState(false);

  const { data: study, isLoading: studyLoading } = useQuery({
    queryKey: ["study", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*, clinics(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const row = q.state.data as { triage_status?: string } | undefined;
      if (row?.triage_status === "processing") return 3_000;
      return false;
    },
  });

  const paidTriage = study ? studyTriageIsPaid(study) : false;

  useEffect(() => {
    if (!id || rtRef.current) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`study-review-rt-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studies", filter: `id=eq.${id}` },
        () => {
          if (t) clearTimeout(t);
          t = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: ["study", id] });
            void queryClient.invalidateQueries({ queryKey: ["ai-draft", id] });
          }, 100);
        },
      )
      .subscribe();
    rtRef.current = ch;
    return () => {
      if (t) clearTimeout(t);
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
    };
  }, [id, queryClient]);

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ["ai-draft", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_drafts")
        .select("*")
        .eq("study_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) return data;

      const { data: studyData } = await supabase.from("studies").select("ai_draft_json").eq("id", id).single();

      const raw = studyData?.ai_draft_json as any;
      if (!raw) return null;

      const score = raw.score || {};
      const bg = score.background_activity || {};
      const bgText = [
        bg.dominant_rhythm ? `Dominant rhythm: ${bg.dominant_rhythm}` : null,
        bg.amplitude ? `Amplitude: ${bg.amplitude}` : null,
        typeof bg.generalized_slowing === "object"
          ? bg.generalized_slowing?.present
            ? `Generalized slowing: ${bg.generalized_slowing?.grade || "present"}`
            : null
          : bg.generalized_slowing
            ? `Generalized slowing: ${bg.generalized_slowing}`
            : null,
        bg.reactivity !== undefined ? `Reactivity: ${bg.reactivity}` : null,
        bg.symmetry ? `Symmetry: ${bg.symmetry}` : null,
      ]
        .filter(Boolean)
        .join("\n") || score.recording_conditions || "";

      const ieds = score.interictal_findings?.ieds_note || "";
      const ictal = score.ictal_findings?.note || "";
      const abnormalities = [ieds, ictal].filter(Boolean).join("\n");

      return {
        draft: {
          background_activity: bgText,
          sleep_architecture: "",
          abnormalities: abnormalities || "",
          impression: score.impression || "",
          clinical_correlates: score.recommended_action || "",
        },
      };
    },
    enabled: !!study,
    refetchInterval: (q) => {
      const row = queryClient.getQueryData(["study", id]) as { triage_status?: string } | undefined;
      if (row?.triage_status === "processing" && !q.state.data) return 4_000;
      return false;
    },
  });

  const meta = study?.meta as any;
  const tokensAlreadyCharged = study ? triageTokensForSla(study.sla) : 0;

  const currentDraft = editedDraft || draft?.draft;

  const invalidateStudyCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["study", id] });
    queryClient.invalidateQueries({ queryKey: ["study-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] });
    queryClient.invalidateQueries({ queryKey: ["pilot-studies"] });
    queryClient.invalidateQueries({ queryKey: ["ai-draft", id] });
  };

  const handleSign = async () => {
    if (!paidTriage) {
      toast({
        title: "Triage not started",
        description: "Choose Standard or Priority on this study first — tokens apply only at that step.",
        variant: "destructive",
      });
      return;
    }

    setSigning(true);
    try {
      const { data, error } = await supabase.rpc("consume_credit_and_sign", {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_study_id: id,
        p_cost: 0,
        p_content: currentDraft,
      });

      if (error) throw error;

      void data;
      toast({
        title: "Report signed",
        description:
          tokensAlreadyCharged > 0
            ? `No further token charge — ${tokensAlreadyCharged} token(s) were already used when triage started.`
            : "Report is finalized.",
      });

      invalidateStudyCaches();
      navigate(`/app/studies/${id}`);
    } catch (error: any) {
      toast({
        title: "Could not sign report",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSigning(false);
      setShowConfirm(false);
    }
  };

  if (studyLoading || draftLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!study) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (study.state === "awaiting_sla" || !paidTriage) {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <Button variant="ghost" onClick={() => navigate(`/app/studies/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to study
        </Button>
        <Card>
          <CardContent className="p-8 space-y-2">
            <p className="font-medium">Start triage first</p>
            <p className="text-sm text-muted-foreground">
              On Studies, choose Standard (1 token) or Priority (2). Signing never charges tokens again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-muted-foreground">No draft report yet</p>
            <p className="text-sm text-muted-foreground">
              Analysis may still be running — this page updates automatically when the draft is ready.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" className="w-fit -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to study
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"}>{study.sla}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tokensAlreadyCharged} token(s) used for triage
          </span>
        </div>
      </div>

      {/* ── AI triage summary bar ── */}
      {meta?.triage_result && (
        <Card className="border-border/60">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-foreground">AI triage</span>
              </div>
              <Badge variant={meta.triage_result === "abnormal" ? "destructive" : "secondary"} className="capitalize">
                {meta.triage_result}
              </Badge>
              {meta?.triage_confidence != null && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {Math.round(meta.triage_confidence * 100)}% confidence
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 text-xs"
                onClick={() => navigate(`/app/studies/${study.id}/viewer`)}
              >
                <Waves className="h-3.5 w-3.5" />
                Open in viewer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="space-y-1 pb-4 border-b bg-muted/30">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
              <PenLine className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg sm:text-xl leading-tight">IFCN SCORE report</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Edit the AI draft below, then sign once you agree. Patient:{" "}
                <span className="font-medium text-foreground">{meta?.patient_id || "—"}</span>
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-0 pt-0">

          {/* ── Section 1: Background activity ── */}
          <div className="py-5 space-y-2">
            <div>
              <Label className="text-sm font-semibold">Background activity</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dominant rhythm, amplitude, symmetry, reactivity, generalized slowing.
              </p>
            </div>
            <Textarea
              value={currentDraft?.background_activity || ""}
              onChange={(e) => setEditedDraft({ ...currentDraft, background_activity: e.target.value })}
              className="min-h-[100px] text-sm"
              placeholder="e.g. Posterior dominant rhythm at 9–10 Hz, amplitude 40–60 µV, symmetric and reactive to eye opening. No generalized slowing."
            />
          </div>

          <Separator />

          {/* ── Section 2: Sleep architecture ── */}
          <div className="py-5 space-y-2">
            <div>
              <Label className="text-sm font-semibold">Sleep architecture</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sleep stages observed, vertex waves, sleep spindles, K-complexes. Leave blank if wake-only.
              </p>
            </div>
            <Textarea
              value={currentDraft?.sleep_architecture || ""}
              onChange={(e) => setEditedDraft({ ...currentDraft, sleep_architecture: e.target.value })}
              className="min-h-[72px] text-sm"
              placeholder="e.g. Stage 1–2 NREM with vertex waves and sleep spindles. No REM captured."
            />
          </div>

          <Separator />

          {/* ── Section 3: Abnormalities (IEDs + ictal) ── */}
          <div className="py-5 space-y-2">
            <div>
              <Label className="text-sm font-semibold">Abnormalities</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Interictal epileptiform discharges (IEDs), ictal patterns, focal slowing, PLEDS/BIPEDS.
              </p>
            </div>
            <Textarea
              value={currentDraft?.abnormalities || ""}
              onChange={(e) => setEditedDraft({ ...currentDraft, abnormalities: e.target.value })}
              className="min-h-[90px] text-sm"
              placeholder="e.g. Occasional left temporal sharp waves (T3 max). No clear ictal pattern recorded."
            />
          </div>

          <Separator />

          {/* ── Section 4: Impression ── */}
          <div className="py-5 space-y-2">
            <div>
              <Label className="text-sm font-semibold">Impression</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Overall interpretation: normal / mildly / moderately / markedly abnormal, and clinical significance.
              </p>
            </div>
            <Textarea
              value={currentDraft?.impression || ""}
              onChange={(e) => setEditedDraft({ ...currentDraft, impression: e.target.value })}
              className="min-h-[100px] text-sm"
              placeholder="e.g. Mildly abnormal EEG with left temporal epileptiform activity. Correlation with clinical history is recommended."
            />
          </div>

          <Separator />

          {/* ── Section 5: Clinical correlates ── */}
          <div className="py-5 space-y-2">
            <div>
              <Label className="text-sm font-semibold">Clinical correlates / follow-up</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recommended action: further imaging, repeat EEG, referral, medication review.
              </p>
            </div>
            <Textarea
              value={currentDraft?.clinical_correlates || ""}
              onChange={(e) => setEditedDraft({ ...currentDraft, clinical_correlates: e.target.value })}
              className="min-h-[80px] text-sm"
              placeholder="e.g. Recommend MRI brain with hippocampal protocol. Neurology follow-up advised."
            />
          </div>

        </CardContent>

        <CardContent className="pt-4 pb-5 border-t space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Signing is free.</span> Tokens were only charged when
                you started triage ({study.sla}). This step locks the report text.
              </p>
            </div>
          </div>

          <Button onClick={() => setShowConfirm(true)} disabled={signing} size="lg" className="w-full sm:w-auto gap-2">
            <FileSignature className="h-4 w-4" />
            Sign final report
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign this report?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This locks the clinical wording you edited and marks the report as signed. You cannot undo signing.</p>
                <ul className="list-none space-y-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <li className="flex gap-2">
                    <span className="text-emerald-600 font-medium shrink-0">✓</span>
                    No extra tokens — triage charge already applied
                  </li>
                  <li className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">•</span>
                    PDF and sharing follow your clinic workflow
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={signing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSign} disabled={signing} className="gap-2">
              {signing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing…
                </>
              ) : (
                "Yes, sign report"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
