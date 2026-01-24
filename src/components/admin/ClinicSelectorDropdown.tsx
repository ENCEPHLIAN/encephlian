import { useClinicSelector } from "@/hooks/useClinicSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ClinicSelectorDropdown() {
  const { clinics, selectedClinicId, setSelectedClinicId, isLoading, canSelectAll } = useClinicSelector();

  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }

  return (
    <Select
      value={selectedClinicId ?? "all"}
      onValueChange={(v) => setSelectedClinicId(v === "all" ? null : v)}
    >
      <SelectTrigger className="w-full text-xs">
        <Building2 className="h-3.5 w-3.5 mr-2 opacity-50" />
        <SelectValue placeholder="Select clinic" />
      </SelectTrigger>
      <SelectContent>
        {canSelectAll && (
          <SelectItem value="all">All Clinics</SelectItem>
        )}
        {clinics.map((clinic) => (
          <SelectItem key={clinic.id} value={clinic.id}>
            {clinic.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
