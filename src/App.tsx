import { Toaster } from "@/components/ui/toaster";
import AdminCleanup from "@/pages/admin/AdminCleanup";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ProfileProvider } from "@/contexts/ProfileContext";
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
import Dashboard from "./pages/app/Dashboard";
import Studies from "./pages/app/Studies";
import StudyDetail from "./pages/app/StudyDetail";
import StudyReview from "./pages/app/StudyReview";
import EEGViewer from "./pages/app/EEGViewer";
import Files from "./pages/app/Files";
import Wallet from "./pages/app/Wallet";
import Profile from "./pages/app/Profile";
import Settings from "./pages/app/Settings";
import Notes from "./pages/app/Notes";
import Support from "./pages/app/Support";
import Documentation from "./pages/app/Documentation";
import Templates from "./pages/app/Templates";
import NotFound from "./pages/NotFound";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ProfileProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="/app" element={<AppLayout />}>
                    <Route index element={<Navigate to="/app/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="studies" element={<Studies />} />
                    <Route path="studies/:id" element={<StudyDetail />} />
                    <Route path="studies/:id/review" element={<StudyReview />} />
                    <Route path="studies/:id/viewer" element={<EEGViewer />} />
                    <Route path="viewer" element={<EEGViewer />} />
                    <Route path="notes" element={<Notes />} />
                    <Route path="files" element={<Files />} />
                    <Route path="wallet" element={<Wallet />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="templates" element={<Templates />} />
                    <Route path="support" element={<Support />} />
                    <Route path="documentation" element={<Documentation />} />
                  </Route>

                  {/* Admin Routes */}
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="studies" element={<AdminStudies />} />
                      <Route path="studies/:id" element={<AdminStudyDetail />} />
                      <Route path="clinics" element={<AdminClinics />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="health" element={<AdminHealth />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </ProfileProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
