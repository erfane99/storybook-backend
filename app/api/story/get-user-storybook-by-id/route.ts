import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

    // Get storybook ID from URL params
    const storybookId = new URL(request.url).searchParams.get('id');
    if (!storybookId) {
      return NextResponse.json(
        { error: 'Missing storybook ID' },
        { status: 400 }
      );
    }

    console.log(`✅ User authenticated for storybook fetch: ${userId}, storybook: ${storybookId}`);

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query the specific storybook
    const { data, error } = await adminSupabase
      .from('storybook_entries')
      .select('id, title, created_at, pages, audience, character_description')
      .eq('id', storybookId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('❌ Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch storybook' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Storybook not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Fetched storybook ${storybookId} for user ${userId}`);

    return NextResponse.json({ storybook: data });

  } catch (error: any) {
    console.error('❌ Get user storybook by ID error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch storybook',
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