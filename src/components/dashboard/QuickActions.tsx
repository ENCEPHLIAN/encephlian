import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { PlayCircle, Edit, Search, Coins } from "lucide-react";

interface QuickActionsProps {
  pendingStudies: any[];
  tokenBalance: number;
}

export default function QuickActions({ pendingStudies, tokenBalance }: QuickActionsProps) {
  const navigate = useNavigate();
  
  const oldestPending = pendingStudies[0];
  const draftStudy = pendingStudies.find(s => s.state === 'in_review' || s.state === 'ai_draft');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            size="lg"
            className="h-auto py-4 flex-col gap-2"
            onClick={() => oldestPending && navigate(`/app/studies/${oldestPending.id}/viewer`)}
            disabled={!oldestPending}
          >
            <PlayCircle className="h-5 w-5" />
            <span>Start New Review</span>
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            className="h-auto py-4 flex-col gap-2"
            onClick={() => draftStudy && navigate(`/app/studies/${draftStudy.id}/review`)}
            disabled={!draftStudy}
          >
            <Edit className="h-5 w-5" />
            <span>Continue Draft</span>
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            className="h-auto py-4 flex-col gap-2"
            onClick={() => navigate("/app/studies")}
          >
            <Search className="h-5 w-5" />
            <span>Search Studies</span>
          </Button>
          
          <Button
            size="lg"
            variant={tokenBalance < 10 ? "destructive" : "outline"}
            className="h-auto py-4 flex-col gap-2"
            onClick={() => navigate("/app/wallet")}
          >
            <Coins className="h-5 w-5" />
            <span>Buy Tokens</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
