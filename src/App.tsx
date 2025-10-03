import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import { AdminLayout } from "./components/AdminLayout";
import Overview from "./pages/admin/Overview";
import Clinics from "./pages/admin/Clinics";
import Users from "./pages/admin/Users";
import Studies from "./pages/admin/Studies";
import Reports from "./pages/admin/Reports";
import QA from "./pages/admin/QA";
import Billing from "./pages/admin/Billing";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="overview" element={<Overview />} />
            <Route path="clinics" element={<Clinics />} />
            <Route path="users" element={<Users />} />
            <Route path="studies" element={<Studies />} />
            <Route path="reports" element={<Reports />} />
            <Route path="qa" element={<QA />} />
            <Route path="billing" element={<Billing />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
