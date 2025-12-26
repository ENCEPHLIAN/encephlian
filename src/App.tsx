import { Toaster } from "@/components/ui/toaster";
import AdminCleanup from "@/pages/admin/AdminCleanup";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";
import AdminReadApi from "@/admin/index";
import AdminAccount from "@/pages/admin/AdminAccount";
import AdminWallets from "@/pages/admin/AdminWallets";
import AdminTickets from "@/pages/admin/AdminTickets";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminScheduler from "@/pages/admin/AdminScheduler";
import AdminIntegrations from "@/pages/admin/AdminIntegrations";
import AdminTeam from "@/pages/admin/AdminTeam";
import AdminRestore from "@/pages/admin/AdminRestore";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UserSessionProvider } from "@/contexts/UserSessionContext";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/admin/AdminRoute";
import AdminLayout from "./components/admin/AdminLayout";
import AppLayout from "./components/AppLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminStudies from "./pages/admin/AdminStudies";
import AdminStudyDetail from "./pages/admin/AdminStudyDetail";
import AdminClinics from "./pages/admin/AdminClinics";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminHealth from "./pages/admin/AdminHealth";
import AdminEegPush from "./pages/admin/AdminEegPush";
import Dashboard from "./pages/app/Dashboard";
import Studies from "./pages/app/Studies";
import StudyDetail from "./pages/app/StudyDetail";
import StudyReview from "./pages/app/StudyReview";
import EEGViewer from "./pages/app/EEGViewer";
import Files from "./pages/app/Files";
import Wallet from "./pages/app/Wallet";
import Profile from "./pages/app/Profile";
import Settings from "./pages/app/Settings";
import Lanes from "./pages/app/Lanes";
import ReportDetail from "./pages/app/ReportDetail";
import Reports from "./pages/app/Reports";
import TFASetup from "./pages/app/TFASetup";
import Notes from "./pages/app/Notes";
import Support from "./pages/app/Support";
import Documentation from "./pages/app/Documentation";
import ComingSoon from "./pages/app/ComingSoon";
import NotFound from "./pages/NotFound";
import "./App.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: 120000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <UserSessionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
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
                    <Route path="wallets" element={<AdminWallets />} />
                    <Route path="tickets" element={<AdminTickets />} />
                    <Route path="cleanup" element={<AdminCleanup />} />
                    <Route path="restore" element={<AdminRestore />} />
                    <Route path="audit" element={<AdminAuditLogs />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="scheduler" element={<AdminScheduler />} />
                    <Route path="integrations" element={<AdminIntegrations />} />
                    <Route path="team" element={<AdminTeam />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="eeg-push" element={<AdminEegPush />} />
                    <Route path="read-api" element={<AdminReadApi />} />
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
                    <Route path="notes" element={<Notes />} />
                    <Route path="files" element={<Files />} />
                    <Route path="wallet" element={<Wallet />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="tfa-setup" element={<TFASetup />} />
                    <Route path="support" element={<Support />} />
                    <Route path="documentation" element={<Documentation />} />
                    <Route path="analytics" element={<ComingSoon />} />
                    <Route path="scheduler" element={<ComingSoon />} />
                    <Route path="integrations" element={<ComingSoon />} />
                    <Route path="team" element={<ComingSoon />} />
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
