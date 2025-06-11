import { createClient } from '@supabase/supabase-js';

// Unified cache utilities with proper error handling and environment validation
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Changed to use anon key

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase environment variables not configured for caching');
      return null;
    }

    try {
      supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false
        }
      });
    } catch (error) {
      console.warn('⚠️ Failed to initialize Supabase client for caching:', error);
      return null;
    }
  }

  return supabaseClient;
}

/**
 * Get a cached image URL if it exists
 */
export async function getCachedImage(
  originalPrompt: string,
  style: string,
  userId?: string
): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('⚠️ Skipping cache lookup - Supabase not configured');
      return null;
    }

    const { data, error } = await supabase
      .from('cartoon_cache')
      .select('cartoon_url')
      .eq('original_prompt', originalPrompt)
      .eq('style', style)
      .eq('user_id', userId || '')
      .maybeSingle();

    if (error) {
      console.warn('⚠️ Cache lookup failed:', error.message);
      return null;
    }

    // Explicit type handling for the return value
    if (data && typeof data === 'object' && 'cartoon_url' in data) {
      return (data.cartoon_url as string) || null;
    }

    return null;
  } catch (error) {
    console.warn('⚠️ Cache lookup error:', error);
    return null;
  }
}

/**
 * Save an image to cache
 */
export async function saveToCache(
  originalPrompt: string,
  cartoonUrl: string,
  style: string,
  userId: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('⚠️ Skipping cache save - Supabase not configured');
      return;
    }

    const { error } = await supabase
      .from('cartoon_cache')
      .upsert({
        user_id: userId,
        original_prompt: originalPrompt,
        cartoon_url: cartoonUrl,
        style,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,original_prompt,style'
      });

    if (error) {
      console.warn('⚠️ Cache save failed:', error.message);
    } else {
      console.log('✅ Saved to cache successfully');
    }
  } catch (error) {
    console.warn('⚠️ Cache save error:', error);
  }
}

/**
 * Get a cached cartoon image URL if it exists
 */
export async function getCachedCartoonImage(
  originalUrl: string,
  style: string,
  userId?: string
): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('⚠️ Skipping cartoon cache lookup - Supabase not configured');
      return null;
    }

    let query = supabase
      .from('cartoon_cache')
      .select('cartoonized_url')
      .eq('original_url', originalUrl)
      .eq('style', style);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.warn('⚠️ Cartoon cache lookup failed:', error.message);
      return null;
    }

    // Explicit type handling for the return value
    if (data && typeof data === 'object' && 'cartoonized_url' in data) {
      return (data.cartoonized_url as string) || null;
    }

    return null;
  } catch (error) {
    console.warn('⚠️ Cartoon cache lookup error:', error);
    return null;
  }
}

/**
 * Save a cartoon image to cache
 */
export async function saveCartoonImageToCache(
  originalUrl: string,
  cartoonizedUrl: string,
  style: string,
  userId?: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('⚠️ Skipping cartoon cache save - Supabase not configured');
      return;
    }

    const { error } = await supabase
      .from('cartoon_cache')
      .upsert({
        original_url: originalUrl,
        cartoonized_url: cartoonizedUrl,
        style,
        user_id: userId,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'original_url,style,user_id'
      });

    if (error) {
      console.warn('⚠️ Cartoon cache save failed:', error.message);
    } else {
      console.log('✅ Saved cartoon to cache successfully');
    }
  } catch (error) {
    console.warn('⚠️ Cartoon cache save error:', error);
  }
}