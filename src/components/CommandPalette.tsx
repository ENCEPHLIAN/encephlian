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
import { FileText, Coins, Search, LayoutDashboard, Activity, FolderOpen, StickyNote, Settings, Moon, Sun, Layers, Braces, HelpCircle } from "lucide-react";
import { useTheme } from "next-themes";
import dayjs from "dayjs";
import { useSku } from "@/hooks/useSku";
import type { NavItemId } from "@/shared/skuPolicy";
import { getStudyListTitle } from "@/lib/studyDisplay";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CommandPalette({ open: externalOpen, onOpenChange: externalOnOpenChange }: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();
  const { isNavVisible } = useSku();

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
      const q = `%${searchQuery}%`;
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .or(`meta->>patient_name.ilike.${q},meta->>patient_id.ilike.${q},meta->>patient_age.ilike.${q},reference.ilike.${q}`)
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
      const buckets = ['eeg-uploads', 'eeg-raw', 'eeg-reports', 'eeg-clean', 'eeg-json', 'notes', 'templates'];
      const { data: { user } } = await supabase.auth.getUser();
      
      // Recursive function to search through folders
      const searchBucket = async (bucket: string, path: string = '') => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(path, { limit: 1000 });
        
        if (!data) return;
        
        for (const item of data) {
          // Files have NO 'id' in list response, folders do
          if (item.id === null || item.id === undefined) { // It's a file
            // Substring search instead of prefix search
            if (item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
              results.push({ 
                ...item, 
                bucket,
                fullPath: path ? `${path}/${item.name}` : item.name
              });
            }
          } else { // It's a folder, search recursively
            const folderPath = path ? `${path}/${item.name}` : item.name;
            await searchBucket(bucket, folderPath);
          }
        }
      };
      
      // Search all storage buckets
      for (const bucket of buckets) {
        // For user-specific buckets, search within user folder
        if (user && ['eeg-uploads', 'notes'].includes(bucket)) {
          await searchBucket(bucket, user.id);
        } else {
          await searchBucket(bucket);
        }
      }
      
      return results;
    },
    enabled: open && searchQuery.length >= 2
  });

  // Search notes table
  const { data: notesResults } = useQuery({
    queryKey: ["command-notes", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`)
        .limit(10);
      
      if (error) throw error;
      return data || [];
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
          {([
            { id: "dashboard" as NavItemId, to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard" },
            { id: "studies" as NavItemId, to: "/app/studies", icon: FileText, label: "Studies" },
            { id: "lanes" as NavItemId, to: "/app/lanes", icon: Layers, label: "Lanes" },
            { id: "viewer" as NavItemId, to: "/app/viewer", icon: Braces, label: "EEG Viewer" },
            { id: "notes" as NavItemId, to: "/app/notes", icon: StickyNote, label: "Notes" },
            { id: "files" as NavItemId, to: "/app/files", icon: FolderOpen, label: "Files" },
            { id: "wallet" as NavItemId, to: "/app/wallet", icon: Coins, label: "Wallet" },
            { id: "support" as NavItemId, to: "/app/support", icon: HelpCircle, label: "Support" },
          ] as const)
            .filter((item) => isNavVisible(item.id))
            .map(({ id, to, icon: Icon, label }) => (
              <CommandItem key={id} onSelect={() => { navigate(to); setOpen(false); }}>
                <Icon className="mr-2 h-4 w-4" />
                <span>{label}</span>
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandGroup heading={searchQuery ? "Search Results" : "Recent Studies"}>
          {studies?.map((study) => {
            const meta = study.meta as any;
            const title = getStudyListTitle(study);

            return (
              <CommandItem
                key={study.id}
                onSelect={() => {
                  navigate(`/app/studies/${study.id}`);
                  setOpen(false);
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{title}</div>
                  <div className="text-xs text-muted-foreground">
                    {dayjs(study.created_at).format("MMM D, YYYY")}
                  </div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {searchQuery && notesResults && notesResults.length > 0 && (
          <CommandGroup heading="Notes">
            {notesResults.map((note: any) => (
              <CommandItem
                key={note.id}
                onSelect={() => {
                  navigate("/app/notes");
                  setOpen(false);
                }}
              >
                <StickyNote className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">{note.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {note.content}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searchQuery && storageFiles && storageFiles.length > 0 && (
          <CommandGroup heading="Files">
            {storageFiles.map((file: any) => (
              <CommandItem
                key={`${file.bucket}-${file.fullPath || file.name}`}
                onSelect={async () => {
                  const { data } = await supabase.storage
                    .from(file.bucket)
                    .download(file.fullPath || file.name);
                  
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
                    {file.bucket}{file.fullPath && file.fullPath !== file.name ? ` • ${file.fullPath}` : ''}
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
