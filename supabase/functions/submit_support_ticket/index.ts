import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Generate a short memorable reference ID
function generateReferenceId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "TKT-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { subject, message } = await req.json();

    if (!subject?.trim() || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: "Subject and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    // Generate memorable reference ID
    const referenceId = generateReferenceId();

    // Insert ticket
    const { data: ticket, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        subject: `[${referenceId}] ${subject.trim()}`,
        message: message.trim(),
        status: "open"
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Send confirmation email to clinician
    if (RESEND_API_KEY) {
      try {
        // Email to clinician (confirmation)
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "ENCEPHLIAN Support <support@encephlian.cloud>",
            to: [user.email],
            subject: `Support Ticket Received - ${referenceId}`,
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #ffffff; font-size: 24px; margin: 0;">ENCEPHLIAN</h1>
                  <p style="color: #64748b; font-size: 12px; margin-top: 4px; letter-spacing: 2px;">CLINICAL EEG PLATFORM</p>
                </div>
                
                <div style="background: #1e293b; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
                  <h2 style="color: #22c55e; margin: 0 0 16px 0; font-size: 18px;">✓ Ticket Received</h2>
                  <p style="margin: 0; color: #94a3b8;">We have received your support request and our team will respond shortly.</p>
                </div>

                <div style="background: #1e293b; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                    <span style="color: #64748b;">Reference ID</span>
                    <span style="color: #ffffff; font-family: monospace; font-size: 18px; font-weight: bold;">${referenceId}</span>
                  </div>
                  <div style="margin-bottom: 16px;">
                    <span style="color: #64748b;">Subject</span>
                    <p style="color: #ffffff; margin: 8px 0 0 0;">${subject}</p>
                  </div>
                  <div>
                    <span style="color: #64748b;">Your Message</span>
                    <p style="color: #94a3b8; margin: 8px 0 0 0; white-space: pre-wrap;">${message}</p>
                  </div>
                </div>

                <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px;">
                  Please keep this reference ID for your records. You can reply to this email for follow-ups.
                </p>
                
                <hr style="border: none; border-top: 1px solid #334155; margin: 30px 0;" />
                <p style="color: #475569; font-size: 11px; text-align: center;">
                  ENCEPHLIAN © 2025 • Clinical EEG Analysis Platform
                </p>
              </div>
            `,
          }),
        });

        // Email to support team
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "ENCEPHLIAN Support <support@encephlian.cloud>",
            to: ["info@encephlian.cloud"],
            subject: `🎫 New Ticket ${referenceId}: ${subject}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0284c7; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  New Support Ticket
                </h2>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 8px 0;"><strong>Reference:</strong> <code style="background: #0284c7; color: white; padding: 2px 8px; border-radius: 4px;">${referenceId}</code></p>
                  <p style="margin: 8px 0;"><strong>From:</strong> ${profile?.full_name || user.email}</p>
                  <p style="margin: 8px 0;"><strong>Email:</strong> ${user.email}</p>
                  <p style="margin: 8px 0;"><strong>Ticket ID:</strong> <code>${ticket.id}</code></p>
                  <p style="margin: 8px 0;"><strong>Created:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <div style="margin: 20px 0;">
                  <h3 style="color: #334155; margin-bottom: 10px;">Subject</h3>
                  <p style="background: #fff; padding: 12px; border-left: 4px solid #0284c7; border-radius: 4px;">
                    ${subject}
                  </p>
                </div>
                <div style="margin: 20px 0;">
                  <h3 style="color: #334155; margin-bottom: 10px;">Message</h3>
                  <div style="background: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 4px; white-space: pre-wrap;">
${message}
                  </div>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
                <p style="color: #64748b; font-size: 12px; text-align: center;">
                  ENCEPHLIAN Support System • Automated Notification
                </p>
              </div>
            `,
          }),
        });

        console.log("Support emails sent successfully");
      } catch (emailError) {
        console.error("Email sending error:", emailError);
      }
    } else {
      console.warn("RESEND_API_KEY not configured - emails not sent");
    }

    // Log audit event
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      event_type: "support_ticket_created",
      event_data: { ticket_id: ticket.id, reference_id: referenceId, subject }
    });

    console.log("Support ticket created:", ticket.id, "Reference:", referenceId);

    return new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id, reference_id: referenceId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating support ticket:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});