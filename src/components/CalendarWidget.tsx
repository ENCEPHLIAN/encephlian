import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export function CalendarWidget() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const isMobile = useIsMobile();

  return (
    <Card className="w-full border-none shadow-sm opacity-80 hover:opacity-100 transition-opacity">
      <CardContent className="p-4">
        <div className={isMobile ? "flex justify-center" : "grid grid-cols-3 gap-4"}>
          {isMobile ? (
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md"
            />
          ) : (
            <>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                month={new Date(new Date().getFullYear(), new Date().getMonth() - 1)}
              />
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
              />
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                month={new Date(new Date().getFullYear(), new Date().getMonth() + 1)}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
