import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface PreviousCartoonsQuery {
  limit?: number;
  offset?: number;
  style?: string;
  sortBy?: 'created_at' | 'style';
  sortOrder?: 'asc' | 'desc';
}

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

    // Initialize dual Supabase clients
    const cookieStore = cookies();
    const authSupabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication required to view previous cartoons' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100); // Max 100 items
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
    const styleFilter = url.searchParams.get('style');
    const sortBy = (url.searchParams.get('sortBy') as 'created_at' | 'style') || 'created_at';
    const sortOrder = (url.searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';

    // Validate style filter if provided
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (styleFilter && !validStyles.includes(styleFilter)) {
      return NextResponse.json({ 
        error: `Invalid style filter. Must be one of: ${validStyles.join(', ')}` 
      }, { status: 400 });
    }

    console.log(`📚 Fetching previous cartoons for user ${user.id} - Limit: ${limit}, Offset: ${offset}, Style: ${styleFilter || 'all'}`);

    try {
      // Build query with filters
      let query = adminSupabase
        .from('cartoon_images')
        .select(`
          id,
          original_url,
          generated_url,
          style,
          character_description,
          original_prompt,
          generation_count,
          cloudinary_public_id,
          created_at
        `)
        .eq('user_id', user.id);

      // Apply style filter if provided
      if (styleFilter) {
        query = query.eq('style', styleFilter);
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data: cartoons, error: fetchError } = await query;

      if (fetchError) {
        console.error('❌ Database fetch error:', fetchError);
        throw new Error(`Failed to fetch cartoons: ${fetchError.message}`);
      }

      // Get total count for pagination metadata
      let countQuery = adminSupabase
        .from('cartoon_images')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (styleFilter) {
        countQuery = countQuery.eq('style', styleFilter);
      }

      const { count: totalCount, error: countError } = await countQuery;

      if (countError) {
        console.warn('⚠️ Count query failed:', countError);
      }

      // Organize data by style for better UX
      const cartoonsByStyle = cartoons?.reduce((acc: any, cartoon: any) => {
        if (!acc[cartoon.style]) {
          acc[cartoon.style] = [];
        }
        acc[cartoon.style].push({
          id: cartoon.id,
          originalUrl: cartoon.original_url,
          cartoonUrl: cartoon.generated_url,
          style: cartoon.style,
          characterDescription: cartoon.character_description,
          originalPrompt: cartoon.original_prompt,
          generationCount: cartoon.generation_count,
          cloudinaryPublicId: cartoon.cloudinary_public_id,
          createdAt: cartoon.created_at,
          createdAtFormatted: new Date(cartoon.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        });
        return acc;
      }, {}) || {};

      // Calculate pagination metadata
      const hasMore = totalCount ? (offset + limit) < totalCount : false;
      const totalPages = totalCount ? Math.ceil(totalCount / limit) : 0;
      const currentPage = Math.floor(offset / limit) + 1;

      // Generate style statistics
      const styleStats = cartoons?.reduce((acc: any, cartoon: any) => {
        acc[cartoon.style] = (acc[cartoon.style] || 0) + 1;
        return acc;
      }, {}) || {};

      console.log(`✅ Fetched ${cartoons?.length || 0} cartoons for user ${user.id}`);

      return NextResponse.json({
        success: true,
        cartoons: cartoons || [],
        cartoonsByStyle,
        pagination: {
          limit,
          offset,
          totalCount: totalCount || 0,
          totalPages,
          currentPage,
          hasMore,
          hasPrevious: offset > 0
        },
        filters: {
          style: styleFilter,
          sortBy,
          sortOrder
        },
        statistics: {
          totalCartoons: totalCount || 0,
          styleBreakdown: styleStats,
          availableStyles: validStyles
        }
      });

    } catch (queryError: any) {
      console.error('❌ Query execution error:', queryError);
      return NextResponse.json(
        { 
          error: 'Failed to fetch previous cartoons',
          details: queryError.message || 'Database query failed'
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Previous cartoons API error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch previous cartoons',
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