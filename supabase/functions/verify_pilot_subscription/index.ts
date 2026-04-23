import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const BONUS_TOKENS = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const supabase = createClient(supabaseUrl, serviceKey);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = await req.json() as {
      razorpay_payment_id?: string;
      razorpay_subscription_id?: string;
      razorpay_signature?: string;
    };

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      throw new Error("Missing payment fields");
    }

    const message = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expected = (await hmacSha256Hex(message, razorpayKeySecret)).toLowerCase();
    const got = (razorpay_signature || "").trim().toLowerCase();
    if (!got || expected !== got) {
      throw new Error("Invalid payment signature");
    }

    const { data: row, error: subErr } = await supabase
      .from("pilot_subscriptions")
      .select("id, user_id, status")
      .eq("razorpay_subscription_id", razorpay_subscription_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr || !row) {
      throw new Error("Subscription not found for this account");
    }

    const { data: existing } = await supabase
      .from("pilot_subscription_charges")
      .select("razorpay_payment_id")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, message: "Already credited", tokens_credited: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: chgErr } = await supabase.from("pilot_subscription_charges").insert({
      razorpay_payment_id,
      user_id: user.id,
      razorpay_subscription_id,
      tokens_credited: BONUS_TOKENS,
    });
    if (chgErr) throw chgErr;

    const { error: credErr } = await supabase.rpc("credit_wallet", {
      p_user_id: user.id,
      p_tokens: BONUS_TOKENS,
      p_reason: `Pilot plan · payment ${razorpay_payment_id}`,
    });
    if (credErr) throw credErr;

    await supabase
      .from("pilot_subscriptions")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: wallet } = await supabase.from("wallets").select("tokens").eq("user_id", user.id).single();

    return new Response(
      JSON.stringify({
        success: true,
        tokens_credited: BONUS_TOKENS,
        new_balance: wallet?.tokens ?? BONUS_TOKENS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("verify_pilot_subscription:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
