import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { toast } from "sonner";
import { useUserSession } from "@/contexts/UserSessionContext";

export interface StudyFile {
  id: string;
  study_id: string;
  path: string;
  kind: string;
  size_bytes: number | null;
  created_at: string;
}

export interface StudyForFiles {
  id: string;
  state: string;
  sla: string;
  created_at: string;
  triage_status: string | null;
  triage_completed_at: string | null;
  tokens_deducted: number | null;
  ai_draft_json: any | null;
  meta: any;
  sample: boolean | null;
  study_files: StudyFile[];
}

// Studies enriched for the Files view (patient context + file list)
export function useStudiesForFiles() {
  const { userId, isAuthenticated } = useUserSession();

  return useQuery({
    queryKey: ["studies-for-files", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, state, sla, created_at, meta, triage_status, triage_completed_at, tokens_deducted, ai_draft_json, sample, study_files(id, kind, size_bytes, path, created_at)")
        .or("sample.is.null,sample.eq.false")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as StudyForFiles[];
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 30000,
    gcTime: 120000,
  });
}

export function useStudyFiles(enabled: boolean = true) {
  const { userId, isAuthenticated } = useUserSession();

  return useQuery({
    queryKey: ["user-study-files", userId],
    queryFn: async () => {
      const { data: studies, error } = await supabase
        .from("studies")
        .select("id, state, sample, study_files(*)")
        .or("sample.is.null,sample.eq.false")
        .not("state", "eq", "awaiting_sla")
        .not("sla", "eq", "pending")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!studies || studies.length === 0) return [];

      const allFiles: StudyFile[] = [];
      studies.forEach((study) => {
        const files = (study.study_files || []) as StudyFile[];
        allFiles.push(...files);
      });

      return allFiles.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
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
      if (bucket === "study-files") return null;

      if (bucket === "notes") {
        const { data, error } = await supabase
          .from("notes")
          .select("*")
          .order("updated_at", { ascending: false });

        if (error) throw error;

        return (data || []).map((note) => ({
          name: note.title + ".txt",
          id: note.id,
          created_at: note.created_at,
          updated_at: note.updated_at,
          metadata: {
            size: new Blob([note.content]).size,
            mimetype: "text/plain",
            noteContent: note.content,
            isPinned: note.is_pinned,
          },
        }));
      }

      // EEG uploads live in Azure — query study_files table (DB records, not Supabase storage)
      if (bucket === "eeg-uploads") {
        const { data, error } = await supabase
          .from("study_files")
          .select("id, study_id, path, kind, size_bytes, created_at, studies(meta)")
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) throw error;

        return (data || []).map((f: any) => {
          const meta = f.studies?.meta as any;
          const patientLabel = meta?.patient_name || meta?.patient_id || f.study_id?.slice(0, 8) || "Unknown";
          const fileName = f.path?.split("/").pop() || f.path || f.id;
          return {
            id: f.id,
            name: fileName,
            study_id: f.study_id,
            kind: f.kind,
            size_bytes: f.size_bytes,
            created_at: f.created_at,
            patientLabel,
            metadata: { size: f.size_bytes },
          };
        });
      }

      // Reports: query reports table for signed PDFs
      if (bucket === "eeg-reports") {
        const { data, error } = await supabase
          .from("reports")
          .select("id, study_id, status, signed_at, created_at, pdf_path, studies(meta, sla)")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;

        return (data || []).map((r: any) => {
          const meta = r.studies?.meta as any;
          const patientLabel = meta?.patient_name || meta?.patient_id || r.study_id?.slice(0, 8) || "Unknown";
          const fileName = r.pdf_path?.split("/").pop() || `report_${r.study_id?.slice(0, 8)}.pdf`;
          return {
            id: r.id,
            name: fileName,
            study_id: r.study_id,
            status: r.status,
            signed_at: r.signed_at,
            pdf_path: r.pdf_path,
            created_at: r.signed_at || r.created_at,
            patientLabel,
            metadata: { size: null, mimetype: "application/pdf" },
          };
        });
      }

      const userPath = path ? `${userId}/${path}` : userId;

      const { data, error } = await supabase.storage
        .from(bucket)
        .list(userPath, { limit: 200, sortBy: { column: "name", order: "asc" } });

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && isAuthenticated && !!userId && bucket !== "study-files",
    staleTime: 30000,
    gcTime: 120000,
  });
}

