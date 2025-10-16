import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import AppLayout from "./components/AppLayout";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/app/Dashboard";
import Upload from "./pages/app/Upload";
import Studies from "./pages/app/Studies";
import StudyDetail from "./pages/app/StudyDetail";
import StudyReview from "./pages/app/StudyReview";
import Wallet from "./pages/app/Wallet";
import Billing from "./pages/app/Billing";
import Profile from "./pages/app/Profile";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminClinics from "./pages/admin/Clinics";
import AdminUsers from "./pages/admin/Users";
import AdminStudies from "./pages/admin/Studies";
import AdminFinance from "./pages/admin/Finance";
import AdminPreview from "./pages/admin/Preview";
import AdminSystem from "./pages/admin/System";
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
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<AppLayout />}>
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="upload" element={<Upload />} />
                <Route path="studies" element={<Studies />} />
                <Route path="studies/:id" element={<StudyDetail />} />
                <Route path="studies/:id/review" element={<StudyReview />} />
                <Route path="wallet" element={<Wallet />} />
                <Route path="billing" element={<Billing />} />
                <Route path="profile" element={<Profile />} />
              </Route>

              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="clinics" element={<AdminClinics />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="studies" element={<AdminStudies />} />
                  <Route path="finance" element={<AdminFinance />} />
                  <Route path="system" element={<AdminSystem />} />
                </Route>
                <Route path="/admin/preview/:clinic_id" element={<AdminPreview />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
