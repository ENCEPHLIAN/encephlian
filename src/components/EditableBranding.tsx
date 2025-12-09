import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png"; // favicon_encephlian.png or your main glyph

interface EditableBrandingProps {
  companyName: string;
  logoUrl?: string;
  // Controls the invisible square that the glyph fits into
  logoClassName?: string;
}

export default function EditableBranding({
  companyName,
  logoUrl,
  // Big by default so it visually matches the ENCEPHLIAN text height
  logoClassName = "h-14 w-14 md:h-16 md:w-16",
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
      {/* Invisible square; glyph fills this and stays perfectly centered */}
      <div
        className={`
          relative flex-shrink-0
          ${logoClassName}
          flex items-center justify-center
        `}
      >
        {/* Subtle halo / gradient around the glyph – shows on hover, works on light & dark */}
        <div
          className="
            absolute inset-0
            rounded-2xl
            bg-radial from-zinc-300/0 via-zinc-400/18 to-zinc-900/0
            dark:from-zinc-100/0 dark:via-zinc-500/28 dark:to-zinc-900/0
            opacity-0 group-hover:opacity-100
            transition-opacity duration-300 ease-out
          "
        />

        {/* Actual logo – big, tight, high contrast, with silver “breathing” effect */}
        <img
          src={glyphSrc}
          alt="Logo"
          className="
            relative
            h-[92%] w-[92%]
            object-contain
            transition-transform duration-300 ease-out
            group-hover:scale-[1.04]
            [filter:drop-shadow(0_0_8px_rgba(0,0,0,0.45))]
            dark:[filter:drop-shadow(0_0_14px_rgba(0,0,0,0.85))]
            group-hover:[filter:brightness(1.08)_drop-shadow(0_0_14px_rgba(0,0,0,0.9))]
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
