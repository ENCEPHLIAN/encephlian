import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pin, Download, Trash2, Search, Loader2, StickyNote } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import dayjs from "dayjs";

interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
}

export default function Notes() {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notes, isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      
      if (error) throw error;
      return data as Note[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (note: { title: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      
      const { data, error } = await supabase
        .from("notes")
        .insert([{ ...note, user_id: user.id }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setIsCreating(false);
      toast({ title: "Note created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Note> }) => {
      const { data, error } = await supabase
        .from("notes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast({ title: "Note updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setSelectedNote(null);
      toast({ title: "Note deleted successfully" });
    },
  });

  const handleOpenNote = (note: Note) => {
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditTitle("");
    setEditContent("");
  };

  const handleSave = () => {
    if (!editTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    if (isCreating) {
      createMutation.mutate({ title: editTitle, content: editContent });
    } else if (selectedNote) {
      updateMutation.mutate({
        id: selectedNote.id,
        updates: { title: editTitle, content: editContent },
      });
      setSelectedNote(null);
    }
  };

  const handleTogglePin = (note: Note) => {
    updateMutation.mutate({
      id: note.id,
      updates: { is_pinned: !note.is_pinned },
    });
  };

  const handleDownload = () => {
    const blob = new Blob([editContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${editTitle || "note"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredNotes = notes?.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Notes</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Your private notes and annotations</p>
        </div>
        <Button onClick={handleCreateNew} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Note
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Notes Grid */}
      {filteredNotes?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <StickyNote className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No notes yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first note to get started</p>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Note
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes?.map((note) => (
            <Card
              key={note.id}
              className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
              onClick={() => handleOpenNote(note)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-base sm:text-lg line-clamp-1">{note.title}</CardTitle>
                {note.is_pinned && (
                  <Pin className="h-4 w-4 text-primary flex-shrink-0" />
                )}
              </CardHeader>
              <CardContent>
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 mb-4">
                  {note.content || "Empty note"}
                </p>
                <div className="text-xs text-muted-foreground">
                  {dayjs(note.updated_at).format("MMM D, YYYY h:mm A")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Note Editor Dialog */}
      <Dialog open={!!selectedNote || isCreating} onOpenChange={(open) => {
        if (!open) {
          setSelectedNote(null);
          setIsCreating(false);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <Input
              placeholder="Note title..."
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-xl sm:text-2xl font-bold border-none focus-visible:ring-0 px-0"
            />
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <Textarea
              placeholder="Start typing..."
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[300px] sm:min-h-[400px] resize-none border-none focus-visible:ring-0 text-sm sm:text-base"
            />
          </ScrollArea>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedNote && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleTogglePin(selectedNote)}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Pin className="h-4 w-4 mr-2" />
                  {selectedNote.is_pinned ? "Unpin" : "Pin"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(selectedNote.id)}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </>
            )}
            <Button onClick={handleSave} size="sm" className="w-full sm:w-auto">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
