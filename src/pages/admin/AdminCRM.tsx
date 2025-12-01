import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Wallet, MessageSquare, FileText, Activity, Building2, UserCog, Shield } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import WalletManagement from "@/components/admin/WalletManagement";
import TicketManagement from "@/components/admin/TicketManagement";
import FileManagement from "@/components/admin/FileManagement";
import ActivityLog from "@/components/admin/ActivityLog";
import SystemHealthMonitor from "@/components/admin/SystemHealthMonitor";
import ClinicManagement from "@/components/admin/ClinicManagement";
import PaaSUserManagement from "@/components/admin/PaaSUserManagement";
import InternalTeamManagement from "@/components/admin/InternalTeamManagement";

export default function AdminCRM() {
  const [activeTab, setActiveTab] = useState("paas");

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono">
                OPERATIONS CONTROL
              </h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                ENCEPHLIAN PLATFORM MANAGEMENT • TRL-4 PROTOTYPE
              </p>
            </div>
            <SystemHealthMonitor />
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-8 w-full max-w-6xl">
            <TabsTrigger value="paas" className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              PaaS Users
            </TabsTrigger>
            <TabsTrigger value="clinics" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Clinics
            </TabsTrigger>
            <TabsTrigger value="internal" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Internal
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              All Users
            </TabsTrigger>
            <TabsTrigger value="wallets" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="tickets" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Tickets
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Files
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="paas" className="m-0">
              <PaaSUserManagement />
            </TabsContent>
            
            <TabsContent value="clinics" className="m-0">
              <ClinicManagement />
            </TabsContent>
            
            <TabsContent value="internal" className="m-0">
              <InternalTeamManagement />
            </TabsContent>
            
            <TabsContent value="users" className="m-0">
              <UserManagement />
            </TabsContent>
            
            <TabsContent value="wallets" className="m-0">
              <WalletManagement />
            </TabsContent>
            
            <TabsContent value="tickets" className="m-0">
              <TicketManagement />
            </TabsContent>
            
            <TabsContent value="files" className="m-0">
              <FileManagement />
            </TabsContent>
            
            <TabsContent value="activity" className="m-0">
              <ActivityLog />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
