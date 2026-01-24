import { useMemo, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Loader2, FileText, Download, Eye, Search, Filter, CheckCircle2, Clock, XCircle } from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";

type Report = {
  id: string;
  study_id: string;
  status: string;
  created_at: string;
  signed_at: string | null;
  pdf_path: string | null;
  interpreter: string | null;
  studies?: {
    id: string;
    sla: string;
    meta: any;
    clinics?: { name: string } | null;
  } | null;
  profiles?: {
    full_name: string | null;
  } | null;
};

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "secondary", icon: Clock },
  pending_review: { label: "Pending Review", color: "warning", icon: Clock },
  signed: { label: "Signed", color: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "destructive", icon: XCircle },
} as const;

const ITEMS_PER_PAGE = 20;

const ReportRow = memo(function ReportRow({ 
  report, 
  onView, 
  onDownload 
}: { 
  report: Report; 
  onView: (id: string) => void;
  onDownload: (report: Report) => void;
}) {
  const meta = report.studies?.meta as any;
  const statusConfig = STATUS_CONFIG[report.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender;
  const ageGenderStr = [
    patientAge ? `${patientAge}y` : null,
    patientGender ? patientGender.charAt(0).toUpperCase() : null,
  ].filter(Boolean).join("/");

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onView(report.id)}>
      <TableCell>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-xs">{report.id.slice(0, 8)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div>
          <span className="font-medium">{meta?.patient_name || "Unknown"}</span>
          {ageGenderStr && (
            <span className="text-xs text-muted-foreground ml-1">({ageGenderStr})</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {meta?.patient_id || report.study_id?.slice(0, 8)}
        </div>
      </TableCell>
      <TableCell>{report.studies?.clinics?.name || "—"}</TableCell>
      <TableCell>
        <Badge variant={statusConfig.color as any}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{report.studies?.sla || "—"}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {dayjs(report.created_at).format("MMM D, YYYY")}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {report.signed_at ? dayjs(report.signed_at).format("MMM D, h:mm A") : "—"}
      </TableCell>
      <TableCell>{report.profiles?.full_name || "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onView(report.id)}>
            <Eye className="h-4 w-4" />
          </Button>
          {report.pdf_path && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDownload(report)}>
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function Reports() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ["reports-list"],
    queryFn: async () => {
      // Show only real user reports (exclude sample)
      const { data, error } = await supabase
        .from("reports")
        .select(`
          id, study_id, status, created_at, signed_at, pdf_path, interpreter,
          studies!inner(id, sla, meta, sample, clinics(name)),
          profiles:interpreter(full_name)
        `)
        .or(`studies.sample.is.null,studies.sample.eq.false`)
        .order("created_at", { ascending: false })
        .limit(500);
      
      if (error) throw error;
      return data as Report[];
    },
    staleTime: 30000,
  });

  const filteredReports = useMemo(() => {
    if (!reports) return [];
    
    return reports.filter((report) => {
      // Status filter
      if (statusFilter !== "all" && report.status !== statusFilter) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const meta = report.studies?.meta as any;
        const matchesPatient = meta?.patient_name?.toLowerCase().includes(searchLower);
        const matchesPatientId = meta?.patient_id?.toLowerCase().includes(searchLower);
        const matchesReportId = report.id.toLowerCase().includes(searchLower);
        const matchesClinic = report.studies?.clinics?.name?.toLowerCase().includes(searchLower);
        
        if (!matchesPatient && !matchesPatientId && !matchesReportId && !matchesClinic) {
          return false;
        }
      }
      
      return true;
    });
  }, [reports, search, statusFilter]);

  const paginatedReports = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredReports.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReports, page]);

  const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE);

  const handleView = (reportId: string) => {
    navigate(`/app/reports/${reportId}`);
  };

  const handleDownload = async (report: Report) => {
    if (!report.pdf_path) {
      toast.error("No PDF available for this report");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("reports")
        .download(report.pdf_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${report.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Failed to download report", { description: err?.message });
    }
  };

  // Stats
  const stats = useMemo(() => {
    if (!reports) return { total: 0, signed: 0, pending: 0, draft: 0 };
    return {
      total: reports.length,
      signed: reports.filter(r => r.status === "signed").length,
      pending: reports.filter(r => r.status === "pending_review").length,
      draft: reports.filter(r => r.status === "draft").length,
    };
  }, [reports]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            View and manage generated reports
          </p>
        </div>
        <Button onClick={() => navigate("/app/report-v0")}>
          Generate Report
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.signed}</div>
            <p className="text-xs text-muted-foreground">Signed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-muted-foreground">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">Drafts</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient, ID, or clinic..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card>
        <CardContent className="pt-4">
          {paginatedReports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {filteredReports.length === 0 && !search && statusFilter === "all"
                  ? "No reports generated yet"
                  : "No reports match your filters"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report ID</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Clinic</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Signed</TableHead>
                      <TableHead>Interpreter</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedReports.map((report) => (
                      <ReportRow
                        key={report.id}
                        report={report}
                        onView={handleView}
                        onDownload={handleDownload}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, filteredReports.length)} of {filteredReports.length}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setPage(pageNum)}
                              isActive={page === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
