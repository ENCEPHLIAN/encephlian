import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
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

    const { email, feature, email_enabled } = await req.json();

    // Check if emails are enabled (passed from frontend based on localStorage)
    if (email_enabled === false) {
      console.log("Email notifications disabled by admin setting");
      return new Response(
        JSON.stringify({ success: true, message: "Email skipped (disabled)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email?.trim() || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ENCEPHLIAN <noreply@encephlian.cloud>",
        to: ["info@encephlian.cloud"],
        subject: `Waitlist Signup: ${feature || "AI Anomaly Detection"}`,
        html: `
          <h2>New Waitlist Signup</h2>
          <p><strong>Name:</strong> ${profile?.full_name || "Unknown"}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Feature:</strong> ${feature || "AI Anomaly Detection"}</p>
          <p><strong>User ID:</strong> ${user.id}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error("Failed to send email notification");
    }

    // Log audit event
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      event_type: "waitlist_joined",
      event_data: { email, feature: feature || "AI Anomaly Detection" }
    });

    console.log("Waitlist signup processed:", email);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing waitlist:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
