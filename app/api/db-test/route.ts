import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing Supabase environment variables',
        variables: {
          NEXT_PUBLIC_SUPABASE_URL: !!supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !!supabaseServiceKey
        }
      }, { status: 500 });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    const startTime = Date.now();

    const { data, error, count } = await supabase
      .from('storybook_entries')
      .select('id, title, created_at', { count: 'exact' })
      .limit(5);

    const latencyMs = Date.now() - startTime;

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error,
        latencyMs
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase connection successful',
      connection: {
        url: supabaseUrl,
        authenticated: true,
        latencyMs
      },
      query: {
        table: 'storybook_entries',
        rowsReturned: data?.length || 0,
        totalCount: count,
        sampleData: data
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Database test error:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}
