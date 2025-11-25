import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookOpen, MessageSquare, Mail, FileQuestion } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Support() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing details",
        description: "Please add a subject and description before submitting.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Call edge function that stores ticket + sends email
      const { error } = await supabase.functions.invoke("submit_support_ticket", {
        body: {
          subject,
          message,
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Ticket submitted",
        description: "We’ve received your request and will respond via email.",
      });

      setSubject("");
      setMessage("");
    } catch (err: any) {
      toast({
        title: "Unable to submit ticket",
        description: err.message ?? "Please try again in a few minutes.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support Center</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Get help and find answers to your questions.</p>
      </div>

      {/* Quick Help Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md hover:border-border/80 transition-all"
          onClick={() => navigate("/app/documentation")}
        >
          <CardHeader className="space-y-2">
            <BookOpen className="h-7 w-7 text-primary" />
            <CardTitle className="text-base">Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Browse guides on TAT, STAT, SLA tiers and review workflows.
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-none opacity-60">
          <CardHeader className="space-y-2">
            <MessageSquare className="h-7 w-7 text-primary" />
            <CardTitle className="text-base">Live Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
              Chat with our support team in real time.
            </p>
            <Badge variant="secondary">Coming Soon</Badge>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md hover:border-border/80 transition-all">
          <CardHeader className="space-y-2">
            <Mail className="h-7 w-7 text-primary" />
            <CardTitle className="text-base">Email Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Email us at{" "}
              <a href="mailto:info@encephlian.cloud" className="font-medium text-primary hover:underline">
                info@encephlian.cloud
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Form */}
      <Card className="openai-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileQuestion className="h-5 w-5" />
            Submit a Support Ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea
            placeholder="Describe your issue in detail…"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button onClick={handleSubmitTicket} disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? "Submitting…" : "Submit Ticket"}
          </Button>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card className="openai-card">
        <CardHeader>
          <CardTitle className="text-base">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-sm md:text-base font-medium">
                What is TAT (Turnaround Time)?
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                TAT is the total time from when a study is uploaded until the final signed report is delivered. Standard
                TAT is typically 24–48 hours for routine studies.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger className="text-sm md:text-base font-medium">What does STAT mean?</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                STAT is a medical term meaning &quot;immediately&quot; or &quot;urgent.&quot; STAT studies require
                priority review and typically have a TAT of 2–6 hours. Use STAT for seizure emergencies, status
                epilepticus, ICU patients, or pre-surgical evaluations with time constraints.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger className="text-sm md:text-base font-medium">
                What is SLA (Service Level Agreement)?
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                SLA is a contractual commitment defining guaranteed turnaround times and service quality. We offer three
                tiers: Standard SLA (48 hours), Priority SLA (24 hours), and STAT SLA (6 hours).
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger className="text-sm md:text-base font-medium">How do I upload studies?</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                Go to the Files page and select the &quot;EEG Studies&quot; bucket. Drag and drop .edf files or click to
                browse. The system automatically processes and parses your EEG data.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger className="text-sm md:text-base font-medium">
                What file formats are supported?
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                We support EDF (European Data Format) files, the standard format for EEG recordings. Files should
                contain proper channel information and metadata.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger className="text-sm md:text-base font-medium">How do tokens work?</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                Tokens are required for signing reports. Each signed report consumes tokens based on complexity and SLA
                tier. You can purchase tokens from the Wallet page.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
