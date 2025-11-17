import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookOpen, MessageSquare, Mail, FileQuestion } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Support() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support Center</h1>
        <p className="text-muted-foreground">Get help and find answers to your questions</p>
      </div>

      {/* Quick Help Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/app/documentation')}>
          <CardHeader>
            <BookOpen className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Browse comprehensive guides about TAT, STAT, SLA and workflows
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow opacity-60">
          <CardHeader>
            <MessageSquare className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Live Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Chat with our support team in real-time
            </p>
            <Badge variant="secondary">Coming Soon</Badge>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <Mail className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Email Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Send us an email at{" "}
              <a href="mailto:support@eegplatform.com" className="text-primary hover:underline">
                support@eegplatform.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileQuestion className="h-5 w-5" />
            Submit a Support Ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Subject" />
          <Textarea placeholder="Describe your issue in detail..." rows={6} />
          <Button>Submit Ticket</Button>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>What is TAT (Turn Around Time)?</AccordionTrigger>
              <AccordionContent>
                TAT is the total time from when a study is uploaded until the final signed report is delivered. 
                Standard TAT is typically 24-48 hours for routine studies.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>What does STAT mean?</AccordionTrigger>
              <AccordionContent>
                STAT is a medical term meaning "immediately" or "urgent." STAT studies require priority review 
                and typically have a TAT of 2-6 hours. Use STAT for seizure emergencies, status epilepticus, 
                ICU patients, or pre-surgical evaluations with time constraints.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>What is SLA (Service Level Agreement)?</AccordionTrigger>
              <AccordionContent>
                SLA is a contractual commitment defining guaranteed turnaround times and service quality. 
                We offer three tiers: Standard SLA (48 hours), Priority SLA (24 hours), and STAT SLA (6 hours).
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>How do I upload EEG studies?</AccordionTrigger>
              <AccordionContent>
                Navigate to the Files page and select the "EEG Studies" bucket. You can drag and drop .edf files 
                or click to browse. The system automatically processes and parses your EEG data.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>What file formats are supported?</AccordionTrigger>
              <AccordionContent>
                We support EDF (European Data Format) files, which is the standard format for EEG recordings. 
                Files should contain proper channel information and metadata.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger>How do tokens work?</AccordionTrigger>
              <AccordionContent>
                Tokens are required for signing reports. Each signed report consumes tokens based on the 
                complexity and SLA tier. You can purchase tokens from the Wallet page.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
