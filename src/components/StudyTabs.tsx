import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

interface Study {
  id: string;
  name: string;
}

const MAX_TABS = 5;
const STORAGE_KEY = "open-studies";

export default function StudyTabs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studyId = searchParams.get("studyId");
  
  const [openStudies, setOpenStudies] = useState<Study[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(openStudies));
  }, [openStudies]);

  useEffect(() => {
    if (studyId && !openStudies.find(s => s.id === studyId)) {
      if (openStudies.length >= MAX_TABS) {
        setOpenStudies(prev => [...prev.slice(1), { id: studyId, name: `Study ${studyId.slice(0, 6)}` }]);
      } else {
        setOpenStudies(prev => [...prev, { id: studyId, name: `Study ${studyId.slice(0, 6)}` }]);
      }
    }
  }, [studyId]);

  const closeStudy = (id: string) => {
    setOpenStudies(prev => prev.filter(s => s.id !== id));
    if (studyId === id && openStudies.length > 1) {
      const nextStudy = openStudies.find(s => s.id !== id);
      if (nextStudy) {
        navigate(`/app/viewer?studyId=${nextStudy.id}`);
      }
    }
  };

  const handleTabChange = (value: string) => {
    navigate(`/app/viewer?studyId=${value}`);
  };

  if (openStudies.length === 0) return null;

  return (
    <Tabs value={studyId || ""} onValueChange={handleTabChange} className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0">
        {openStudies.map(study => (
          <TabsTrigger 
            key={study.id} 
            value={study.id}
            className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
          >
            {study.name}
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4 ml-2 hover:bg-destructive/20"
              onClick={(e) => {
                e.stopPropagation();
                closeStudy(study.id);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </TabsTrigger>
        ))}
        {openStudies.length < MAX_TABS && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={() => navigate("/app/studies")}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Study
          </Button>
        )}
      </TabsList>
    </Tabs>
  );
}