export function useFileUpload(bucket: string, path: string) {
  const { userId } = useUserSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error("Not authenticated");
      const userFilePath = `${userId}/${path ? `${path}/` : ""}${file.name}`;
      const { error } = await supabase.storage.from(bucket).upload(userFilePath, file, { upsert: false });
      if (error) throw error;
    },
    onSuccess: (_, file) => {
      toast.success(`Uploaded ${file.name}`);
      queryClient.invalidateQueries({ queryKey: ["storage-files", bucket, path] });
    },
    onError: (error: any) => toast.error(error.message || "Upload failed"),
  });
}

export function useFileDelete(bucket: string, path: string) {
  const { userId } = useUserSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileName: string) => {
      if (!userId) throw new Error("Not authenticated");
      const filePath = path ? `${userId}/${path}/${fileName}` : `${userId}/${fileName}`;
      const { error } = await supabase.storage.from(bucket).remove([filePath]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["storage-files", bucket, path] });
    },
    onError: (error: any) => toast.error("Delete failed: " + (error.message || "Unknown error")),
  });
}

export function useStudyDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (studyId: string) => {
      // Get storage paths best-effort — don't block delete if this fails
      const { data: studyFiles } = await supabase
        .from("study_files")
        .select("path")
        .eq("study_id", studyId);

      if (studyFiles && studyFiles.length > 0) {
        const paths = studyFiles.map((f) => f.path).filter(Boolean);
        if (paths.length > 0) {
          // Best-effort storage cleanup — ignore errors
          await supabase.storage.from("eeg-uploads").remove(paths);
        }
      }

      // Get report PDF paths best-effort
      const { data: reports } = await supabase
        .from("reports")
        .select("pdf_path")
        .eq("study_id", studyId);

      if (reports) {
        const pdfPaths = reports.map((r) => r.pdf_path).filter(Boolean) as string[];
        if (pdfPaths.length > 0) {
          await supabase.storage.from("eeg-reports").remove(pdfPaths);
        }
      }

      // Delete study record — cascades to study_files and reports in DB
      const { error } = await supabase.from("studies").delete().eq("id", studyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Study deleted");
      queryClient.invalidateQueries({ queryKey: ["studies-for-files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] });
      queryClient.invalidateQueries({ queryKey: ["studies-list"] });
      queryClient.invalidateQueries({ queryKey: ["user-study-files"] });
    },
    onError: (error: any) =>
      toast.error("Delete failed: " + (error.message || "Unknown error")),
  });
}

export function useCreateFolder(bucket: string, path: string) {
  const { userId } = useUserSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderName: string) => {
      if (!userId) throw new Error("Not authenticated");
      const folderPath = path
        ? `${userId}/${path}/${folderName}/.keep`
        : `${userId}/${folderName}/.keep`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(folderPath, new Blob([""], { type: "text/plain" }));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folder created");
      queryClient.invalidateQueries({ queryKey: ["storage-files", bucket, path] });
    },
    onError: (error: any) => toast.error("Failed to create folder: " + error.message),
  });
}

export function useRenameFile(bucket: string, path: string) {
  const { userId } = useUserSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      if (!userId) throw new Error("Not authenticated");
      const oldPath = path ? `${userId}/${path}/${oldName}` : `${userId}/${oldName}`;
      const newPath = path ? `${userId}/${path}/${newName}` : `${userId}/${newName}`;

      const { data, error: dlErr } = await supabase.storage.from(bucket).download(oldPath);
      if (dlErr) throw dlErr;

      const { error: upErr } = await supabase.storage.from(bucket).upload(newPath, data, { upsert: false });
      if (upErr) throw upErr;

      const { error: delErr } = await supabase.storage.from(bucket).remove([oldPath]);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast.success("File renamed");
      queryClient.invalidateQueries({ queryKey: ["storage-files", bucket, path] });
    },
    onError: (error: any) => toast.error("Rename failed: " + error.message),
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

    if (bucket === "study-files" && studyFiles) {
      displayFiles = studyFiles.map((sf) => ({
        ...sf,
        name: sf.path.split("/").pop() || sf.path,
        metadata: { size: sf.size_bytes },
      }));
    } else if (storageFiles) {
      displayFiles = storageFiles;
    }

    const filtered = displayFiles.filter((file) =>
      file.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      folders: filtered.filter((f) => !f.name?.includes(".")),
      files: filtered.filter((f) => f.name?.includes(".")),
      total: filtered.length,
    };
  }, [studyFiles, storageFiles, bucket, searchQuery]);
}
