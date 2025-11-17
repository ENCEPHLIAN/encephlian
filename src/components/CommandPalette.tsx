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
import dayjs from "dayjs";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CommandPalette({ open: externalOpen, onOpenChange: externalOnOpenChange }: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();

  // Use external state if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const { data: studies } = useQuery({
    queryKey: ["command-studies", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) {
        // Show recent studies when no search query
        const { data, error } = await supabase
          .from("studies")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);
        
        if (error) throw error;
        return data;
      }

      // Search by patient name, ID, or age
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .or(`meta->>patient_name.ilike.%${searchQuery}%,meta->>patient_id.ilike.%${searchQuery}%,meta->>patient_age.ilike.%${searchQuery}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  const { data: storageFiles } = useQuery({
    queryKey: ["command-files", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      
      const results: any[] = [];
      const buckets = ['eeg-studies', 'reports'];
      
      for (const bucket of buckets) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list('', { limit: 100 });
        
        if (data) {
          const filtered = data.filter((file: any) => 
            file.name.toLowerCase().includes(searchQuery.toLowerCase())
          );
          results.push(...filtered.map(f => ({ ...f, bucket })));
        }
      }
      return results;
    },
    enabled: open && searchQuery.length >= 2
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
      <CommandInput 
        placeholder="Search studies, patients..." 
        onValueChange={setSearchQuery}
      />
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

        <CommandGroup heading={searchQuery ? "Search Results" : "Recent Studies"}>
          {studies?.map((study) => {
            const meta = study.meta as any;
            const patientId = meta?.patient_id || 'Unknown';
            const patientName = meta?.patient_name || '';
            const patientAge = meta?.patient_age || '';
            
            return (
              <CommandItem
                key={study.id}
                onSelect={() => {
                  navigate(`/app/studies/${study.id}`);
                  setOpen(false);
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">
                    {patientId} - {patientName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Age: {patientAge} • {dayjs(study.created_at).format('MMM D, YYYY')}
                  </div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {searchQuery && storageFiles && storageFiles.length > 0 && (
          <CommandGroup heading="Files">
            {storageFiles.map((file: any) => (
              <CommandItem
                key={`${file.bucket}-${file.name}`}
                onSelect={async () => {
                  const { data } = await supabase.storage
                    .from(file.bucket)
                    .download(file.name);
                  
                  if (data) {
                    const url = URL.createObjectURL(data);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                  setOpen(false);
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {file.bucket} • {((file.metadata?.size || 0) / 1024).toFixed(1)} KB
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        
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
