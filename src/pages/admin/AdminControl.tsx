import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const CARDS = [
  { title: "Ops Console", desc: "Health, failures, replays, SLA breaches.", href: "/admin/health" },
  { title: "Studies", desc: "Global study oversight and triage.", href: "/admin/studies" },
  { title: "Clinics", desc: "Tenant lifecycle, enablement, controls.", href: "/admin/clinics" },
  { title: "Users", desc: "RBAC, invites, access control.", href: "/admin/users" },
  { title: "Wallets", desc: "Balances, debits/credits, refunds.", href: "/admin/wallets" },
  { title: "Audit Logs", desc: "Who accessed what, when, and why.", href: "/admin/audit" },
  { title: "Integrations", desc: "Read API / EEG push / external links.", href: "/admin/integrations" },
  { title: "Settings", desc: "System policy, defaults, guardrails.", href: "/admin/settings" },
];

export default function AdminControl() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Operations Control</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Centralized command center. No fluff — only levers that move the business.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <NavLink
            key={c.href}
            to={c.href}
            className={cn(
              "rounded-lg border bg-card p-4 transition-colors",
              "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <div className="font-medium">{c.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{c.desc}</div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
