import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Wallet, MessageSquare, FileText, Activity, Shield } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import WalletManagement from "@/components/admin/WalletManagement";
import TicketManagement from "@/components/admin/TicketManagement";
import FileManagement from "@/components/admin/FileManagement";
import ActivityLog from "@/components/admin/ActivityLog";
import TeamManagement from "@/components/admin/TeamManagement";
import OperationalStatus from "@/components/OperationalStatus";

export default function AdminCRM() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">ENCEPHLIAN CRM</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Administrative control panel • Operations dashboard
              </p>
            </div>
            <OperationalStatus />
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-6 w-full max-w-4xl">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Team
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
            <TabsContent value="users" className="m-0">
              <UserManagement />
            </TabsContent>
            
            <TabsContent value="team" className="m-0">
              <TeamManagement />
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
