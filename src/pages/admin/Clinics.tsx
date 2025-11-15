import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { ClinicForm } from "@/components/admin/ClinicForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function AdminClinics() {
  const [showForm, setShowForm] = useState(false);

  const { data: clinics, isLoading, refetch } = useQuery({
    queryKey: ['admin-clinics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('*, studies(count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold logo-text">Clinics</h1>
          <p className="text-muted-foreground mt-1">Manage clinic accounts and branding</p>
        </div>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Clinic
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Clinic</DialogTitle>
            </DialogHeader>
            <ClinicForm
              onSuccess={() => {
                setShowForm(false);
                refetch();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {clinics && clinics.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No clinics yet</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Clinic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clinics?.map((clinic) => (
            <Card key={clinic.id}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  {clinic.logo_url ? (
                    <img
                      src={clinic.logo_url}
                      alt={clinic.name}
                      className="h-12 w-12 object-contain rounded"
                    />
                  ) : (
                    <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                      <span className="text-lg font-bold text-muted-foreground">
                        {clinic.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{clinic.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {clinic.brand_name || clinic.name}
                    </p>
                  </div>
                </div>

                {clinic.primary_color && (
                  <div className="flex gap-2">
                    <div
                      className="h-6 w-6 rounded border"
                      style={{ backgroundColor: clinic.primary_color }}
                    />
                    {clinic.secondary_color && (
                      <div
                        className="h-6 w-6 rounded border"
                        style={{ backgroundColor: clinic.secondary_color }}
                      />
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    {(clinic.studies as any)?.[0]?.count || 0} studies
                  </span>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/admin/preview/${clinic.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
