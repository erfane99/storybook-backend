import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/storybook/[id]/rating
 * Retrieve existing rating for a storybook
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // ✅ JWT Authentication
    const authResult = await validateAuthToken(request);
    const { userId, error: authError } = extractUserId(authResult);

    if (authError || !userId) {
      console.error('❌ JWT validation failed:', authError);
      return NextResponse.json(
        createAuthErrorResponse(authError || 'Authentication required'),
        { status: 401 }
      );
    }

    const storybookId = params.id;

    // Validate storybook ID format
    if (!storybookId) {
      return NextResponse.json(
        { error: 'Storybook ID is required' },
        { status: 400 }
      );
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(storybookId)) {
      return NextResponse.json(
        { error: 'Invalid storybook ID format' },
        { status: 400 }
      );
    }

    console.log(`📊 Fetching rating for storybook ${storybookId}, user ${userId}`);

    // Initialize admin Supabase client
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query existing rating for this user and storybook
    const { data: rating, error: ratingError } = await adminSupabase
      .from('user_ratings')
      .select('*')
      .eq('comic_id', storybookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (ratingError) {
      console.error('❌ Failed to fetch rating:', ratingError);
      return NextResponse.json(
        { error: 'Failed to fetch rating' },
        { status: 500 }
      );
    }

    // If no rating exists, return 404 (expected behavior)
    if (!rating) {
      return NextResponse.json(
        { rating: null, message: 'No rating found for this storybook' },
        { status: 404 }
      );
    }

    console.log(`✅ Rating found for storybook ${storybookId}: ${rating.average_rating} stars`);

    // Return the rating data
    return NextResponse.json({
      rating: {
        id: rating.id,
        character_consistency_rating: rating.character_consistency_rating,
        story_flow_narrative_rating: rating.story_flow_narrative_rating,
        art_quality_visual_appeal_rating: rating.art_quality_visual_appeal_rating,
        scene_background_consistency_rating: rating.scene_background_consistency_rating,
        overall_comic_experience_rating: rating.overall_comic_experience_rating,
        average_rating: rating.average_rating,
        comment: rating.comment,
        would_recommend: rating.would_recommend,
        time_spent_reading: rating.time_spent_reading,
        rating_date: rating.rating_date,
        created_at: rating.created_at
      }
    });

  } catch (error: any) {
    console.error('❌ Get rating error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch rating',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}