import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

    const { subject, message, check_email_enabled } = await req.json();

    // Check if emails are enabled (passed from frontend based on localStorage)
    if (check_email_enabled === false) {
      console.log("Email notifications disabled by admin setting");
      return new Response(
        JSON.stringify({ success: true, message: "Email skipped (disabled)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Insert ticket
    const { data: ticket, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        subject: subject.trim(),
        message: message.trim(),
        status: "open"
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Only send email if Resend API key is configured and emails are enabled
    if (RESEND_API_KEY && check_email_enabled !== false) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "ENCEPHLIAN Support <support@encephlian.cloud>",
            to: ["info@encephlian.cloud"],
            subject: `🎫 Support Ticket #${ticket.id.slice(0, 8)}: ${subject}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0284c7; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  New Support Ticket
                </h2>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
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

        if (!emailRes.ok) {
          const errorText = await emailRes.text();
          console.error("Resend API error:", errorText);
        } else {
          console.log("Support email sent successfully");
        }
      } catch (emailError) {
        console.error("Email sending error:", emailError);
      }
    } else {
      console.log("Email skipped - RESEND_API_KEY not configured or emails disabled");
    }

    // Log audit event
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      event_type: "support_ticket_created",
      event_data: { ticket_id: ticket.id, subject }
    });

    console.log("Support ticket created:", ticket.id);

    return new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id }),
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
