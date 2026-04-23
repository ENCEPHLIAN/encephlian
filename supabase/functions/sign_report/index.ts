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

    // Get study details including clinic_id for authorization
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("sla, owner, clinic_id")
      .eq("id", studyId)
      .single();

    if (studyError || !study) {
      throw new Error("Study not found");
    }

    // Authorization check: user must own the study OR be a member of the study's clinic
    if (study.owner !== user.id) {
      const { data: membership } = await supabase
        .from("clinic_memberships")
        .select("clinic_id")
        .eq("user_id", user.id)
        .eq("clinic_id", study.clinic_id)
        .single();

      if (!membership) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: You do not have access to this study" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Triage tokens are deducted at SLA selection; signing does not charge again.
    const { data: result, error: signError } = await supabase.rpc(
      "consume_credit_and_sign",
      {
        p_user_id: user.id,
        p_study_id: studyId,
        p_cost: 0,
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
