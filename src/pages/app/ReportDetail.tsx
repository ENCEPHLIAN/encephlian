import { useParams } from "react-router-dom";

export default function ReportDetail() {
  const { id } = useParams();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Report Detail</h1>
      <p className="text-sm text-muted-foreground mt-2">Report ID: {id}</p>
    </div>
  );
}
