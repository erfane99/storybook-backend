import { NextResponse } from 'next/server';
import { jwtDecode } from 'jwt-decode';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
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

      // Import Supabase client inside the handler to avoid build-time evaluation
      const { createClient } = await import('@supabase/supabase-js');
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Query storybooks for the user
      const { data, error } = await supabase
        .from('storybook_entries')
        .select('id, title, created_at')
        .eq('user_id', decoded.sub)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase query error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch storybooks' },
          { status: 500 }
        );
      }

      return NextResponse.json({ storybooks: data });
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