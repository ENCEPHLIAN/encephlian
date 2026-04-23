import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const planId = Deno.env.get("RAZORPAY_PILOT_PLAN_ID");

    if (!planId) {
      throw new Error(
        "RAZORPAY_PILOT_PLAN_ID is not set. Create a subscription plan in Razorpay Dashboard and add the plan_… id to project secrets.",
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization");

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const body = {
      plan_id: planId,
      customer_notify: 1,
      quantity: 1,
      total_count: 36,
      notes: {
        user_id: user.id,
        product: "pilot_access_subscription",
      },
    };

    const rzpRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const raw = await rzpRes.text();
    if (!rzpRes.ok) {
      console.error("Razorpay subscription create failed:", raw);
      throw new Error(`Razorpay: ${raw.slice(0, 400)}`);
    }

    const sub = JSON.parse(raw) as { id: string; plan_id?: string };

    const { error: insErr } = await supabase.from("pilot_subscriptions").insert({
      user_id: user.id,
      status: "pending",
      razorpay_subscription_id: sub.id,
      razorpay_plan_id: planId,
    });

    if (insErr) {
      console.error("DB insert pilot_subscriptions:", insErr);
      throw insErr;
    }

    return new Response(
      JSON.stringify({
        subscriptionId: sub.id,
        keyId: razorpayKeyId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("create_pilot_subscription:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
