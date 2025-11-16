import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

interface RatingRequestBody {
  character_consistency_rating: number;
  story_flow_narrative_rating: number;
  art_quality_visual_appeal_rating: number;
  scene_background_consistency_rating: number;
  overall_comic_experience_rating: number;
  comment?: string;
  would_recommend?: boolean;
  time_spent_reading?: number;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

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

    const body: RatingRequestBody = await request.json();

    const {
      character_consistency_rating,
      story_flow_narrative_rating,
      art_quality_visual_appeal_rating,
      scene_background_consistency_rating,
      overall_comic_experience_rating,
      comment,
      would_recommend,
      time_spent_reading
    } = body;

    if (
      typeof character_consistency_rating !== 'number' ||
      typeof story_flow_narrative_rating !== 'number' ||
      typeof art_quality_visual_appeal_rating !== 'number' ||
      typeof scene_background_consistency_rating !== 'number' ||
      typeof overall_comic_experience_rating !== 'number'
    ) {
      return NextResponse.json(
        { error: 'All five rating fields are required and must be numbers' },
        { status: 400 }
      );
    }

    const ratings = [
      character_consistency_rating,
      story_flow_narrative_rating,
      art_quality_visual_appeal_rating,
      scene_background_consistency_rating,
      overall_comic_experience_rating
    ];

    if (ratings.some(rating => !Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: 'All ratings must be integers between 1 and 5' },
        { status: 400 }
      );
    }

    if (comment && typeof comment === 'string' && comment.length > 1000) {
      return NextResponse.json(
        { error: 'Comment must not exceed 1000 characters' },
        { status: 400 }
      );
    }

    if (would_recommend !== undefined && typeof would_recommend !== 'boolean') {
      return NextResponse.json(
        { error: 'would_recommend must be a boolean' },
        { status: 400 }
      );
    }

    if (time_spent_reading !== undefined && (typeof time_spent_reading !== 'number' || time_spent_reading < 0)) {
      return NextResponse.json(
        { error: 'time_spent_reading must be a positive number' },
        { status: 400 }
      );
    }

    console.log(`✅ User authenticated for storybook rating: ${userId}, storybook: ${storybookId}`);

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: storybook, error: storybookError } = await adminSupabase
      .from('storybook_entries')
      .select('user_id, has_errors')
      .eq('id', storybookId)
      .maybeSingle();

    if (storybookError) {
      console.error('❌ Supabase query error:', storybookError);
      return NextResponse.json(
        { error: 'Failed to verify storybook' },
        { status: 500 }
      );
    }

    if (!storybook) {
      return NextResponse.json(
        { error: 'Storybook not found' },
        { status: 404 }
      );
    }

    if (storybook.user_id !== userId) {
      console.warn(`⚠️ User ${userId} attempted to rate storybook ${storybookId} owned by ${storybook.user_id}`);
      return NextResponse.json(
        { error: 'You can only rate your own storybooks' },
        { status: 403 }
      );
    }

    if (storybook.has_errors === true) {
      return NextResponse.json(
        { error: 'Cannot rate a storybook that has errors or is incomplete' },
        { status: 400 }
      );
    }

    console.log(`✅ Storybook ownership verified for user ${userId}`);

    const average_rating = (
      character_consistency_rating +
      story_flow_narrative_rating +
      art_quality_visual_appeal_rating +
      scene_background_consistency_rating +
      overall_comic_experience_rating
    ) / 5;

    const ratingRecord = {
      comic_id: storybookId,
      user_id: userId,
      character_consistency_rating,
      story_flow_narrative_rating,
      art_quality_visual_appeal_rating,
      scene_background_consistency_rating,
      overall_comic_experience_rating,
      average_rating,
      comment: comment || null,
      would_recommend: would_recommend !== undefined ? would_recommend : null,
      time_spent_reading: time_spent_reading !== undefined ? time_spent_reading : null,
      rating_date: new Date().toISOString()
    };

    const { data: ratingData, error: ratingError } = await adminSupabase
      .from('user_ratings')
      .upsert(ratingRecord, {
        onConflict: 'user_id,comic_id'
      })
      .select('id')
      .single();

    if (ratingError) {
      console.error('❌ Failed to store rating:', ratingError);
      return NextResponse.json(
        { error: 'Failed to store rating' },
        { status: 500 }
      );
    }

    console.log(`⭐ User ${userId} rated storybook ${storybookId}: ${average_rating.toFixed(1)} stars`);

    const { data: qualityMetrics, error: metricsError } = await adminSupabase
      .from('comic_quality_metrics')
      .select('automated_quality_score')
      .eq('comic_id', storybookId)
      .maybeSingle();

    let automated_quality: number | null = null;
    let combined_quality: number | null = null;

    if (!metricsError && qualityMetrics && qualityMetrics.automated_quality_score !== null) {
      const automatedScore = qualityMetrics.automated_quality_score;
      automated_quality = automatedScore;
      const user_rating_0_100 = average_rating * 20;
      combined_quality = (automatedScore * 0.4) + (user_rating_0_100 * 0.6);

      console.log(`📊 Combined quality: automated ${automatedScore.toFixed(1)}% + user ${user_rating_0_100.toFixed(1)}% = ${combined_quality.toFixed(1)}%`);
    } else {
      console.log(`ℹ️ No automated quality metrics found for storybook ${storybookId}`);
    }

    if (average_rating >= 4.0 && automated_quality !== null && automated_quality >= 80) {
      console.log(`✅ High-quality storybook detected (rating: ${average_rating.toFixed(1)}★, automated: ${automated_quality.toFixed(1)}%) - flagged for pattern learning`);
    }

    if (average_rating <= 2.0) {
      console.log(`❌ Low-quality storybook detected (rating: ${average_rating.toFixed(1)}★) - flagged for review`);
    }

    return NextResponse.json({
      success: true,
      rating_id: ratingData.id,
      average_rating: parseFloat(average_rating.toFixed(1)),
      message: 'Thank you for your feedback!'
    });

  } catch (error: any) {
    console.error('❌ Storybook rating error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      {
        error: error.message || 'Failed to submit rating',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}
