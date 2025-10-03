import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="container px-4">
        <div className="text-center space-y-6">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Encephlian Admin
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Clinical Research Management System
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/auth">Sign In to Admin</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
