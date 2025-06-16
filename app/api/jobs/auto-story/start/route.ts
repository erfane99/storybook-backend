import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { jobManager } from '@/lib/background-jobs/job-manager';

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

    // Initialize server-side Supabase client
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    // Parse and validate input data
    const { genre, characterDescription, cartoonImageUrl, audience } = await request.json();

    // Validation - same as current generate-auto-story
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

    // Check if user has already created a storybook
    const { count } = await supabase
      .from('storybook_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (count && count > 0) {
      return NextResponse.json(
        { error: "You've already created your free storybook. Upgrade to unlock more." },
        { status: 403 }
      );
    }

    // Create background job
    const jobId = await jobManager.createAutoStoryJob({
      genre,
      characterDescription,
      cartoonImageUrl,
      audience
    }, user.id);

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create background job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (auto-story takes longer due to AI generation)
    const estimatedMinutes = 5; // Auto-story generation typically takes 3-7 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created auto-story job: ${jobId} for user: ${user.id}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/auto-story/status/${jobId}`,
      message: 'Auto-story generation started. This will create a complete story and scenes automatically.',
      phases: [
        'Generating story content',
        'Creating scene breakdown',
        'Generating illustrations',
        'Assembling final storybook'
      ]
    });

  } catch (error: unknown) {
    console.error('❌ Auto-story job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to start auto-story generation',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}