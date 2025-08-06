import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';
import { serviceContainer } from '@/lib/services/service-container';
import type { SubscriptionService } from '@/lib/services/subscription-service';

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

    // ✅ JWT Authentication - Use standardized auth utility
    const authResult = await validateAuthToken(request);
    const { userId, error: authError } = extractUserId(authResult);

    if (authError || !userId) {
      console.error('❌ JWT validation failed:', authError);
      return NextResponse.json(
        createAuthErrorResponse(authError || 'Authentication required'),
        { status: 401 }
      );
    }

    console.log(`✅ User authenticated for storybook creation: ${userId}`);

    // Parse request body
    const {
      title,
      story,
      pages,
      audience = 'children',
      isReusedImage,
      characterImage,
      characterArtStyle = 'storybook',
      layoutType = 'comic-book-panels'
    } = await request.json();

    // Validation
    if (!title || !story || !pages || !Array.isArray(pages)) {
      return NextResponse.json(
        { error: 'Missing required fields: title, story, and pages are required' },
        { status: 400 }
      );
    }

    if (!characterImage) {
      return NextResponse.json(
        { error: 'Character image is required' },
        { status: 400 }
      );
    }

    // Validate audience
    const validAudiences = ['children', 'young_adults', 'adults'];
    if (!validAudiences.includes(audience)) {
      return NextResponse.json(
        { error: 'Invalid audience. Must be one of: ' + validAudiences.join(', ') },
        { status: 400 }
      );
    }

    // Validate character art style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(characterArtStyle)) {
      return NextResponse.json(
        { error: 'Invalid character art style. Must be one of: ' + validStyles.join(', ') },
        { status: 400 }
      );
    }

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // ✅ NEW: Use SubscriptionService instead of embedded business logic
    try {
      const subscriptionService = await serviceContainer.resolve<SubscriptionService>('SUBSCRIPTION');
      const limitCheck = await subscriptionService.checkUserLimits(userId, 'storybook');
      
      if (!limitCheck.allowed) {
        console.log(`🚫 Storybook creation blocked for user ${userId} - ${limitCheck.tier} tier limit reached (${limitCheck.currentUsage}/${limitCheck.limit})`);
        
        return NextResponse.json({
          error: limitCheck.upgradeMessage || "You've reached your storybook limit for your current plan.",
          subscriptionInfo: {
            tier: limitCheck.tier,
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            nextTier: limitCheck.nextTier
          },
          upgradeRequired: true
        }, { status: 403 });
      }
      
      console.log(`✅ Storybook creation allowed for user ${userId} - ${limitCheck.tier} tier (${limitCheck.currentUsage}/${limitCheck.limit === -1 ? 'unlimited' : limitCheck.limit})`);
    } catch (serviceError) {
      console.error('❌ Subscription service error:', serviceError);
      // Fail-safe: allow creation but log the error
      console.warn('⚠️ Proceeding with storybook creation due to subscription service error');
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    console.log(`📖 Creating storybook job: ${jobId} for user: ${userId}`);

    // Create job entry in storybook_jobs table
    const { data: job, error: insertError } = await adminSupabase
      .from('storybook_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing storybook creation',
        title: title,
        story: story,
        character_image: characterImage,
        pages: pages,
        audience: audience,
        is_reused_image: isReusedImage || false,
        character_description: '',
        character_art_style: characterArtStyle,
        layout_type: layoutType,
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3,
        has_errors: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create storybook job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create storybook job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time based on pages and complexity
    const estimatedMinutes = Math.max(3, pages.length * 1); // ~1 minute per page
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created storybook job: ${jobId} for user: ${userId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`,
      message: 'Storybook creation job created. Processing will be handled by worker service.',
      storyInfo: {
        title,
        totalPages: pages.length,
        totalScenes: pages.reduce((sum: number, page: any) => sum + (page.scenes?.length || 0), 0),
        audience,
        characterArtStyle,
        layoutType
      }
    });

  } catch (error: unknown) {
    console.error('❌ Storybook creation job error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create storybook job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}