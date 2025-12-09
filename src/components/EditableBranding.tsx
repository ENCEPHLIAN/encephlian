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
  // Controls the invisible square box for the glyph
  logoClassName?: string;
}

export default function EditableBranding({
  companyName,
  logoUrl,
  // BIG by default – this will make it taller than the ENCEPHLIAN text
  logoClassName = "h-20 w-20 md:h-24 md:w-24",
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
    <div className="flex items-center gap-3 md:gap-4 group select-none">
      {/* Huge invisible square; glyph fills this and becomes visually dominant */}
      <div
        className={`
          relative flex-shrink-0
          ${logoClassName}
          flex items-center justify-center
        `}
      >
        {/* Hover halo / subtle silver glow */}
        <div
          className="
            absolute inset-0
            rounded-3xl
            bg-radial from-zinc-200/0 via-zinc-400/20 to-zinc-900/0
            dark:from-zinc-100/0 dark:via-zinc-500/30 dark:to-zinc-900/0
            opacity-0 group-hover:opacity-100
            transition-opacity duration-300 ease-out
          "
        />

        <img
          src={glyphSrc}
          alt="Logo"
          className="
            relative
            h-[96%] w-[96%]   /* almost edge-to-edge: tall, aggressive */
            object-contain
            transition-transform duration-300 ease-out
            group-hover:scale-[1.03]
            [filter:drop-shadow(0_0_10px_rgba(0,0,0,0.6))]
            dark:[filter:drop-shadow(0_0_16px_rgba(0,0,0,0.95))]
            group-hover:[filter:brightness(1.08)_drop-shadow(0_0_18px_rgba(0,0,0,1))]
          "
        />
      </div>

      {editing ? (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="text-2xl md:text-3xl font-bold logo-text h-auto py-1 px-2 border-primary"
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
