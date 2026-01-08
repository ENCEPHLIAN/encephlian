import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { toast } from "sonner";
import { useUserSession } from "@/contexts/UserSessionContext";
import { useDemoMode } from "@/contexts/DemoModeContext";

export interface StudyFile {
  id: string;
  study_id: string;
  path: string;
  kind: string;
  size_bytes: number | null;
  created_at: string;
}

export function useStudyFiles(enabled: boolean = true) {
  const { userId, isAuthenticated } = useUserSession();
  const { isDemoMode } = useDemoMode();
  
  return useQuery({
    queryKey: ["user-study-files", userId, isDemoMode],
    queryFn: async () => {
      // Build query with demo mode filter
      let query = supabase
        .from('studies')
        .select('id, state, sample, study_files(*)')
        .not('state', 'eq', 'awaiting_sla')
        .not('sla', 'eq', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      
      // Filter by demo mode
      if (isDemoMode) {
        query = query.eq('sample', true);
      } else {
        // User mode: exclude sample studies
        query = query.or('sample.is.null,sample.eq.false');
      }
      
      const { data: studies, error } = await query;
      
      if (error) throw error;
      if (!studies || studies.length === 0) return [];

      const allFiles: StudyFile[] = [];
      studies.forEach(study => {
        const files = (study.study_files || []) as StudyFile[];
        allFiles.push(...files);
      });

      return allFiles.sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
    },
    enabled: enabled && isAuthenticated && !!userId,
    staleTime: 30000,
    gcTime: 120000,
  });
}

export function useStorageFiles(bucket: string, path: string, enabled: boolean = true) {
  const { userId, isAuthenticated } = useUserSession();
  
  return useQuery({
    queryKey: ["storage-files", bucket, path, userId],
    queryFn: async () => {
      if (!userId) return [];
      if (bucket === 'study-files') return null;

      if (bucket === 'notes') {
        // Notes are personal - don't show in demo mode (handled by Files.tsx)
        // Notes are filtered by RLS automatically
        const { data, error } = await supabase
          .from('notes')
          .select('*')
          .order('updated_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(note => ({
          name: note.title + '.txt',
          id: note.id,
          created_at: note.created_at,
          updated_at: note.updated_at,
          metadata: { 
            size: new Blob([note.content]).size,
            mimetype: 'text/plain',
            noteContent: note.content,
            isPinned: note.is_pinned
          }
        }));
      }

      // Storage bucket - use cached userId
      const userPath = path ? `${userId}/${path}` : userId;
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(userPath, { limit: 100, sortBy: { column: "name", order: "asc" } });
      
      if (error) return [];
      return data || [];
    },
    enabled: enabled && isAuthenticated && !!userId && bucket !== 'study-files',
    staleTime: 30000,
    gcTime: 120000,
  });
}

export function useFileUpload(bucket: string, path: string) {
  const { userId } = useUserSession();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error('Not authenticated');
      
      const userFilePath = `${userId}/${path ? `${path}/` : ''}${file.name}`;
      const { error } = await supabase.storage.from(bucket).upload(userFilePath, file);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["storage-files", bucket, path] });
    },
    onError: (error: any) => toast.error(error.message || "Upload failed")
  });
}

export function useFileDelete(bucket: string, path: string) {
  const { userId } = useUserSession();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (fileName: string) => {
      if (!userId) throw new Error('Not authenticated');
      
      const filePath = path ? `${userId}/${path}/${fileName}` : `${userId}/${fileName}`;
      const { error } = await supabase.storage.from(bucket).remove([filePath]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["storage-files", bucket, path] });
    }
  });
}

export function useFilteredFiles(
  studyFiles: StudyFile[] | undefined,
  storageFiles: any[] | null | undefined,
  bucket: string,
  searchQuery: string
) {
  return useMemo(() => {
    let displayFiles: any[] = [];
    
    if (bucket === 'study-files' && studyFiles) {
      displayFiles = studyFiles.map(sf => ({
        ...sf,
        name: sf.path.split('/').pop() || sf.path,
        metadata: { size: sf.size_bytes }
      }));
    } else if (storageFiles) {
      displayFiles = storageFiles;
    }

    const filtered = displayFiles.filter(file => 
      file.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      folders: filtered.filter(f => !f.name?.includes('.')),
      files: filtered.filter(f => f.name?.includes('.')),
      total: filtered.length,
    };
  }, [studyFiles, storageFiles, bucket, searchQuery]);
}
