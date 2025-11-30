import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const BUCKETS = ["eeg-uploads", "eeg-raw", "eeg-clean", "eeg-reports", "notes", "templates"];

export default function FileManagement() {
  const [selectedBucket, setSelectedBucket] = useState("eeg-uploads");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: files, isLoading } = useQuery({
    queryKey: ["admin-files", selectedBucket],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(selectedBucket).list();
      if (error) throw error;
      return data;
    }
  });

  const handleDownload = async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(selectedBucket)
        .download(fileName);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("File downloaded");
    } catch (error: any) {
      toast.error(error.message || "Failed to download file");
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm(`Delete ${fileName}?`)) return;

    try {
      const { error } = await supabase.storage
        .from(selectedBucket)
        .remove([fileName]);

      if (error) throw error;
      toast.success("File deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete file");
    }
  };

  const filteredFiles = files?.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>File Storage</CardTitle>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {BUCKETS.map((bucket) => (
            <Button
              key={bucket}
              variant={selectedBucket === bucket ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedBucket(bucket)}
            >
              {bucket}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles?.map((file) => (
                  <TableRow key={file.name}>
                    <TableCell className="font-mono text-xs">{file.name}</TableCell>
                    <TableCell>
                      {file.metadata?.size ? `${(file.metadata.size / 1024).toFixed(2)} KB` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {file.updated_at ? new Date(file.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(file.name)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(file.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
