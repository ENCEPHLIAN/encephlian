import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Wallet, MessageSquare, FileText, Activity, Shield } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import WalletManagement from "@/components/admin/WalletManagement";
import TicketManagement from "@/components/admin/TicketManagement";
import FileManagement from "@/components/admin/FileManagement";
import ActivityLog from "@/components/admin/ActivityLog";
import TeamManagement from "@/components/admin/TeamManagement";

export default function AdminCRM() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1800px] mx-auto space-y-4">
        {/* Header */}
        <div className="border-b border-border pb-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase">ENCEPHLIAN CRM</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">
            Administrative control panel • Operations dashboard
          </p>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-6 w-full max-w-4xl h-9 text-xs">
            <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Users
            </TabsTrigger>
            <TabsTrigger value="wallets" className="flex items-center gap-1.5 text-xs">
              <Wallet className="h-3.5 w-3.5" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="tickets" className="flex items-center gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              Tickets
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Files
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Team
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Activity
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
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
            
            <TabsContent value="team" className="m-0">
              <TeamManagement />
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
