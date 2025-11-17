import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
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
import ComingSoon from "./pages/app/ComingSoon";
import NotFound from "./pages/NotFound";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
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
                <Route path="analytics" element={<ComingSoon feature="Analytics" />} />
                <Route path="team" element={<ComingSoon feature="Team" />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
