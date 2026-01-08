import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface EvidenceFilters {
  label: string;
  minScore: number;
  maxScore: number;
  minTime: number;
  maxTime: number;
  search: string;
}

interface EvidenceTableFiltersProps {
  filters: EvidenceFilters;
  onChange: (filters: EvidenceFilters) => void;
  availableLabels: string[];
  maxDuration: number;
}

export default function EvidenceTableFilters({
  filters,
  onChange,
  availableLabels,
  maxDuration,
}: EvidenceTableFiltersProps) {
  const updateFilter = <K extends keyof EvidenceFilters>(key: K, value: EvidenceFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onChange({
      label: "",
      minScore: 0,
      maxScore: 1,
      minTime: 0,
      maxTime: maxDuration,
      search: "",
    });
  };

  const hasActiveFilters =
    filters.label !== "" ||
    filters.minScore > 0 ||
    filters.maxScore < 1 ||
    filters.minTime > 0 ||
    filters.maxTime < maxDuration ||
    filters.search !== "";

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Filters</h4>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="space-y-1">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Search labels..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="h-8"
          />
        </div>

        {/* Label filter */}
        <div className="space-y-1">
          <Label className="text-xs">Label</Label>
          <Select value={filters.label} onValueChange={(v) => updateFilter("label", v)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="All labels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All labels</SelectItem>
              {availableLabels.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Score range */}
        <div className="space-y-1">
          <Label className="text-xs">
            Score: {filters.minScore.toFixed(2)} – {filters.maxScore.toFixed(2)}
          </Label>
          <div className="pt-2">
            <Slider
              value={[filters.minScore, filters.maxScore]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([min, max]) => {
                onChange({ ...filters, minScore: min, maxScore: max });
              }}
            />
          </div>
        </div>

        {/* Time range */}
        <div className="space-y-1">
          <Label className="text-xs">
            Time: {filters.minTime.toFixed(0)}s – {filters.maxTime.toFixed(0)}s
          </Label>
          <div className="pt-2">
            <Slider
              value={[filters.minTime, filters.maxTime]}
              min={0}
              max={maxDuration}
              step={1}
              onValueChange={([min, max]) => {
                onChange({ ...filters, minTime: min, maxTime: max });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
