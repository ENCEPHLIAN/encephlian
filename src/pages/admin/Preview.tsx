import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AppLayout from "@/components/AppLayout";

export default function AdminPreview() {
  const { clinic_id } = useParams();
  const navigate = useNavigate();

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['preview-clinic', clinic_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', clinic_id)
        .single();
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="p-8 space-y-4">
        <Button variant="ghost" onClick={() => navigate('/admin/clinics')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clinics
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Clinic not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          ⚠️ PREVIEW MODE - Viewing as {clinic.brand_name || clinic.name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/clinics')}
          className="text-black hover:text-black hover:bg-yellow-400"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Exit Preview
        </Button>
      </div>
      
      <div className="pt-12">
        <AppLayout />
      </div>
    </div>
  );
}
