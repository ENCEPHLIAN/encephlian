import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";

const CLINIC_SELECTOR_KEY = "enceph.admin.selectedClinicId";

export interface ClinicOption {
  id: string;
  name: string;
}

export function useClinicSelector() {
  const { roles } = useUserSession();
  const isSuperAdmin = roles.includes("super_admin") || roles.includes("management");

  const [selectedClinicId, setSelectedClinicIdState] = useState<string | null>(() => {
    const stored = localStorage.getItem(CLINIC_SELECTOR_KEY);
    return stored || null;
  });

  // Fetch all clinics (admin-only)
  const { data: clinics = [], isLoading } = useQuery<ClinicOption[]>({
    queryKey: ["admin-clinics-selector"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const setSelectedClinicId = useCallback((id: string | null) => {
    setSelectedClinicIdState(id);
    if (id) {
      localStorage.setItem(CLINIC_SELECTOR_KEY, id);
    } else {
      localStorage.removeItem(CLINIC_SELECTOR_KEY);
    }
  }, []);

  // On mount, validate stored clinic exists
  useEffect(() => {
    if (clinics.length > 0 && selectedClinicId) {
      const exists = clinics.some((c) => c.id === selectedClinicId);
      if (!exists) {
        setSelectedClinicId(null);
      }
    }
  }, [clinics, selectedClinicId, setSelectedClinicId]);

  return {
    clinics,
    selectedClinicId,
    setSelectedClinicId,
    isLoading,
    isSuperAdmin,
    // Helper: "All" option available only for super_admin/management
    canSelectAll: isSuperAdmin,
  };
}
