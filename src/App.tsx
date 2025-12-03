import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ProfileProvider } from "@/contexts/ProfileContext";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/admin/AdminRoute";
import AppLayout from "./components/AppLayout";
import AdminCRM from "./pages/admin/AdminCRM";
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
import ComingSoon from "./pages/app/ComingSoon";
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
                    <Route path="analytics" element={<ComingSoon feature="Analytics" />} />
                    <Route path="templates" element={<Templates />} />
                    <Route path="scheduler" element={<ComingSoon feature="Scheduler" />} />
                    <Route path="integrations" element={<ComingSoon feature="Integrations" />} />
                    <Route path="team" element={<ComingSoon feature="Team" />} />
                    <Route path="support" element={<Support />} />
                    <Route path="documentation" element={<Documentation />} />
                  </Route>

                  {/* Admin CRM Route */}
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminCRM />} />
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
