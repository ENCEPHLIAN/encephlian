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
import Upload from "./pages/app/Upload";
import Studies from "./pages/app/Studies";
import StudyDetail from "./pages/app/StudyDetail";
import Wallet from "./pages/app/Wallet";
import Billing from "./pages/app/Billing";
import Profile from "./pages/app/Profile";
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
                <Route path="wallet" element={<Wallet />} />
                <Route path="billing" element={<Billing />} />
                <Route path="profile" element={<Profile />} />
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
