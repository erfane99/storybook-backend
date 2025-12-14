import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storybookId = params.id;
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { story_feedback, image_feedback, quick_issues } = body;

    // Validate at least some feedback is provided
    if (!story_feedback && !image_feedback && (!quick_issues || quick_issues.length === 0)) {
      return NextResponse.json(
        { error: 'Please provide at least one piece of feedback' },
        { status: 400 }
      );
    }

    // Verify storybook exists and belongs to user
    const { data: storybook, error: storybookError } = await adminSupabase
      .from('storybook_entries')
      .select('id, user_id')
      .eq('id', storybookId)
      .single();

    if (storybookError || !storybook) {
      return NextResponse.json({ error: 'Storybook not found' }, { status: 404 });
    }

    if (storybook.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check for existing feedback
    const { data: existingFeedback } = await adminSupabase
      .from('user_actionable_feedback')
      .select('id')
      .eq('comic_id', storybookId)
      .eq('user_id', user.id)
      .single();

    let result;
    
    if (existingFeedback) {
      // Update existing feedback
      const { data, error } = await adminSupabase
        .from('user_actionable_feedback')
        .update({
          story_feedback,
          image_feedback,
          quick_issues: quick_issues || [],
          updated_at: new Date().toISOString(),
          processed: false, // Mark as needing reprocessing
        })
        .eq('id', existingFeedback.id)
        .select('id')
        .single();

      if (error) throw error;
      result = data;
      console.log(`📝 Updated feedback for storybook ${storybookId}`);
    } else {
      // Insert new feedback
      const { data, error } = await adminSupabase
        .from('user_actionable_feedback')
        .insert({
          comic_id: storybookId,
          user_id: user.id,
          story_feedback,
          image_feedback,
          quick_issues: quick_issues || [],
        })
        .select('id')
        .single();

      if (error) throw error;
      result = data;
      console.log(`📝 New feedback submitted for storybook ${storybookId}`);
    }

    // Log feedback summary for monitoring
    const issueCount = quick_issues?.length || 0;
    console.log(`📊 Feedback summary: ${issueCount} quick issues, story: ${!!story_feedback}, image: ${!!image_feedback}`);

    return NextResponse.json({
      success: true,
      feedback_id: result.id,
      message: 'Thank you for your feedback!',
    });

  } catch (error: any) {
    console.error('❌ Feedback submission error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storybookId = params.id;
    
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: feedback, error } = await adminSupabase
      .from('user_actionable_feedback')
      .select('*')
      .eq('comic_id', storybookId)
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    return NextResponse.json({ feedback: feedback || null });

  } catch (error: any) {
    console.error('❌ Feedback fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}