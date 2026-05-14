import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UserSessionProvider } from "@/contexts/UserSessionContext";
import { GeoRestrictionModal } from "@/components/GeoRestrictionModal";

// ── Non-lazy (always needed on first paint) ───────────────────────────────────
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/admin/AdminRoute";
import AppLayout from "./components/AppLayout";
import AdminLayout from "./components/admin/AdminLayout";
import NotFound from "./pages/NotFound";

// ── App pages (lazy) ──────────────────────────────────────────────────────────
const Dashboard    = lazy(() => import("./pages/app/Dashboard"));
const Studies      = lazy(() => import("./pages/app/Studies"));
const StudyDetail  = lazy(() => import("./pages/app/StudyDetail"));
const StudyReview  = lazy(() => import("./pages/app/StudyReview"));
const SignalViewer = lazy(() => import("./pages/app/SignalViewer"));
const Lanes        = lazy(() => import("./pages/app/Lanes"));
const Reports      = lazy(() => import("./pages/app/Reports"));
const ReportDetail = lazy(() => import("./pages/app/ReportDetail"));
const Notes        = lazy(() => import("./pages/app/Notes"));
const Files        = lazy(() => import("./pages/app/Files"));
const Wallet       = lazy(() => import("./pages/app/Wallet"));
const Profile      = lazy(() => import("./pages/app/Profile"));
const Settings     = lazy(() => import("./pages/app/Settings"));
const TFASetup     = lazy(() => import("./pages/app/TFASetup"));
const Support      = lazy(() => import("./pages/app/Support"));
const Documentation = lazy(() => import("./pages/app/Documentation"));
const OnboardingGuide = lazy(() => import("./pages/app/OnboardingGuide"));

// ── Admin pages (lazy) ────────────────────────────────────────────────────────
const AdminDashboard   = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminStudies     = lazy(() => import("./pages/admin/AdminStudies"));
const AdminStudyDetail = lazy(() => import("./pages/admin/AdminStudyDetail"));
const AdminClinics     = lazy(() => import("./pages/admin/AdminClinics"));
const AdminUsers       = lazy(() => import("./pages/admin/AdminUsers"));
const AdminHealth      = lazy(() => import("./pages/admin/AdminHealth"));
const AdminDiagnostics = lazy(() => import("./pages/admin/AdminDiagnostics"));
const AdminWallets     = lazy(() => import("./pages/admin/AdminWallets"));
const AdminTickets     = lazy(() => import("./pages/admin/AdminTickets"));
const AdminCleanup     = lazy(() => import("./pages/admin/AdminCleanup"));
const AdminRestore     = lazy(() => import("./pages/admin/AdminRestore"));
const AdminAuditLogs   = lazy(() => import("./pages/admin/AdminAuditLogs"));
const AdminSettings    = lazy(() => import("./pages/admin/AdminSettings"));
const AdminDataPush    = lazy(() => import("./pages/admin/AdminDataPush"));
const AdminReadApi     = lazy(() => import("./admin/index"));
const AdminReportV0    = lazy(() => import("./pages/admin/AdminReportV0"));
const AdminInfra       = lazy(() => import("./pages/admin/AdminInfra"));
const AdminFinance     = lazy(() => import("./pages/admin/AdminFinance"));
const AdminAccount     = lazy(() => import("./pages/admin/AdminAccount"));

// ── Suspense fallback ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent opacity-60" />
    </div>
  );
}

// ── QueryClient ───────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,      // 15s default — reduces redundant refetches on tab switch
      gcTime: 5 * 60_000,     // 5min cache retention
      refetchOnWindowFocus: false, // studies don't change that fast; saves requests
    },
  },
});

