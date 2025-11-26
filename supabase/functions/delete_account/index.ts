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

    const { confirmation } = await req.json();
    if (confirmation !== "DELETE MY ACCOUNT") {
      return new Response(
        JSON.stringify({ error: "Invalid confirmation text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Starting account deletion for user:", user.id);

    // Log deletion event BEFORE deleting
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      event_type: "account_deletion_initiated",
      event_data: { email: user.email, timestamp: new Date().toISOString() }
    });

    // Delete all user storage files from all buckets
    const buckets = ["eeg-raw", "eeg-clean", "eeg-json", "eeg-preview", "eeg-reports"];
    
    for (const bucket of buckets) {
      try {
        const { data: files } = await supabase.storage
          .from(bucket)
          .list(user.id);
        
        if (files && files.length > 0) {
          const filePaths = files.map(f => `${user.id}/${f.name}`);
          await supabase.storage.from(bucket).remove(filePaths);
          console.log(`Deleted ${files.length} files from ${bucket}`);
        }
      } catch (e) {
        console.error(`Error deleting from ${bucket}:`, e);
      }
    }

    // Database cleanup happens automatically via CASCADE
    // The auth.users deletion triggers CASCADE on all foreign keys

    // Delete the auth user (this cascades to all related data)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    console.log("Account deleted successfully:", user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Account deleted successfully. You will be logged out." 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error deleting account:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});