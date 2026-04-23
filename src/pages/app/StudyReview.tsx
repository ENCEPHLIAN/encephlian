import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileSignature } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
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
  const [editedDraft, setEditedDraft] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [signing, setSigning] = useState(false);

  const { data: study, isLoading: studyLoading } = useQuery({
    queryKey: ['study', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('studies')
        .select('*, clinics(name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    }
  });

  const paidTriage = study ? studyTriageIsPaid(study) : false;

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ['ai-draft', id],
    queryFn: async () => {
      // Primary: ai_drafts table (old Lovable pipeline)
      const { data } = await supabase
        .from('ai_drafts')
        .select('*')
        .eq('study_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) return data;

      // Fallback: extract editable text fields from study.ai_draft_json (mind.report.v1)
      const { data: studyData } = await supabase
        .from('studies')
        .select('ai_draft_json')
        .eq('id', id)
        .single();

      const raw = studyData?.ai_draft_json as any;
      if (!raw) return null;

      // Map mind.report.v1 SCORE fields → editable text areas
      const score = raw.score || {};
      const bg = score.background_activity || {};
      const bgText = [
        bg.dominant_rhythm ? `Dominant rhythm: ${bg.dominant_rhythm}` : null,
        bg.amplitude ? `Amplitude: ${bg.amplitude}` : null,
        typeof bg.generalized_slowing === 'object'
          ? (bg.generalized_slowing?.present ? `Generalized slowing: ${bg.generalized_slowing?.grade || 'present'}` : null)
          : (bg.generalized_slowing ? `Generalized slowing: ${bg.generalized_slowing}` : null),
        bg.reactivity !== undefined ? `Reactivity: ${bg.reactivity}` : null,
        bg.symmetry ? `Symmetry: ${bg.symmetry}` : null,
      ].filter(Boolean).join('\n') || score.recording_conditions || '';

      const ieds = score.interictal_findings?.ieds_note || '';
      const ictal = score.ictal_findings?.note || '';
      const abnormalities = [ieds, ictal].filter(Boolean).join('\n');

      return {
        draft: {
          background_activity: bgText,
          sleep_architecture: '',
          abnormalities: abnormalities || '',
          impression: score.impression || '',
          clinical_correlates: score.recommended_action || '',
        }
      };
    },
    enabled: !!study
  });

  const meta = study?.meta as any;
  const tokensAlreadyCharged = study ? triageTokensForSla(study.sla) : 0;

  const currentDraft = editedDraft || draft?.draft;

  const handleSign = async () => {
    if (!paidTriage) {
      toast({
        title: "Triage not started",
        description: "Choose Standard or Priority on the study first — tokens are charged only there.",
        variant: "destructive",
      });
      return;
    }

    setSigning(true);
    try {
      const { data, error } = await supabase.rpc('consume_credit_and_sign', {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_study_id: id,
        p_cost: 0,
        p_content: currentDraft
      });

      if (error) throw error;

      const result = data as any;
      toast({
        title: "Report signed successfully!",
        description: `Wallet unchanged — ${tokensAlreadyCharged} token(s) were already used when triage started.`,
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['study', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-studies'] });

      navigate(`/app/studies/${id}`);
    } catch (error: any) {
      toast({
        title: "Failed to sign report",
        description: error.message,
        variant: "destructive"
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
            <p className="font-medium">Triage has not started yet</p>
            <p className="text-sm text-muted-foreground">
              Select Standard (1 token) or Priority (2 tokens) from the Studies list first. Signing does not
              charge tokens again.
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
            <p className="text-muted-foreground">No analysis available yet.</p>
            <p className="text-sm text-muted-foreground">
              The pipeline may still be processing. Check back in 1–2 minutes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Study
        </Button>
        <Badge variant={study.sla === 'STAT' ? 'destructive' : 'secondary'}>
          {study.sla}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Review & Sign Report</span>
            <span className="text-sm font-normal text-muted-foreground">
              Patient: {meta?.patient_id || 'N/A'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Background Activity</Label>
              <Textarea
                value={currentDraft?.background_activity || ''}
                onChange={(e) => setEditedDraft({ ...currentDraft, background_activity: e.target.value })}
                className="mt-2 min-h-[100px]"
              />
            </div>

            <div>
              <Label className="text-base font-semibold">Sleep Architecture</Label>
              <Textarea
                value={currentDraft?.sleep_architecture || ''}
                onChange={(e) => setEditedDraft({ ...currentDraft, sleep_architecture: e.target.value })}
                className="mt-2 min-h-[80px]"
              />
            </div>

            <div>
              <Label className="text-base font-semibold">Abnormalities</Label>
              <Textarea
                value={currentDraft?.abnormalities || ''}
                onChange={(e) => setEditedDraft({ ...currentDraft, abnormalities: e.target.value })}
                className="mt-2 min-h-[80px]"
              />
            </div>

            <div>
              <Label className="text-base font-semibold">Impression</Label>
              <Textarea
                value={currentDraft?.impression || ''}
                onChange={(e) => setEditedDraft({ ...currentDraft, impression: e.target.value })}
                className="mt-2 min-h-[100px]"
              />
            </div>

            <div>
              <Label className="text-base font-semibold">Clinical Correlates</Label>
              <Textarea
                value={currentDraft?.clinical_correlates || ''}
                onChange={(e) => setEditedDraft({ ...currentDraft, clinical_correlates: e.target.value })}
                className="mt-2 min-h-[80px]"
              />
            </div>
          </div>

          <Card className="bg-muted/50 border-2">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Triage ({study.sla})</span>
                <span className="font-semibold">{tokensAlreadyCharged} token(s) already used</span>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">
                Review and sign is included — no extra payment or token deduction at this step.
              </p>
            </CardContent>
          </Card>

          <Button
            onClick={() => setShowConfirm(true)}
            disabled={signing}
            size="lg"
            className="w-full"
          >
            <FileSignature className="mr-2 h-4 w-4" />
            Sign & Submit Report
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Report Signing</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This action will:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Mark the report as signed (no further token charge)</li>
                <li>Lock the clinical text you edited above</li>
              </ul>
              <p className="font-medium pt-2">Are you sure you want to proceed?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSign} disabled={signing}>
              {signing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                'Sign Report'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
