import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: "neurologist" | "clinic_admin" | "ops" | "super_admin";
  is_admin: boolean; // If true, only create auth user + role. If false, create full PaaS user with profile
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      throw new Error("Unauthorized");
    }

    // Check if caller is admin
    const { data: callerRoles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["super_admin", "ops"]);

    if (roleError || !callerRoles || callerRoles.length === 0) {
      throw new Error("Unauthorized: Admin access required");
    }

    const { email, password, full_name, role, is_admin }: CreateUserRequest = await req.json();

    // Validate input
    if (!email || !password || !role) {
      throw new Error("Missing required fields: email, password, role");
    }

    // Create auth user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      throw createError;
    }

    if (!authData.user) {
      throw new Error("Failed to create user");
    }

    const userId = authData.user.id;

    if (is_admin) {
      // Admin user: only create role entry
      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: userId,
          role: role,
        });

      if (roleInsertError) {
        // Rollback: delete auth user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw roleInsertError;
      }
    } else {
      // PaaS user: create profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          email: email,
          full_name: full_name || email,
          role: role,
        });

      if (profileError) {
        // Rollback: delete auth user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw profileError;
      }
    }

    // Log audit event
    await supabaseAdmin.from("audit_logs").insert({
      user_id: caller.id,
      event_type: is_admin ? "admin_user_created" : "paas_user_created",
      event_data: {
        created_user_id: userId,
        email,
        role,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email,
        role,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in admin_create_user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});