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
      .in('role', ['super_admin', 'ops', 'management']);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerRole = roleCheck[0].role;
    const { email, password, full_name, role, clinic_id } = await req.json();

    // Management cannot create management/super_admin/ops users
    if (callerRole === 'management' && ['management', 'super_admin', 'ops'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Management users cannot create system-level roles' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // First, try to find if user exists in auth.users by email
    const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
    }

    const existingAuthUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;

    if (existingAuthUser) {
      // User exists in auth - delete them first to allow recreation
      console.log('Found existing auth user, deleting first:', existingAuthUser.id);
      
      // Delete from auth.users (this should cascade or we clean up manually)
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
      
      if (deleteAuthError) {
        console.error('Error deleting existing auth user:', deleteAuthError);
        // Continue anyway - might already be deleted
      }

      // Also clean up any orphaned profile data
      await supabaseAdmin.from('wallet_transactions').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('wallets').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('earnings_wallets').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('tfa_secrets').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('notes').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('support_tickets').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('clinic_memberships').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('user_roles').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('payments').delete().eq('user_id', existingAuthUser.id);
      await supabaseAdmin.from('profiles').delete().eq('id', existingAuthUser.id);
    }

    // Now create the new user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      throw createError;
    }

    userId = newUser.user.id;
    console.log('Created new user:', userId);

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name,
        role: role === 'clinician' || role === 'neurologist' ? 'neurologist' : role,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile error:', profileError);
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ 
        user_id: userId, 
        role, 
        clinic_id: clinic_id || null 
      }, { 
        onConflict: 'user_id,role' 
      });

    if (roleError) {
      console.error('Role error:', roleError);
    }

    // Create wallet
    await supabaseAdmin
      .from('wallets')
      .upsert({ user_id: userId, tokens: 0 }, { onConflict: 'user_id' });

    // Add to clinic membership if clinic specified
    if (clinic_id) {
      await supabaseAdmin
        .from('clinic_memberships')
        .upsert({
          user_id: userId,
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
      event_data: { created_user_id: userId, email, role, clinic_id },
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
