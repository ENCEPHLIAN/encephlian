import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify admin
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleCheck } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'ops', 'management'])
      .single();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, full_name, role, clinic_id } = await req.json();

    // Management cannot create management/super_admin/ops users
    if (roleCheck.role === 'management' && ['management', 'super_admin', 'ops'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Management users cannot create system-level roles' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create user with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if user exists in auth.users first
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let newUser;
    
    if (existingUser) {
      // User exists in auth - check if they have a profile
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', existingUser.id)
        .single();

      if (existingProfile) {
        // User fully exists - cannot create
        return new Response(JSON.stringify({ error: 'A user with this email already exists. Please delete the existing user first.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // User exists in auth but not in profiles - use existing auth user
      newUser = { user: existingUser };
      
      // Update password if different
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
    } else {
      // Create new user
      const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;
      newUser = data;
    }

    // Create or update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        email,
        full_name,
        role: 'clinician', // Default profile role
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ 
        user_id: newUser.user.id, 
        role, 
        clinic_id: clinic_id || null 
      }, { 
        onConflict: 'user_id,role' 
      });

    if (roleError) {
      console.error('Role upsert error:', roleError);
    }

    // Create wallet for the user
    await supabaseAdmin
      .from('wallets')
      .upsert({ 
        user_id: newUser.user.id, 
        tokens: 0 
      }, { 
        onConflict: 'user_id' 
      });

    // Add to clinic membership if clinic specified
    if (clinic_id) {
      await supabaseAdmin
        .from('clinic_memberships')
        .upsert({
          user_id: newUser.user.id,
          clinic_id,
          role: 'neurologist'
        }, {
          onConflict: 'user_id,clinic_id'
        });
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      event_type: 'admin_user_created',
      event_data: {
        created_user_id: newUser.user.id,
        email,
        role,
        clinic_id,
      },
    });

    return new Response(JSON.stringify({ success: true, user: newUser.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
