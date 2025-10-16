import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";

interface ClinicFormProps {
  onSuccess: () => void;
}

export function ClinicForm({ onSuccess }: ClinicFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0ea5e9");
  const [secondaryColor, setSecondaryColor] = useState("#f59e0b");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Clinic name is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      let logoUrl = null;

      // Upload logo if provided
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('clinic-logos')
          .upload(fileName, logoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('clinic-logos')
          .getPublicUrl(fileName);

        logoUrl = publicUrl;
      }

      // Create clinic
      const { error: insertError } = await supabase
        .from('clinics')
        .insert({
          name: name.trim(),
          brand_name: brandName.trim() || name.trim(),
          logo_url: logoUrl,
          primary_color: primaryColor,
          secondary_color: secondaryColor
        });

      if (insertError) throw insertError;

      toast({
        title: "Clinic created",
        description: "The clinic has been created successfully."
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: "Failed to create clinic",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Clinic Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Apollo Neurology Clinic"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="brandName">Brand Name (optional)</Label>
        <Input
          id="brandName"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="Apollo EEG Portal"
        />
        <p className="text-xs text-muted-foreground">
          Displayed in the portal header. Defaults to clinic name.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo">Logo (optional)</Label>
        <Input
          id="logo"
          type="file"
          accept="image/*"
          onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
        />
        <p className="text-xs text-muted-foreground">
          Upload a square logo (PNG, JPG, SVG)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="primaryColor">Primary Color</Label>
          <div className="flex gap-2">
            <Input
              id="primaryColor"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-16 h-10 p-1"
            />
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#0ea5e9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="secondaryColor">Secondary Color</Label>
          <div className="flex gap-2">
            <Input
              id="secondaryColor"
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-16 h-10 p-1"
            />
            <Input
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              placeholder="#f59e0b"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Create Clinic
          </>
        )}
      </Button>
    </form>
  );
}
