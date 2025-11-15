import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileText, PlayCircle, Coins, Search } from "lucide-react";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: studies } = useQuery({
    queryKey: ["command-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search studies, patients..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Studies">
          {studies?.map((study) => {
            const meta = study.meta as any;
            const patientId = meta?.patient_id || 'Unknown';
            const patientName = meta?.patient_name || '';
            
            return (
              <CommandItem
                key={study.id}
                onSelect={() => {
                  navigate(`/app/studies/${study.id}`);
                  setOpen(false);
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                <span>{patientId} - {patientName}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => {
              navigate("/app/studies");
              setOpen(false);
            }}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>Browse all studies</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate("/app/wallet");
              setOpen(false);
            }}
          >
            <Coins className="mr-2 h-4 w-4" />
            <span>Buy tokens</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
