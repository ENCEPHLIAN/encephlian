import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MontageSelectorProps {
  currentMontage: string;
  onMontageChange: (montage: string) => void;
}

export function MontageSelector({ currentMontage, onMontageChange }: MontageSelectorProps) {
  const montages = [
    { value: "referential", label: "Referential" },
    { value: "bipolar-longitudinal", label: "Bipolar Longitudinal" },
    { value: "bipolar-transverse", label: "Bipolar Transverse" },
    { value: "average-reference", label: "Average Reference" },
    { value: "laplacian", label: "Laplacian" },
  ];

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Montage</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <Select value={currentMontage} onValueChange={onMontageChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {montages.map((montage) => (
              <SelectItem key={montage.value} value={montage.value}>
                {montage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
