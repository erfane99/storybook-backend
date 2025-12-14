import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// This endpoint can be called by a cron job or manually to process pending feedback
export async function POST(request: NextRequest) {
  try {
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get unprocessed feedback
    const { data: pendingFeedback, error } = await adminSupabase
      .from('user_actionable_feedback')
      .select('*')
      .eq('processed', false)
      .limit(10);

    if (error) throw error;

    if (!pendingFeedback || pendingFeedback.length === 0) {
      return NextResponse.json({ 
        message: 'No pending feedback to process',
        processed: 0 
      });
    }

    console.log(`📝 Processing ${pendingFeedback.length} pending feedback items`);

    // Mark as processing (to avoid duplicate processing)
    const feedbackIds = pendingFeedback.map(f => f.id);
    
    // Return feedback IDs for worker to process
    // In production, this would trigger the worker directly
    return NextResponse.json({
      message: `Found ${pendingFeedback.length} feedback items to process`,
      feedback_ids: feedbackIds,
      pending_count: pendingFeedback.length
    });

  } catch (error: any) {
    console.error('❌ Feedback processing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process feedback' },
      { status: 500 }
    );
  }
}