import { Toaster } from "@/components/ui/toaster";
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
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UserSessionProvider } from "@/contexts/UserSessionContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import Login from "./pages/Login";
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
import Wallet from "./pages/app/Wallet";
import Lanes from "./pages/app/Lanes";
import Reports from "./pages/app/Reports";
import ReportDetail from "./pages/app/ReportDetail";
import Profile from "./pages/app/Profile";
import Settings from "./pages/app/Settings";
import TFASetup from "./pages/app/TFASetup";
import Support from "./pages/app/Support";
import Templates from "./pages/app/Templates";
import NotFound from "./pages/NotFound";
import ComingSoon from "./pages/app/ComingSoon";
import AdminDashboard from "./pages/admin/AdminDashboard";

import AdminStudies from "./pages/admin/AdminStudies";
import AdminStudyDetail from "./pages/admin/AdminStudyDetail";
import AdminClinics from "./pages/admin/AdminClinics";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminHealth from "./pages/admin/AdminHealth";
import AdminDiagnostics from "./pages/admin/AdminDiagnostics";
import AdminEegPush from "./pages/admin/AdminEegPush";
import AdminReportV0 from "./pages/admin/AdminReportV0";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <UserSessionProvider>
          <DemoModeProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                <Route path="/login" element={<Login />} />

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
                    <Route path="account" element={<AdminAccount />} />
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
                    <Route path="eeg-viewer" element={<EEGViewer />} />
                    <Route path="report-v0" element={<AdminReportV0 />} />
                    <Route path="notes" element={<Notes />} />
                    <Route path="files" element={<Files />} />
                    <Route path="wallet" element={<Wallet />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="settings/tfa" element={<TFASetup />} />
                    <Route path="support" element={<Support />} />
                    <Route path="templates" element={<Templates />} />
                    <Route path="coming-soon" element={<ComingSoon />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </TooltipProvider>
          </DemoModeProvider>
        </UserSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
