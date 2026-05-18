import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  version: string;
  effectiveDate: string;
  children: ReactNode;
}

/**
 * LegalLayout — shared wrapper for /terms /privacy /refund /support.
 *
 * Renders in Inter, with structured typography that survives copy-paste into
 * Word/Google Docs without losing hierarchy. Includes a persistent DRAFT
 * banner because counsel has not yet reviewed these documents — remove the
 * banner only after legal sign-off.
 */
export default function LegalLayout({
  title,
  version,
  effectiveDate,
  children,
}: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link
            to="/admin"
            className="flex items-center gap-2 text-sm font-bold tracking-tight hover:opacity-80"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back to admin</span>
          </Link>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{version}</span>
            <span className="mx-2">·</span>
            <span>Effective {effectiveDate}</span>
          </div>
        </div>
      </header>

      {/* DRAFT banner — remove after counsel review */}
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-center text-[11px] text-amber-700 dark:text-amber-300">
        DRAFT — pending counsel review under DPDP Act 2023, IT Rules 2021,
        NMC Telemedicine Practice Guidelines, and CDSCO MDR 2017. Not legal advice.
      </div>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aposematium Private Limited (CIN: <span className="font-mono">[TBD]</span>)
          doing business as <span className="font-semibold">ENCEPHLIAN</span>.
          Registered office: <span className="font-mono">[TBD]</span>, India.
          Contact:{" "}
          <a
            href="mailto:info@encephlian.cloud"
            className="text-primary underline-offset-4 hover:underline"
          >
            info@encephlian.cloud
          </a>
          .
        </p>

        <div className="prose prose-sm dark:prose-invert mt-10 max-w-none
                        prose-headings:font-semibold prose-headings:tracking-tight
                        prose-h2:mt-10 prose-h2:text-xl prose-h2:border-b prose-h2:border-border prose-h2:pb-2
                        prose-h3:mt-6 prose-h3:text-base prose-h3:font-semibold
                        prose-p:text-sm prose-p:leading-relaxed
                        prose-li:text-sm prose-li:leading-relaxed
                        prose-strong:font-semibold
                        prose-a:text-primary prose-a:underline-offset-4
                        prose-table:text-xs
                        prose-th:font-semibold prose-th:bg-muted/40">
          {children}
        </div>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Aposematium Private Limited. All rights reserved.
            ENCEPHLIAN, MIND, and the four-plane architecture are unregistered
            trademarks of Aposematium Private Limited.
          </p>
          <p className="mt-2 space-x-3">
            <Link to="/admin/legal/terms" className="hover:underline">Terms</Link>
            <Link to="/admin/legal/privacy" className="hover:underline">Privacy</Link>
            <Link to="/admin/legal/refund" className="hover:underline">Refund &amp; Cancellation</Link>
            <Link to="/admin/legal/support" className="hover:underline">Support</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
