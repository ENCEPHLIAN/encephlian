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
import { FileText, Coins, Search, LayoutDashboard, Activity, FolderOpen, StickyNote, Settings, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CommandPalette({ open: externalOpen, onOpenChange: externalOnOpenChange }: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();

  // Use external state if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

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
      <CommandInput placeholder="Search studies, patients, navigate..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => { navigate("/app/dashboard"); setOpen(false); }}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => { navigate("/app/studies"); setOpen(false); }}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Studies</span>
          </CommandItem>
          <CommandItem onSelect={() => { navigate("/app/viewer"); setOpen(false); }}>
            <Activity className="mr-2 h-4 w-4" />
            <span>EEG Viewer</span>
          </CommandItem>
          <CommandItem onSelect={() => { navigate("/app/notes"); setOpen(false); }}>
            <StickyNote className="mr-2 h-4 w-4" />
            <span>Notes</span>
          </CommandItem>
          <CommandItem onSelect={() => { navigate("/app/files"); setOpen(false); }}>
            <FolderOpen className="mr-2 h-4 w-4" />
            <span>Files</span>
          </CommandItem>
          <CommandItem onSelect={() => { navigate("/app/wallet"); setOpen(false); }}>
            <Coins className="mr-2 h-4 w-4" />
            <span>Wallet</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Recent Studies">
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
        
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => { navigate("/app/settings"); setOpen(false); }}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); setOpen(false); }}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            <span>Toggle theme</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
