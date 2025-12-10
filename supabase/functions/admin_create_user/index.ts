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

    // Verify admin using service role to bypass RLS
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client with service role for role check
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'management']);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerRole = roleCheck[0].role;
    const { email, password, full_name, role, clinic_id } = await req.json();

    // Management cannot create management/super_admin users
    if (callerRole === 'management' && ['management', 'super_admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Management users cannot create system-level roles' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // supabaseAdmin already created above, reuse it

    // STEP 1: Clean up any existing profile with this email
    console.log('Cleaning up existing data for email:', email);
    
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase());
    
    for (const profile of (existingProfiles || [])) {
      console.log('Cleaning up orphaned profile:', profile.id);
      await supabaseAdmin.from('wallet_transactions').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('wallets').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('earnings_wallets').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('tfa_secrets').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('notes').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('support_tickets').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('clinic_memberships').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('user_roles').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('payments').delete().eq('user_id', profile.id);
      await supabaseAdmin.from('profiles').delete().eq('id', profile.id);
    }

    // STEP 2: Delete existing auth user with this email
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingAuthUser) {
      console.log('Found existing auth user, deleting:', existingAuthUser.id);
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
      await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
    }

    // STEP 3: Create the new user
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

    const userId = newUser.user.id;
    console.log('Created new user:', userId);

    // The handle_new_user trigger creates the profile automatically
    // Just update it with the correct role
    const profileRole = 'clinician';

    // Wait a moment for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update profile (trigger creates it, we update the role)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role: profileRole, full_name })
      .eq('id', userId);

    if (profileError) {
      console.error('Profile update error:', profileError);
    }

    // Assign role in user_roles table
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ 
        user_id: userId, 
        role, 
        clinic_id: clinic_id || null 
      });

    if (roleError) {
      console.error('Role error:', roleError);
      throw roleError;
    }

    // Create wallet (trigger may create it too, use upsert)
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
          role: 'clinician'
        }, { onConflict: 'clinic_id,user_id' });
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
