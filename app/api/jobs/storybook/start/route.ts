// Enhanced storybook API route: app/api/jobs/storybook/start/route.ts
// PROJECT: Railway Backend
// DATABASE-FIRST: Uses individual columns matching database schema

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

    // ✅ JWT Authentication - Use new auth utility
    const authResult = await validateAuthToken(request);
    const { userId, error: authError } = extractUserId(authResult);

    if (authError || !userId) {
      console.error('❌ JWT validation failed:', authError);
      return NextResponse.json(
        createAuthErrorResponse(authError || 'Authentication required'),
        { status: 401 }
      );
    }

    console.log(`✅ User authenticated for storybook job: ${userId}`);

    // Admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate input data with comic book enhancements
    const { 
      title, 
      story, 
      characterImage, 
      pages, 
      audience, 
      isReusedImage,
      characterDescription,
      characterArtStyle = 'storybook',
      layoutType = 'comic-book-panels'
    } = await request.json();

    // Enhanced validation with better error messages
    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    
    if (!story?.trim()) {
      return NextResponse.json({ error: 'Story content is required' }, { status: 400 });
    }
    
    if (!characterImage) {
      return NextResponse.json({ error: 'Character image is required' }, { status: 400 });
    }
    
    if (!['children', 'young_adults', 'adults'].includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience type' }, { status: 400 });
    }

    // ENHANCED: Allow empty pages array for story-to-comic-book generation
    if (!Array.isArray(pages)) {
      return NextResponse.json({ error: 'Pages must be an array' }, { status: 400 });
    }
    
    // Validate character art style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(characterArtStyle)) {
      return NextResponse.json({ error: 'Invalid character art style' }, { status: 400 });
    }
    
    const validatedPages = pages || [];
    const processingMode = validatedPages.length > 0 ? 'predefined-pages' : 'story-to-comic-panels';
    
    console.log(`📖 Creating comic book storybook job - Title: "${title}", Pages: ${validatedPages.length}, Mode: ${processingMode}, Art Style: ${characterArtStyle}`);

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

    // ✅ DATABASE-FIRST: Store in individual columns matching exact database schema
    const { error: insertError } = await adminSupabase
      .from('storybook_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing comic book storybook generation',
        // Individual columns matching database schema
        title: title,
        story: story,
        character_image: characterImage,
        pages: validatedPages,
        audience: audience,
        is_reused_image: isReusedImage || false,
        character_description: characterDescription || '',
        character_art_style: characterArtStyle,
        layout_type: layoutType,
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3,
        has_errors: false
      });

    if (insertError) {
      console.error('❌ Failed to create storybook job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create storybook job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time based on comic book generation complexity
    let estimatedMinutes;
    if (validatedPages.length > 0) {
      // Predefined pages: 45-60 seconds per page for comic book panel generation
      estimatedMinutes = Math.max(3, validatedPages.length * 1);
    } else {
      // Story-to-comic generation: Analyze story, create panels, generate comic book layout
      const storyComplexity = Math.ceil(story.length / 120); // Comic books need more detailed analysis
      estimatedMinutes = Math.max(5, Math.min(storyComplexity, 10)); // 5-10 minutes for comic book generation
    }
    
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created comic book storybook job: ${jobId} for user: ${userId} (${estimatedMinutes}min estimated, mode: ${processingMode}, style: ${characterArtStyle})`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`, // ✅ FIXED: Use correct generic job status endpoint
      message: 'Comic book storybook generation job created. Processing will be handled by worker service.',
      mode: processingMode,
      characterArtStyle,
      layoutType,
      phases: [
        'Analyzing story content',
        'Creating comic book panel breakdown',
        'Generating character-consistent panel illustrations',
        'Assembling comic book pages',
        'Finalizing storybook'
      ]
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

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}