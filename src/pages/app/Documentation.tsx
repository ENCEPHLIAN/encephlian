import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Zap, FileCheck, Workflow, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Documentation() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Platform Documentation</h1>
        <p className="text-muted-foreground">Understanding key concepts and workflows</p>
      </div>

      {/* TAT Explanation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-blue-600" />
            <CardTitle>TAT - Turn Around Time</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p><strong>Definition:</strong> The total time from when a study is uploaded until the final signed report is delivered.</p>
          <p><strong>Standard TAT:</strong> 24-48 hours for routine studies</p>
          <p><strong>How it's calculated:</strong> Upload timestamp → Final report signed timestamp</p>
          <div className="bg-muted p-4 rounded-lg mt-4">
            <p className="text-sm"><strong>Example:</strong> Study uploaded Monday 9:00 AM → Report signed Tuesday 11:00 AM = 26 hours TAT</p>
          </div>
          <div className="mt-4 space-y-2">
            <p className="font-semibold">TAT Benchmarks:</p>
            <ul className="list-disc list-inside space-y-1 ml-4 text-sm text-muted-foreground">
              <li>Routine EEG: 24-48 hours</li>
              <li>Complex cases: 48-72 hours</li>
              <li>Follow-up studies: 12-24 hours</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* STAT Explanation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-orange-600" />
            <CardTitle>STAT - Urgent Priority</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p><strong>Definition:</strong> Medical term meaning "immediately" or "urgent." STAT studies require priority review and immediate attention.</p>
          <p><strong>STAT TAT:</strong> 2-6 hours for critical cases</p>
          <div className="mt-4">
            <p className="font-semibold mb-2">When to use STAT:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li className="text-sm">
                <strong>Seizure emergencies</strong> - Active seizure activity requiring immediate interpretation
              </li>
              <li className="text-sm">
                <strong>Status epilepticus</strong> - Prolonged or repeated seizures without recovery
              </li>
              <li className="text-sm">
                <strong>ICU patients</strong> - Critical care patients requiring immediate diagnostic decisions
              </li>
              <li className="text-sm">
                <strong>Pre-surgical evaluations</strong> - Time-sensitive surgical planning
              </li>
            </ul>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg mt-4 border border-orange-200 dark:border-orange-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <p className="text-sm">
                <strong>Important:</strong> STAT designation should be reserved for true medical emergencies. 
                Overuse of STAT priority may delay truly urgent cases.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SLA Explanation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileCheck className="h-6 w-6 text-green-600" />
            <CardTitle>SLA - Service Level Agreement</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p><strong>Definition:</strong> A contractual commitment defining guaranteed turnaround times and service quality standards.</p>
          <p className="text-sm text-muted-foreground">
            SLAs provide predictability and accountability, ensuring studies are completed within agreed timeframes.
          </p>
          <div className="space-y-3 mt-4">
            <p className="font-semibold">SLA Tiers:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="h-3 w-3 rounded-full bg-green-600 shrink-0"></div>
                <div className="flex-1">
                  <span className="font-medium">Standard SLA</span>
                  <span className="text-sm text-muted-foreground ml-2">48 hours</span>
                </div>
                <Badge variant="secondary">Default</Badge>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="h-3 w-3 rounded-full bg-blue-600 shrink-0"></div>
                <div className="flex-1">
                  <span className="font-medium">Priority SLA</span>
                  <span className="text-sm text-muted-foreground ml-2">24 hours</span>
                </div>
                <Badge variant="outline">Premium</Badge>
              </div>
              <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="h-3 w-3 rounded-full bg-orange-600 shrink-0"></div>
                <div className="flex-1">
                  <span className="font-medium">STAT SLA</span>
                  <span className="text-sm text-muted-foreground ml-2">6 hours</span>
                </div>
                <Badge variant="destructive">Urgent</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Study States Flow */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Workflow className="h-6 w-6 text-purple-600" />
            <CardTitle>Study Processing Workflow</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Every study moves through these stages from upload to final delivery:
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">1</div>
              <div className="flex-1 pt-2">
                <p className="font-semibold text-blue-600">Uploaded</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Study file received and validated. System checks file format, size, and integrity.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-yellow-500 flex items-center justify-center text-white text-sm font-bold shrink-0">2</div>
              <div className="flex-1 pt-2">
                <p className="font-semibold text-yellow-600">Preprocessing</p>
                <p className="text-sm text-muted-foreground mt-1">
                  EDF parsing, channel mapping, artifact detection, and quality assessment. Automated checks ensure data quality.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">3</div>
              <div className="flex-1 pt-2">
                <p className="font-semibold text-purple-600">AI Draft</p>
                <p className="text-sm text-muted-foreground mt-1">
                  AI-generated preliminary interpretation with pattern detection, anomaly identification, and initial findings.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold shrink-0">4</div>
              <div className="flex-1 pt-2">
                <p className="font-semibold text-orange-600">In Review</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Board-certified neurologist reviewing, editing, and refining the report. Expert validation of AI findings.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold shrink-0">5</div>
              <div className="flex-1 pt-2">
                <p className="font-semibold text-green-600">Signed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Final report signed by licensed physician and delivered. Report is now available for download and distribution.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle>Best Practices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">File Preparation</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
              <li>Ensure EDF files include complete patient metadata</li>
              <li>Verify channel labels follow standard 10-20 system</li>
              <li>Include clinical indication and relevant history</li>
              <li>Check file integrity before uploading</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-2">SLA Selection</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
              <li>Use Standard SLA for routine outpatient studies</li>
              <li>Choose Priority SLA for inpatient studies needing faster results</li>
              <li>Reserve STAT SLA for true medical emergencies only</li>
              <li>Consider clinic workflow when selecting SLA tier</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Quality Assurance</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
              <li>Review AI drafts as learning tools for pattern recognition</li>
              <li>Provide feedback on reports to improve system accuracy</li>
              <li>Maintain communication with reporting neurologists</li>
              <li>Track TAT metrics to optimize clinic operations</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
