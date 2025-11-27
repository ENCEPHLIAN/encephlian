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

    const { payment_id, order_id, amount_inr, tokens } = await req.json();

    if (!payment_id || !order_id || !amount_inr || !tokens) {
      throw new Error("Missing required fields");
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    if (!RESEND_API_KEY) {
      console.log("Resend API key not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, message: "Email skipped (no API key)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receiptDate = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "short"
    });

    // Send to user
    const userEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ENCEPHLIAN <noreply@encephlian.cloud>",
        to: [user.email],
        subject: `Payment Receipt - ${tokens} Tokens Purchased`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0ea5e9;">Payment Successful ✓</h2>
            <p>Dear ${profile?.full_name || "Valued Customer"},</p>
            <p>Thank you for your payment. Your tokens have been credited to your account.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0;"><strong>Order ID:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${order_id}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Payment ID:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${payment_id}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Tokens Purchased:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${tokens}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Amount Paid:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">₹${amount_inr.toLocaleString("en-IN")}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Date & Time:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${receiptDate}</td>
                </tr>
              </table>
            </div>
            
            <p>Your tokens are now available in your wallet and can be used to sign reports.</p>
            <p style="margin-top: 30px; color: #6b7280; font-size: 12px;">
              This is an automated receipt from ENCEPHLIAN. For support, contact info@encephlian.cloud
            </p>
          </div>
        `,
      }),
    });

    if (!userEmailRes.ok) {
      console.error("Failed to send user email:", await userEmailRes.text());
    }

    // Send copy to info@encephlian.cloud
    const adminEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ENCEPHLIAN <noreply@encephlian.cloud>",
        to: ["info@encephlian.cloud"],
        subject: `Payment Received - ${tokens} tokens - ${user.email}`,
        html: `
          <h3>Payment Notification</h3>
          <p><strong>User:</strong> ${profile?.full_name || user.email} (${user.email})</p>
          <p><strong>Order ID:</strong> ${order_id}</p>
          <p><strong>Payment ID:</strong> ${payment_id}</p>
          <p><strong>Tokens:</strong> ${tokens}</p>
          <p><strong>Amount:</strong> ₹${amount_inr.toLocaleString("en-IN")}</p>
          <p><strong>Timestamp:</strong> ${receiptDate}</p>
        `,
      }),
    });

    if (!adminEmailRes.ok) {
      console.error("Failed to send admin email:", await adminEmailRes.text());
    }

    console.log("Payment receipt emails sent");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending payment receipt:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
