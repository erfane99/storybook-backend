import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

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

    console.log(`✅ User authenticated for previous cartoons: ${userId}`);

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

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

    console.log(`📚 Fetching previous cartoons for user ${userId} - Limit: ${limit}, Offset: ${offset}, Style: ${styleFilter || 'all'}`);

    try {
      // ✅ Build query with filters (using correct database schema field names)
      let query = adminSupabase
        .from('cartoon_images')
        .select(`
          id,
          original_cloudinary_url,
          cartoonized_cloudinary_url,
          cartoon_style,
          character_description,
          original_prompt,
          generation_count,
          cartoonized_cloudinary_public_id,
          created_at
        `)
        .eq('user_id', userId);

      // Apply style filter if provided (using correct database field name)
      if (styleFilter) {
        query = query.eq('cartoon_style', styleFilter);
      }

      // Apply sorting
      query = query.order(sortBy === 'style' ? 'cartoon_style' : sortBy, { ascending: sortOrder === 'asc' });

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
        .eq('user_id', userId);

      if (styleFilter) {
        countQuery = countQuery.eq('cartoon_style', styleFilter);
      }

      const { count: totalCount, error: countError } = await countQuery;

      if (countError) {
        console.warn('⚠️ Count query failed:', countError);
      }

      // ✅ Map database fields to frontend-expected names
      const normalizedCartoons = cartoons?.map((cartoon: any) => ({
        id: cartoon.id,
        originalUrl: cartoon.original_cloudinary_url,    // Map DB field to frontend expectation
        cartoonUrl: cartoon.cartoonized_cloudinary_url,  // Map DB field to frontend expectation
        style: cartoon.cartoon_style,                    // Map DB field to frontend expectation
        characterDescription: cartoon.character_description,
        originalPrompt: cartoon.original_prompt,
        generationCount: cartoon.generation_count,
        cloudinaryPublicId: cartoon.cartoonized_cloudinary_public_id,
        createdAt: cartoon.created_at,
        createdAtFormatted: new Date(cartoon.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      })) || [];

      // Organize data by style for better UX
      const cartoonsByStyle = normalizedCartoons.reduce((acc: any, cartoon: any) => {
        if (!acc[cartoon.style]) {
          acc[cartoon.style] = [];
        }
        acc[cartoon.style].push(cartoon);
        return acc;
      }, {});

      // Calculate pagination metadata
      const hasMore = totalCount ? (offset + limit) < totalCount : false;
      const totalPages = totalCount ? Math.ceil(totalCount / limit) : 0;
      const currentPage = Math.floor(offset / limit) + 1;

      // Generate style statistics
      const styleStats = normalizedCartoons.reduce((acc: any, cartoon: any) => {
        acc[cartoon.style] = (acc[cartoon.style] || 0) + 1;
        return acc;
      }, {});

      console.log(`✅ Fetched ${normalizedCartoons.length} cartoons for user ${userId}`);

      return NextResponse.json({
        success: true,
        cartoons: normalizedCartoons,
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