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
  logoClassName?: string;
}

export default function EditableBranding({
  companyName,
  logoUrl,
  logoClassName = "h-7 w-7 md:h-8 md:w-8",
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

  return (
    <div className="flex items-center gap-2 md:gap-3 group select-none">
      {/* Fixed, symmetric logo square anchored by the parent layout */}
      <div
        className="
          relative flex-shrink-0
          h-10 w-10 md:h-11 md:w-11
          rounded-xl
          bg-gradient-to-br from-zinc-600/40 via-zinc-400/10 to-zinc-900/40
          group-hover:from-zinc-300/70 group-hover:via-zinc-500/30 group-hover:to-zinc-900/80
          transition-all duration-300 ease-out
          shadow-sm group-hover:shadow-md
        "
      >
        {/* Inner plate so the logo itself stays clean while the frame animates */}
        <div className="absolute inset-[2px] rounded-[0.9rem] bg-background/90 backdrop-blur-sm" />

        <div className="relative flex h-full w-full items-center justify-center">
          <img src={logoUrl || logo} alt="Logo" className={`${logoClassName} object-contain`} />
        </div>
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
          className="cursor-pointer flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <h1 className="text-2xl md:text-3xl font-bold logo-text whitespace-nowrap">{companyName}</h1>
          <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
