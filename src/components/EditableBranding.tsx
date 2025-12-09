import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

interface EditableBrandingProps {
  companyName: string;
  logoUrl?: string;
  // This now controls the outer “invisible square” that the glyph sits in
  logoClassName?: string;
}

export default function EditableBranding({
  companyName,
  logoUrl,
  logoClassName = "h-12 w-12 md:h-14 md:w-14",
}: EditableBrandingProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(companyName);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("profiles").update({ company_name: newName }).eq("id", user.id);

      if (error) throw error;
      return newName;
    },
    onSuccess: () => {
      toast.success("Company name updated");
      queryClient.invalidateQueries({ queryKey: ["clinic-context"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setEditing(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update");
      setValue(companyName);
    },
  });

  const handleSave = () => {
    if (value.trim() && value !== companyName) {
      updateMutation.mutate(value.trim());
    } else {
      setEditing(false);
      setValue(companyName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setValue(companyName);
    }
  };

  const glyphSrc = logoUrl || logo;

  return (
    <div className="flex items-center gap-2 md:gap-3 group select-none">
      {/* Invisible square; glyph is centered and fills it */}
      <div
        className={`
          relative flex-shrink-0
          ${logoClassName}
          flex items-center justify-center
        `}
      >
        {/* Gradient painted *through* the transparent logo */}
        <div
          className="
            h-[82%] w-[82%]
            transition-all duration-300 ease-out
            bg-gradient-to-br
            from-zinc-200 via-zinc-500 to-zinc-800
            group-hover:from-zinc-100 group-hover:via-zinc-400 group-hover:to-zinc-900
          "
          style={{
            WebkitMaskImage: `url(${glyphSrc})`,
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            WebkitMaskSize: "contain",
            maskImage: `url(${glyphSrc})`,
            maskRepeat: "no-repeat",
            maskPosition: "center",
            maskSize: "contain",
          }}
        />
      </div>

      {editing ? (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="text-2xl font-bold logo-text h-auto py-1 px-2 border-primary"
          disabled={updateMutation.isPending}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="cursor-pointer flex items-center gap-2 hover:opacity-95 transition-opacity"
        >
          <h1 className="text-2xl md:text-3xl font-bold logo-text whitespace-nowrap">{companyName}</h1>
          <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
