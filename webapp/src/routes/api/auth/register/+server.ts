import { json } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/pbAdmin';

export const POST = async ({ request }) => {
  let email: string | undefined;
  let admin: Awaited<ReturnType<typeof getAdminPb>> | null = null;
  try {
    const data = await request.json();
    email = data.email;
    const { password, passwordConfirm, name, role, can_post, terms_version, terms_accepted_at, usage_version, usage_accepted_at, invite_code } = data;

    console.log('Register API called with:', { email, name, role, can_post });

    if (!email || !password || !passwordConfirm || !name) {
      console.log('Missing required fields');
      return json({ error: 'missing_required_fields' }, { status: 400 });
    }

    console.log('Getting admin pb...');
    admin = await getAdminPb();
    console.log('Admin pb obtained, auth valid:', admin.authStore.isValid);
    
    const payload: Record<string, unknown> = {
      email,
      password,
      passwordConfirm,
      name,
      role: role || 'user',
      can_post: can_post ?? false,
      terms_version,
      terms_accepted_at,
      usage_version,
      usage_accepted_at,
    };
    
    if (invite_code) {
      payload.invite_code = invite_code;
    }

    const user = await admin.collection('users').create(payload);
    
    // Send verification email
    try {
      await admin.collection('users').requestVerification(email);
    } catch (err) {
      console.error('Failed to send verification email:', err);
      // Don't fail registration if email fails
    }

    return json({ success: true, id: user.id });
  } catch (err: any) {
    console.error('Registration failed:', err);
    
    // Check if user was actually created despite the error (due to race conditions)
    if (err.message?.includes('Failed to create record') && email && admin) {
      try {
        const existingUser = await admin.collection('users').getFirstListItem(`email="${email}"`);
        if (existingUser) {
          console.log('User was actually created despite error:', existingUser.id);
          return json({ 
            success: true, 
            id: existingUser.id,
            message: '注册成功，请检查邮箱验证邮件'
          });
        }
      } catch (lookupErr) {
        // User doesn't exist, proceed with normal error
        console.log('User lookup after failed registration:', lookupErr);
      }
    }
    
    return json({ 
      error: 'registration_failed', 
      message: err.message,
      data: err.data 
    }, { status: 400 });
  }
};
