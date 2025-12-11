import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileSignature, Coins } from "lucide-react";
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

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ['ai-draft', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_drafts')
        .select('*')
        .eq('study_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!study
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('tokens').single();
      return data;
    }
  });

  const meta = study?.meta as any;
  const tokenCost = study?.sla === 'STAT' ? 2 : 1;
  const costInr = tokenCost * 200;

  const currentDraft = editedDraft || draft?.draft;

  const handleSign = async () => {
    if (!wallet || wallet.tokens < tokenCost) {
      toast({
        title: "Insufficient tokens",
        description: `You need ${tokenCost} tokens to sign this report. Please purchase more tokens.`,
        variant: "destructive"
      });
      return;
    }

    setSigning(true);
    try {
      const { data, error } = await supabase.rpc('consume_credit_and_sign', {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_study_id: id,
        p_cost: tokenCost,
        p_content: currentDraft
      });

      if (error) throw error;

      const result = data as any;
      toast({
        title: "Report signed successfully!",
        description: `${result.tokens_remaining} tokens remaining.`
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
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

  if (!study || !draft) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">AI draft not available for this study.</p>
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
                <span className="text-sm text-muted-foreground">Token Cost ({study.sla}):</span>
                <span className="font-semibold">{tokenCost} tokens (₹{costInr})</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">Your Wallet Balance:</span>
                <span className="font-semibold flex items-center gap-1">
                  <Coins className="h-4 w-4" />
                  {wallet?.tokens || 0} tokens
                </span>
              </div>
              {wallet && wallet.tokens < tokenCost && (
                <p className="text-sm text-destructive">
                  ⚠️ Insufficient tokens. Please purchase more tokens.
                </p>
              )}
            </CardContent>
          </Card>

          <Button
            onClick={() => setShowConfirm(true)}
            disabled={signing || (wallet && wallet.tokens < tokenCost)}
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
                <li>Deduct {tokenCost} tokens (₹{costInr}) from your wallet</li>
                <li>Mark the report as signed and complete</li>
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
