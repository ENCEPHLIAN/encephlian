import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const body = await req.json();
    const study_id = body.study_id;
    const email_enabled = body.email_enabled;
    
    console.log("send_triage_notification called with:", { study_id, email_enabled });
    
    if (!study_id) {
      return new Response(
        JSON.stringify({ error: "study_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if emails are enabled (passed from client-side setting)
    // Explicitly check for false to skip emails
    if (email_enabled === false) {
      console.log("Email notifications DISABLED - skipping Resend API call");
      return new Response(
        JSON.stringify({ success: true, message: "Email skipped (disabled by admin)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Email notifications ENABLED - proceeding with Resend API call");
    
    // Get study and user info
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("*, owner")
      .eq("id", study_id)
      .single();
    
    if (studyError || !study) {
      console.error("Study not found:", studyError);
      return new Response(
        JSON.stringify({ error: "Study not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", study.owner)
      .single();
    
    if (!profile?.email) {
      console.log("No email found for user:", study.owner);
      return new Response(
        JSON.stringify({ success: true, message: "No email to send" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const meta = study.meta || {};
    const patientId = meta.patient_id || `ID-${study_id.slice(0, 8)}`;
    
    // Send email if Resend API key is configured
    if (resendApiKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ENCEPHLIAN <noreply@encephlian.cloud>",
          to: profile.email,
          subject: `Triage Complete: ${patientId}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0ea5e9;">EEG Triage Complete</h2>
              <p>Hello ${profile.full_name || "Clinician"},</p>
              <p>The triage analysis for <strong>${patientId}</strong> has been completed.</p>
              <p>You can now view the report and analysis results in your dashboard.</p>
              <div style="margin: 24px 0;">
                <a href="${supabaseUrl.replace('.supabase.co', '')}/app/studies/${study_id}" 
                   style="background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                  View Report
                </a>
              </div>
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from ENCEPHLIAN.
              </p>
            </div>
          `,
        }),
      });
      
      if (!emailRes.ok) {
        const emailError = await emailRes.text();
        console.error("Email send error:", emailError);
      } else {
        console.log("Triage notification sent to:", profile.email);
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping email");
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Error in send_triage_notification:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
