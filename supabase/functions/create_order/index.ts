import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { tokens } = await req.json();

    // ✅ FIXED: explicit tiered pricing, must match frontend
    const PRICING: Record<number, number> = {
      10: 1500, // ₹150 / token
      25: 3499, // ~₹140 / token
      50: 6499, // ~₹130 / token
      100: 11999, // ~₹120 / token
    };

    const amountInr = PRICING[tokens];

    if (!amountInr) {
      throw new Error("Invalid token package. Allowed: 10, 25, 50, 100.");
    }

    const amountPaise = amountInr * 100;

    console.log(`Creating order for ${tokens} tokens, amount: ₹${amountInr} (₹${amountPaise / 100} shown to user)`);

    // Create Razorpay order
    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise, // paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        notes: {
          user_id: user.id,
          tokens: tokens.toString(),
        },
      }),
    });

    if (!razorpayResponse.ok) {
      const errorData = await razorpayResponse.text();
      console.error("Razorpay API error:", errorData);
      throw new Error(`Razorpay API error: ${errorData}`);
    }

    const order = await razorpayResponse.json();
    console.log("Razorpay order created:", order.id, "amount:", order.amount);

    // Create payment record in database (store rupees)
    const { error: insertError } = await supabase.from("payments").insert({
      user_id: user.id,
      order_id: order.id,
      amount_inr: amountInr,
      credits_purchased: tokens,
      status: "created",
      provider: "razorpay",
    });

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        orderId: order.id,
        amountInr, // rupees (for display if you ever need it)
        amountPaise, // paise (for Razorpay checkout)
        currency: "INR",
        keyId: razorpayKeyId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in create_order:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
