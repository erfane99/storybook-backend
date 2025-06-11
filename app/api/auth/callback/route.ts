import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    try {
      // Exchange code for session
      await supabase.auth.exchangeCodeForSession(code);

      // Get session again to ensure we have the latest data
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error after code exchange:', sessionError);
        throw sessionError;
      }

      if (session?.user) {
        try {
          // Check if profile already exists
          const { data: existingProfile, error: profileCheckError } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('user_id', session.user.id)
            .single();

          // If no profile exists (PGRST116 = no rows returned), create one
          if (profileCheckError && profileCheckError.code === 'PGRST116') {
            const currentTime = new Date().toISOString();

            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                user_id: session.user.id,
                email: session.user.email || session.user.phone || '',
                user_type: 'user',
                onboarding_step: 'not_started',
                created_at: currentTime,
              });

            if (insertError) {
              console.error('❌ Error creating user profile:', insertError);
            } else {
              console.log('✅ User profile created successfully for Google sign-in');
            }
          } else if (profileCheckError) {
            console.error('❌ Error checking profile existence:', profileCheckError);
          } else {
            console.log('✅ Profile already exists');
          }
        } catch (profileError) {
          console.error('❌ Profile handling error:', profileError);
        }
      }
    } catch (error) {
      console.error('❌ Auth callback error:', error);
    }
  }

  return NextResponse.redirect(new URL('/', request.url));
}
