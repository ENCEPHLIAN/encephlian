import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Globe, Mail, ShieldCheck } from "lucide-react";

// Countries where ENCEPHLIAN services are currently available
const PERMITTED_COUNTRIES = ["IN", "US", "GB", "CA", "AU", "SG", "AE", "NZ"];

type GeoResult = {
  country: string;
  country_name: string;
};

async function detectCountry(): Promise<GeoResult | null> {
  try {
    // Cloudflare-powered geo, returns JSON with ip + country
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { country: data.country_code || "", country_name: data.country_name || "" };
  } catch {
    return null;
  }
}

const GEO_DISMISSED_KEY = "enceph.geo.dismissed.v1";

export function GeoRestrictionModal() {
  const [open, setOpen] = useState(false);
  const [countryName, setCountryName] = useState("");

  useEffect(() => {
    // Don't re-show if already dismissed this session
    if (sessionStorage.getItem(GEO_DISMISSED_KEY)) return;

    detectCountry().then((geo) => {
      if (!geo) return;
      if (!PERMITTED_COUNTRIES.includes(geo.country)) {
        setCountryName(geo.country_name || "your region");
        setOpen(true);
      }
    });
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(GEO_DISMISSED_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-base">Service Availability Notice</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-left space-y-3">
            <p>
              ENCEPHLIAN clinical intelligence services are currently operating in select markets
              under regulatory and compliance frameworks specific to each jurisdiction.
            </p>
            <p>
              It appears you are accessing this platform from{" "}
              <span className="font-medium text-foreground">{countryName}</span>, a region where
              our services are not yet formally available.
            </p>
            <p>
              If your organisation is interested in deploying ENCEPHLIAN's AI-powered EEG triage
              infrastructure, our team would be pleased to discuss regulatory pathways and
              availability timelines in your region.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Clinical-grade AI · HIPAA-compliant infrastructure · Regulatory-ready</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
            <a
              href="mailto:info@encephlian.cloud"
              className="text-primary hover:underline"
            >
              info@encephlian.cloud
            </a>
            <span>— for regional availability enquiries</span>
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <Button variant="outline" size="sm" onClick={handleDismiss}>
            Continue anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
