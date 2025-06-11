import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/supabase/database.types';
import { redirect } from 'next/navigation';

export const createServerSupabaseClient = () => {
  const cookieStore = cookies();
  
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables. Please check your deployment configuration.');
  }
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Handle cookie errors gracefully
            console.error('Error setting cookie:', error);
          }
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle cookie errors gracefully
            console.error('Error removing cookie:', error);
          }
        },
      },
    }
  );
};

export async function getSession() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

export async function getUserDetails() {
  try {
    const supabase = createServerSupabaseClient();
    const session = await getSession();
    
    if (!session) return null;
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();
    
    if (error) {
      console.error('Error fetching user details:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getUserDetails:', error);
    return null;
  }
}

export async function requireAuth() {
  const session = await getSession();
  
  if (!session) {
    redirect('/auth/login');
  }
  
  return session;
}

export async function checkIsAdmin() {
  try {
    const supabase = createServerSupabaseClient();
    const session = await getSession();
    
    if (!session) return false;
    
    const { data, error } = await supabase
      .rpc('is_admin', { uid: session.user.id });
    
    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
    
    return data || false;
  } catch (error) {
    console.error('Error in checkIsAdmin:', error);
    return false;
  }
}