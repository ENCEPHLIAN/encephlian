import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookOpen, MessageSquare, Mail, FileQuestion } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Support() {
  const navigate = useNavigate();

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Support Center</h1>
        <p className="text-muted-foreground">Everything you need to keep your EEG workflow running smoothly.</p>
      </div>

      {/* Quick Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Documentation */}
        <Card
          className="openai-card hover:shadow-md transition cursor-pointer"
          onClick={() => navigate("/app/documentation")}
        >
          <CardHeader className="space-y-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-lg font-semibold">Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Learn everything about TAT, STAT, uploads, triage workflows, tokens, and more.
            </p>
          </CardContent>
        </Card>

        {/* Live Chat (Coming soon) */}
        <Card className="openai-card opacity-60 hover:opacity-75 transition relative">
          <CardHeader className="space-y-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-secondary/40 border border-border">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg font-semibold">Live Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Realtime help right inside the platform.
            </p>
            <Badge variant="secondary">Coming Soon</Badge>
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="openai-card hover:shadow-md transition">
          <CardHeader className="space-y-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-accent/40 border border-border">
              <Mail className="h-5 w-5 text-accent-foreground" />
            </div>
            <CardTitle className="text-lg font-semibold">Email Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Write to us at{" "}
              <a href="mailto:support@eegplatform.com" className="text-primary hover:underline">
                support@eegplatform.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Support Ticket Form */}
      <Card className="openai-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileQuestion className="h-5 w-5 text-primary" />
            Submit a Support Ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Subject" className="bg-background" />
          <Textarea
            placeholder="Describe your issue clearly (e.g., study ID, browser, device, upload error)"
            rows={6}
            className="bg-background"
          />
          <Button className="w-full">Submit Ticket</Button>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="openai-card">
        <CardHeader>
          <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="1">
              <AccordionTrigger>What is TAT (Turnaround Time)?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Standard non-urgent routine EEG reports are delivered in 24–48 hours.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="2">
              <AccordionTrigger>What is STAT?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Urgent studies requiring 2–6 hour processing. Used for ICU/seizure emergency cases.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="3">
              <AccordionTrigger>What is SLA?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                The guaranteed delivery tier: Standard (48h), Priority (24h), STAT (6h).
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="4">
              <AccordionTrigger>How do I upload studies?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Go to **Files → EEG Studies** and upload .edf files. Parsing is automatic.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="5">
              <AccordionTrigger>What formats are supported?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                EDF only. Internal converters soon for Natus/Nicolet `.e` files.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="6">
              <AccordionTrigger>How do tokens work?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                1 token = TAT signing. 2 tokens = STAT signing. Buy from the Wallet section.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
