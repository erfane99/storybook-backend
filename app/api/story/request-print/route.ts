import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

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

    const { storybook_id, notes } = await request.json();

    if (!storybook_id) {
      return NextResponse.json(
        { error: 'Missing storybook ID' },
        { status: 400 }
      );
    }

    console.log(`✅ User authenticated for print request: ${userId}, storybook: ${storybook_id}`);

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if a print request already exists
    const { data: existingRequest, error: checkError } = await adminSupabase
      .from('print_requests')
      .select('id')
      .eq('storybook_id', storybook_id)
      .eq('user_id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking existing request:', checkError);
      return NextResponse.json(
        { error: 'Failed to check existing requests' },
        { status: 500 }
      );
    }

    if (existingRequest) {
      return NextResponse.json(
        { error: 'A print request already exists for this storybook' },
        { status: 400 }
      );
    }

    // Insert new print request
    const { error: insertError } = await adminSupabase
      .from('print_requests')
      .insert({
        user_id: userId,
        storybook_id,
        notes,
        status: 'pending'
      });

    if (insertError) {
      console.error('❌ Error creating print request:', insertError);
      return NextResponse.json(
        { error: 'Failed to create print request' },
        { status: 500 }
      );
    }

    console.log(`✅ Created print request for user ${userId}, storybook: ${storybook_id}`);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Request print error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to create print request',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
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