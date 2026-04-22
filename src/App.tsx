import { Toaster } from "@/components/ui/toaster";
import { GeoRestrictionModal } from "@/components/GeoRestrictionModal";
import AdminCleanup from "@/pages/admin/AdminCleanup";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";
import AdminReadApi from "@/admin/index";
import AdminAccount from "@/pages/admin/AdminAccount";
import AdminWallets from "@/pages/admin/AdminWallets";
import AdminTickets from "@/pages/admin/AdminTickets";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminRestore from "@/pages/admin/AdminRestore";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UserSessionProvider } from "@/contexts/UserSessionContext";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/admin/AdminRoute";
import AppLayout from "./components/AppLayout";
import AdminLayout from "./components/admin/AdminLayout";
import Dashboard from "./pages/app/Dashboard";
import Studies from "./pages/app/Studies";
import StudyDetail from "./pages/app/StudyDetail";
import StudyReview from "./pages/app/StudyReview";
import EEGViewer from "./pages/app/EEGViewer";
import Notes from "./pages/app/Notes";
import Files from "./pages/app/Files";
import Documentation from "./pages/app/Documentation";
import Wallet from "./pages/app/Wallet";
import Lanes from "./pages/app/Lanes";
import Reports from "./pages/app/Reports";
import ReportDetail from "./pages/app/ReportDetail";
import Profile from "./pages/app/Profile";
import Settings from "./pages/app/Settings";
import TFASetup from "./pages/app/TFASetup";
import Support from "./pages/app/Support";
import OnboardingGuide from "./pages/app/OnboardingGuide";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";

import AdminStudies from "./pages/admin/AdminStudies";
import AdminStudyDetail from "./pages/admin/AdminStudyDetail";
import AdminClinics from "./pages/admin/AdminClinics";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminHealth from "./pages/admin/AdminHealth";
import AdminDiagnostics from "./pages/admin/AdminDiagnostics";
import AdminEegPush from "./pages/admin/AdminEegPush";
import AdminReportV0 from "./pages/admin/AdminReportV0";
import AdminInfra from "./pages/admin/AdminInfra";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

// Legacy route alias — /app/eeg-viewer?studyId=X was the old path; canonical is /app/viewer.
// Preserves query string so existing links/bookmarks keep working.
function LegacyEegViewerRedirect() {
  const location = useLocation();
  return <Navigate to={`/app/viewer${location.search}${location.hash}`} replace />;
}

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

              {/* Redirect base to /app */}
              <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

              {/* Admin Routes - OUTSIDE of ProtectedRoute */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  
                  <Route index element={<AdminDashboard />} />
                  <Route path="studies" element={<AdminStudies />} />
                  <Route path="studies/:id" element={<AdminStudyDetail />} />
                  <Route path="clinics" element={<AdminClinics />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="health" element={<AdminHealth />} />
                  <Route path="diagnostics" element={<AdminDiagnostics />} />
                  <Route path="wallets" element={<AdminWallets />} />
                  <Route path="tickets" element={<AdminTickets />} />
                  <Route path="cleanup" element={<AdminCleanup />} />
                  <Route path="restore" element={<AdminRestore />} />
                  <Route path="audit" element={<AdminAuditLogs />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="eeg-push" element={<AdminEegPush />} />
                  <Route path="read-api" element={<AdminReadApi />} />
                  <Route path="report-v0" element={<AdminReportV0 />} />
                  <Route path="infra" element={<AdminInfra />} />
                  <Route path="account" element={<AdminAccount />} />
                  <Route path="docs" element={<Documentation />} />
                </Route>
              </Route>

              {/* PaaS Routes - blocks admin users */}
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="studies" element={<Studies />} />
                  <Route path="studies/:id" element={<StudyDetail />} />
                  <Route path="studies/:id/review" element={<StudyReview />} />
                  <Route path="studies/:id/viewer" element={<EEGViewer />} />
                  <Route path="lanes" element={<Lanes />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="reports/:id" element={<ReportDetail />} />
                  <Route path="viewer" element={<EEGViewer />} />
                  {/* Legacy alias — redirects to /app/viewer preserving query string */}
                  <Route path="eeg-viewer" element={<LegacyEegViewerRedirect />} />
                  {/*
                    AdminReportV0 is user-facing despite the name/location.
                    Reached via the "Generate Report" button on /app/reports.
                    Reads are scoped by Read API key + Supabase RLS — no admin data leaks.
                    TODO(rename): move src/pages/admin/AdminReportV0.tsx → src/pages/app/GenerateReport.tsx
                  */}
                  <Route path="report-v0" element={<AdminReportV0 />} />
                  <Route path="notes" element={<Notes />} />
                  <Route path="files" element={<Files />} />
                  <Route path="wallet" element={<Wallet />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="settings/tfa" element={<TFASetup />} />
                  <Route path="support" element={<Support />} />
                  <Route path="docs" element={<Documentation />} />
                  <Route path="onboarding-guide" element={<OnboardingGuide />} />
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
