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
      // Continue without user_id if auth fails for anonymous users
    }

    // Parse and validate input data
    const { title, story, characterImage, pages, audience, isReusedImage } = await request.json();

    // Validation - same as current create-storybook
    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!story?.trim()) {
      return NextResponse.json({ error: 'Story content is required' }, { status: 400 });
    }
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'At least one page is required' }, { status: 400 });
    }
    if (!characterImage) {
      return NextResponse.json({ error: 'Character image is required' }, { status: 400 });
    }
    if (!['children', 'young_adults', 'adults'].includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience type' }, { status: 400 });
    }

    // Check if user has already created a storybook (for authenticated users)
    if (user?.id) {
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
    }

    // Create background job
    const jobId = await jobManager.createStorybookJob({
      title,
      story,
      characterImage,
      pages,
      audience,
      isReusedImage
    }, user?.id);

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create background job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (based on number of pages)
    const estimatedMinutes = Math.max(2, pages.length * 0.5); // 30 seconds per page minimum 2 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    // Dynamic base URL detection
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    console.log(`✅ Created storybook job: ${jobId} for user: ${user?.id || 'anonymous'}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `${baseUrl}/api/jobs/storybook/status/${jobId}`,
      message: 'Storybook generation started. Use the polling URL to track progress.'
    });

  } catch (error: unknown) {
    console.error('❌ Storybook job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to start storybook generation',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}