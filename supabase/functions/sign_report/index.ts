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

    const { studyId, reportContent } = await req.json();

    if (!studyId || !reportContent) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get study details
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("sla, owner")
      .eq("id", studyId)
      .single();

    if (studyError || !study) {
      throw new Error("Study not found");
    }

    // Calculate token cost
    const tokenCost = study.sla === "STAT" ? 2 : 1;

    // Use the consume_credit_and_sign function
    const { data: result, error: signError } = await supabase.rpc(
      "consume_credit_and_sign",
      {
        p_user_id: user.id,
        p_study_id: studyId,
        p_cost: tokenCost,
        p_content: reportContent
      }
    );

    if (signError) {
      throw signError;
    }

    console.log("Report signed successfully:", result);

    // Send email receipt (optional - can be implemented later)
    // await sendReceiptEmail(user.email, result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...result 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error signing report:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
