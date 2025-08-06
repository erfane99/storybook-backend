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

    console.log(`✅ User authenticated for auto-story: ${userId}`);

    const { 
      genre, 
      characterDescription, 
      cartoonImageUrl, 
      audience = 'children',
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
    const validGenres = ['adventure', 'siblings', 'bedtime', 'fantasy', 'history', 'comedy', 'drama', 'mystery', 'superhero', 'animal', 'friendship', 'growth', 'science', 'magic', 'discovery', 'courage', 'cooperation', 'honesty', 'creativity', 'kindness', 'perseverance', 'responsibility', 'fairytale', 'holiday', 'nature', 'sports', 'mythology', 'folk-tale', 'space', 'pirates', 'dinosaurs', 'robots', 'underwater', 'time-travel', 'music', 'art', 'cooking', 'school', 'family', 'pets', 'seasons', 'emotions', 'problem-solving', 'imagination', 'dreams', 'wishes', 'secrets', 'quests', 'riddles', 'treasure', 'circus', 'transportation', 'birthday'];
    if (!validGenres.includes(genre)) {
      return NextResponse.json({ error: 'Invalid genre' }, { status: 400 });
    }

    // Validate character art style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(characterArtStyle)) {
      return NextResponse.json({ error: 'Invalid character art style' }, { status: 400 });
    }

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // ✅ NEW: Use SubscriptionService instead of embedded business logic
    try {
      const subscriptionService = await serviceContainer.resolve<SubscriptionService>('SUBSCRIPTION');
      const limitCheck = await subscriptionService.checkUserLimits(userId, 'auto-story');
      
      if (!limitCheck.allowed) {
        console.log(`🚫 Auto-story creation blocked for user ${userId} - ${limitCheck.tier} tier limit reached (${limitCheck.currentUsage}/${limitCheck.limit})`);
        
        return NextResponse.json({
          error: limitCheck.upgradeMessage || "You've reached your auto-story limit for your current plan.",
          subscriptionInfo: {
            tier: limitCheck.tier,
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            nextTier: limitCheck.nextTier
          },
          upgradeRequired: true
        }, { status: 403 });
      }
      
      console.log(`✅ Auto-story creation allowed for user ${userId} - ${limitCheck.tier} tier (${limitCheck.currentUsage}/${limitCheck.limit === -1 ? 'unlimited' : limitCheck.limit})`);
    } catch (serviceError) {
      console.error('❌ Subscription service error:', serviceError);
      // Fail-safe: allow creation but log the error
      console.warn('⚠️ Proceeding with auto-story creation due to subscription service error');
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    console.log(`🎨 Creating auto-story job ${jobId} for user ${userId}`);

    // Create job entry in auto_story_jobs table
    const { data: job, error: insertError } = await adminSupabase
      .from('auto_story_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing auto-story generation',
        genre: genre,
        character_description: characterDescription,
        cartoon_image_url: cartoonImageUrl,
        audience: audience,
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
      console.error('❌ Failed to create auto-story job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create auto-story job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time
    const estimatedMinutes = 6; // Auto-story generation takes longer due to story + scene generation
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created auto-story job: ${jobId} for user: ${userId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`,
      message: 'Auto-story generation job created. Processing will be handled by worker service.',
      storyInfo: {
        genre,
        audience,
        characterArtStyle,
        layoutType,
        characterDescription: characterDescription.substring(0, 100) + '...'
      }
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

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}