import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ 
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

    // Initialize dual Supabase clients
    const cookieStore = cookies();
    const authSupabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user using auth client
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
      // Continue without user_id if auth fails for anonymous users
    }

    // Parse and validate input data
    const { title, story, characterImage, pages, audience, isReusedImage } = await request.json();

    // Validation - same as current create-storybook
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!story?.trim()) return NextResponse.json({ error: 'Story content is required' }, { status: 400 });
    if (!Array.isArray(pages) || pages.length === 0) return NextResponse.json({ error: 'At least one page is required' }, { status: 400 });
    if (!characterImage) return NextResponse.json({ error: 'Character image is required' }, { status: 400 });
    if (!['children', 'young_adults', 'adults'].includes(audience)) return NextResponse.json({ error: 'Invalid audience type' }, { status: 400 });

    // Check if user has already created a storybook (using auth client)
    if (user?.id) {
      const { count } = await authSupabase
        .from('storybook_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (count && count > 0) {
        return NextResponse.json(
          { error: "You've already created your free storybook. Upgrade to unlock more." },
          { status: 403 }
        );
      }
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create job entry in database using ADMIN CLIENT (bypasses RLS)
    const { error: insertError } = await adminSupabase
      .from('storybook_jobs')
      .insert({
        id: jobId,
        user_id: user?.id,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing storybook generation',
        title: title,
        story: story,
        character_image: characterImage,
        pages: pages,
        audience: audience,
        is_reused_image: isReusedImage,
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3
      });

    if (insertError) {
      console.error('❌ Failed to create storybook job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create storybook job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (based on number of pages)
    const estimatedMinutes = Math.max(2, pages.length * 0.5); // 30 seconds per page minimum 2 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created storybook job: ${jobId} for user: ${user?.id || 'anonymous'}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/storybook/status/${jobId}`,
      message: 'Storybook generation job created. Processing will be handled by worker service.'
    });

  } catch (error: unknown) {
    console.error('❌ Storybook job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create storybook job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}