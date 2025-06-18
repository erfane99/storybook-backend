import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jwtDecode } from 'jwt-decode';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Extract and decode the JWT token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 401 }
      );
    }

    try {
      const decoded = jwtDecode(token);
      if (!decoded.sub) {
        return NextResponse.json(
          { error: 'Invalid token' },
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

      // Use admin client for database operations (bypasses RLS)
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

      // Check if a print request already exists
      const { data: existingRequest, error: checkError } = await adminSupabase
        .from('print_requests')
        .select('id')
        .eq('storybook_id', storybook_id)
        .eq('user_id', decoded.sub)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing request:', checkError);
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
          user_id: decoded.sub,
          storybook_id,
          notes,
          status: 'pending'
        });

      if (insertError) {
        console.error('Error creating print request:', insertError);
        return NextResponse.json(
          { error: 'Failed to create print request' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Token decode error:', error);
      return NextResponse.json(
        { error: 'Invalid token format' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}