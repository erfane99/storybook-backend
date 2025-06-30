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

    // Parse and validate input data
    const { 
      image_prompt, 
      character_description, 
      emotion, 
      audience, 
      is_reused_image,  // ✅ FIXED: Use database field name
      cartoon_image, 
      style = 'storybook' 
    } = await request.json();

    // Validation - same as current generate-cartoon-image
    if (!image_prompt || !character_description || !emotion) {
      return NextResponse.json({ 
        error: 'Missing required fields: image_prompt, character_description, and emotion are required' 
      }, { status: 400 });
    }

    if (!['children', 'young_adults', 'adults'].includes(audience)) {
      return NextResponse.json({ 
        error: 'Invalid audience type' 
      }, { status: 400 });
    }

    // Validate style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(style)) {
      return NextResponse.json({ 
        error: 'Invalid style. Must be one of: ' + validStyles.join(', ') 
      }, { status: 400 });
    }

    // Optional user authentication
    let userId: string | undefined;
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        // Extract user ID from token if provided
        // This is optional for image generation
      }
    } catch (authError) {
      // Continue without user ID - image generation can work anonymously
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // ✅ DATABASE-FIRST: Store in individual columns matching exact database schema
    const { error: insertError } = await adminSupabase
      .from('image_generation_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing image generation',
        // Individual columns matching database schema
        image_prompt: image_prompt,
        character_description: character_description,
        emotion: emotion,
        audience: audience,
        is_reused_image: is_reused_image,  // ✅ FIXED: Use correct field name
        cartoon_image: cartoon_image,
        style: style,
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3
      });

    if (insertError) {
      console.error('❌ Failed to create image job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create image job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (single image generation)
    const estimatedMinutes = 2; // Single image generation typically takes 1-3 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created image generation job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`, // ✅ FIXED: Use generic job status endpoint
      message: 'Image generation job created. Processing will be handled by worker service.',
      imageInfo: {
        style,
        audience,
        emotion,
        isReusedImage: !!is_reused_image,
        promptLength: image_prompt.length
      }
    });

  } catch (error: unknown) {
    console.error('❌ Image job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create image job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}