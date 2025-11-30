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
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base uppercase tracking-wide">File Storage</CardTitle>
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 text-xs h-8"
            />
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          {BUCKETS.map((bucket) => (
            <Button
              key={bucket}
              variant={selectedBucket === bucket ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedBucket(bucket)}
              className="text-[10px] h-7 px-2"
            >
              {bucket}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="h-8 text-xs">File Name</TableHead>
                  <TableHead className="h-8 text-xs">Size</TableHead>
                  <TableHead className="h-8 text-xs">Last Modified</TableHead>
                  <TableHead className="text-right h-8 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles?.map((file) => (
                  <TableRow key={file.name} className="text-xs h-10">
                    <TableCell className="font-mono text-[10px] py-2 max-w-md truncate">{file.name}</TableCell>
                    <TableCell className="text-xs py-2">
                      {file.metadata?.size ? `${(file.metadata.size / 1024).toFixed(1)} KB` : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground py-2">
                      {file.updated_at ? new Date(file.updated_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(file.name)}
                          className="h-7 px-2"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(file.name)}
                          className="h-7 px-2"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
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