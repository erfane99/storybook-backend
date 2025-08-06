import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const { imageUrl, analysisType = 'basic', includePersonality = false, includeClothing = true, includeBackground = false } = await request.json();

    // Validation
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch (urlError) {
      return NextResponse.json(
        { error: 'Invalid image URL format' },
        { status: 400 }
      );
    }

    // Validate analysis type
    const validAnalysisTypes = ['basic', 'detailed', 'story-focused'];
    if (!validAnalysisTypes.includes(analysisType)) {
      return NextResponse.json(
        { error: 'Invalid analysis type. Must be one of: ' + validAnalysisTypes.join(', ') },
        { status: 400 }
      );
    }

    // Optional user authentication (character description can work anonymously)
    let userId: string | undefined;
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const { validateAuthToken, extractUserId } = await import('@/lib/auth-utils');
        const authResult = await validateAuthToken(request);
        const { userId: validatedUserId } = extractUserId(authResult);
        userId = validatedUserId || undefined;
      }
    } catch (authError) {
      // Continue without user ID - character description can work anonymously
      console.log('Authentication optional for character description, proceeding anonymously');
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`🔍 Creating character description job: ${jobId}`);

    // Create job entry in character_description_jobs table
    // Note: This table may need to be created if it doesn't exist
    const { data: job, error: insertError } = await adminSupabase
      .from('character_description_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing character analysis',
        image_url: imageUrl,
        analysis_type: analysisType,
        include_personality: includePersonality,
        include_clothing: includeClothing,
        include_background: includeBackground,
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3,
        has_errors: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create character description job:', insertError);
      
      // If table doesn't exist, provide helpful error message
      if (insertError.code === '42P01') {
        return NextResponse.json(
          { 
            error: 'Character description service not available. Database table missing.',
            configurationError: true
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to create character description job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time
    const estimatedMinutes = 1; // Character description typically takes 30-90 seconds
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created character description job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`,
      message: 'Character description job created. Processing will be handled by worker service.',
      analysisInfo: {
        analysisType,
        includePersonality,
        includeClothing,
        includeBackground,
        imageUrl: imageUrl.substring(0, 100) + '...' // Truncated for security
      }
    });

  } catch (error: unknown) {
    console.error('❌ Character description job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create character description job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
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