// ── Legacy route redirect ─────────────────────────────────────────────────────
function LegacyEegViewerRedirect() {
  const location = useLocation();
  return <Navigate to={`/app/viewer${location.search}${location.hash}`} replace />;
}

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <UserSessionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <GeoRestrictionModal />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

                {/* Admin Routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense>} />
                    <Route path="studies" element={<Suspense fallback={<PageLoader />}><AdminStudies /></Suspense>} />
                    <Route path="studies/:id" element={<Suspense fallback={<PageLoader />}><AdminStudyDetail /></Suspense>} />
                    <Route path="clinics" element={<Suspense fallback={<PageLoader />}><AdminClinics /></Suspense>} />
                    <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsers /></Suspense>} />
                    <Route path="health" element={<Suspense fallback={<PageLoader />}><AdminHealth /></Suspense>} />
                    <Route path="diagnostics" element={<Suspense fallback={<PageLoader />}><AdminDiagnostics /></Suspense>} />
                    <Route path="wallets" element={<Suspense fallback={<PageLoader />}><AdminWallets /></Suspense>} />
                    <Route path="tickets" element={<Suspense fallback={<PageLoader />}><AdminTickets /></Suspense>} />
                    <Route path="cleanup" element={<Suspense fallback={<PageLoader />}><AdminCleanup /></Suspense>} />
                    <Route path="restore" element={<Suspense fallback={<PageLoader />}><AdminRestore /></Suspense>} />
                    <Route path="audit" element={<Suspense fallback={<PageLoader />}><AdminAuditLogs /></Suspense>} />
                    <Route path="settings" element={<Suspense fallback={<PageLoader />}><AdminSettings /></Suspense>} />
                    <Route path="data-push" element={<Suspense fallback={<PageLoader />}><AdminDataPush /></Suspense>} />
                    <Route path="read-api" element={<Suspense fallback={<PageLoader />}><AdminReadApi /></Suspense>} />
                    <Route path="report-v0" element={<Suspense fallback={<PageLoader />}><AdminReportV0 /></Suspense>} />
                    <Route path="infra" element={<Suspense fallback={<PageLoader />}><AdminInfra /></Suspense>} />
                    <Route path="finance" element={<Suspense fallback={<PageLoader />}><AdminFinance /></Suspense>} />
                    <Route path="account" element={<Suspense fallback={<PageLoader />}><AdminAccount /></Suspense>} />
                    <Route path="docs" element={<Suspense fallback={<PageLoader />}><Documentation /></Suspense>} />
                  </Route>
                </Route>

                {/* PaaS Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/app" element={<AppLayout />}>
                    <Route index element={<Navigate to="/app/dashboard" replace />} />
                    <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
                    <Route path="studies" element={<Suspense fallback={<PageLoader />}><Studies /></Suspense>} />
                    <Route path="studies/:id" element={<Suspense fallback={<PageLoader />}><StudyDetail /></Suspense>} />
                    <Route path="studies/:id/review" element={<Suspense fallback={<PageLoader />}><StudyReview /></Suspense>} />
                    <Route path="studies/:id/viewer" element={<Suspense fallback={<PageLoader />}><SignalViewer /></Suspense>} />
                    <Route path="lanes" element={<Suspense fallback={<PageLoader />}><Lanes /></Suspense>} />
                    <Route path="reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
                    <Route path="reports/:id" element={<Suspense fallback={<PageLoader />}><ReportDetail /></Suspense>} />
                    <Route path="viewer" element={<Suspense fallback={<PageLoader />}><SignalViewer /></Suspense>} />
                    <Route path="eeg-viewer" element={<LegacyEegViewerRedirect />} />
                    <Route path="report-v0" element={<Suspense fallback={<PageLoader />}><AdminReportV0 /></Suspense>} />
                    <Route path="notes" element={<Suspense fallback={<PageLoader />}><Notes /></Suspense>} />
                    <Route path="files" element={<Suspense fallback={<PageLoader />}><Files /></Suspense>} />
                    <Route path="wallet" element={<Suspense fallback={<PageLoader />}><Wallet /></Suspense>} />
                    <Route path="profile" element={<Suspense fallback={<PageLoader />}><Profile /></Suspense>} />
                    <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                    <Route path="settings/tfa" element={<Suspense fallback={<PageLoader />}><TFASetup /></Suspense>} />
                    <Route path="support" element={<Suspense fallback={<PageLoader />}><Support /></Suspense>} />
                    <Route path="docs" element={<Suspense fallback={<PageLoader />}><Documentation /></Suspense>} />
                    <Route path="onboarding-guide" element={<Suspense fallback={<PageLoader />}><OnboardingGuide /></Suspense>} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </UserSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
