// Enhanced auto-story API route: app/api/jobs/auto-story/start/route.ts
// PROJECT: Railway Backend
// Replace entire file content with this enhanced version

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
      return NextResponse.json(
        { error: 'Authentication required for auto-story generation' },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Please sign in to generate an automatic story' },
        { status: 401 }
      );
    }

    // Parse and validate input data with comic book enhancements
    const { 
      genre, 
      characterDescription, 
      cartoonImageUrl, 
      audience,
      characterArtStyle = 'storybook',
      layoutType = 'comic-book-panels'
    } = await request.json();

    // Enhanced validation
    if (!genre || !characterDescription || !cartoonImageUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: genre, characterDescription, and cartoonImageUrl are required' },
        { status: 400 }
      );
    }

    if (!['children', 'young_adults', 'adults'].includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience type' }, { status: 400 });
    }

    // Validate genre
    const validGenres = ['adventure', 'siblings', 'bedtime', 'fantasy', 'history'];
    if (!validGenres.includes(genre)) {
      return NextResponse.json({ error: 'Invalid genre' }, { status: 400 });
    }

    // Validate character art style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(characterArtStyle)) {
      return NextResponse.json({ error: 'Invalid character art style' }, { status: 400 });
    }

    // Check if user has already created a storybook (using auth client)
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

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // ENHANCED: Create job entry with comic book layout context
    const { error: insertError } = await adminSupabase
      .from('auto_story_jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing comic book auto-story generation',
        genre: genre,
        character_description: characterDescription,
        cartoon_image_url: cartoonImageUrl,
        audience: audience,
        character_art_style: characterArtStyle, // NEW: Store character art style
        layout_type: layoutType, // NEW: Store layout type
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3
      });

    if (insertError) {
      console.error('❌ Failed to create auto-story job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create auto-story job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time for comic book generation
    const estimatedMinutes = 6; // Comic book layout generation takes slightly longer
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created comic book auto-story job: ${jobId} for user: ${user.id} (Style: ${characterArtStyle}, Layout: ${layoutType})`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/auto-story/status/${jobId}`,
      message: 'Comic book auto-story generation job created. Processing will be handled by worker service.',
      phases: [
        'Generating story content',
        'Creating comic book scene breakdown',
        'Generating panel illustrations',
        'Assembling comic book pages',
        'Finalizing storybook'
      ],
      characterArtStyle,
      layoutType
    });

  } catch (error: unknown) {
    console.error('❌ Auto-story job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create auto-story job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}