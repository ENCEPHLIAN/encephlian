import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import { recordApiCall } from "./usePerformanceMonitor";

export interface StudyFile {
  id: string;
  study_id: string;
  path: string;
  kind: string;
  size_bytes: number | null;
  created_at: string;
}

// Deduplication cache
const requestCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
const CACHE_TTL = 10000; // 10 seconds

function deduplicatedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(key);
  
  if (cached && now - cached.timestamp < CACHE_TTL) {
    // Record cache hit
    recordApiCall({
      endpoint: key,
      duration: 0,
      timestamp: now,
      success: true,
      cached: true,
    });
    return cached.promise as Promise<T>;
  }
  
  const startTime = now;
  const promise = fetcher().then((result) => {
    recordApiCall({
      endpoint: key,
      duration: Date.now() - startTime,
      timestamp: startTime,
      success: true,
      cached: false,
    });
    return result;
  }).catch((error) => {
    recordApiCall({
      endpoint: key,
      duration: Date.now() - startTime,
      timestamp: startTime,
      success: false,
      cached: false,
    });
    throw error;
  });
  
  requestCache.set(key, { promise, timestamp: now });
  
  promise.finally(() => {
    setTimeout(() => {
      const current = requestCache.get(key);
      if (current?.promise === promise) {
        requestCache.delete(key);
      }
    }, CACHE_TTL);
  });
  
  return promise;
}

export function useStudyFiles(enabled: boolean = true) {
  return useQuery({
    queryKey: ["user-study-files"],
    queryFn: () => deduplicatedFetch("files-study-files", async () => {
      // RLS handles user filtering automatically
      const { data: studies, error } = await supabase
        .from('studies')
        .select('id, state, study_files(*)')
        .not('state', 'eq', 'awaiting_sla')
        .not('sla', 'eq', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      
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
    }),
    enabled,
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useStorageFiles(bucket: string, path: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["storage-files", bucket, path],
    queryFn: () => deduplicatedFetch(`files-storage-${bucket}-${path}`, async () => {
      if (bucket === 'study-files') return null;

      if (bucket === 'notes') {
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

      // Storage bucket - RLS handles user isolation
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const userPath = path ? `${user.id}/${path}` : user.id;
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(userPath, { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      return data;
    }),
    enabled: enabled && bucket !== 'study-files',
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useFileUpload(bucket: string, path: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File) => {
      const startTime = Date.now();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const userFilePath = `${user.id}/${path ? `${path}/` : ''}${file.name}`;
      const { error } = await supabase.storage.from(bucket).upload(userFilePath, file);
      
      recordApiCall({
        endpoint: `files-upload-${bucket}`,
        duration: Date.now() - startTime,
        timestamp: startTime,
        success: !error,
        cached: false,
      });
      
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
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (fileName: string) => {
      const startTime = Date.now();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const filePath = path ? `${user.id}/${path}/${fileName}` : `${user.id}/${fileName}`;
      const { error } = await supabase.storage.from(bucket).remove([filePath]);
      
      recordApiCall({
        endpoint: `files-delete-${bucket}`,
        duration: Date.now() - startTime,
        timestamp: startTime,
        success: !error,
        cached: false,
      });
      
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
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      folders: filtered.filter(f => !f.name.includes('.')),
      files: filtered.filter(f => f.name.includes('.')),
      total: filtered.length,
    };
  }, [studyFiles, storageFiles, bucket, searchQuery]);
}
