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

    const {
      image_prompt,
      character_description,
      emotion,
      audience,
      isReusedImage,
      cartoon_image,
      user_id,
      style = 'storybook',
      characterArtStyle,
      layoutType,
      panelType
    } = await request.json();

    // Validation
    if (!image_prompt || !character_description || !emotion) {
      return NextResponse.json(
        { error: 'Missing required fields: image_prompt, character_description, and emotion are required' }, 
        { status: 400 }
      );
    }

    // Validate emotion
    const validEmotions = ['happy', 'sad', 'excited', 'scared', 'angry', 'surprised', 'curious', 'confused', 'determined'];
    if (!validEmotions.includes(emotion)) {
      return NextResponse.json(
        { error: 'Invalid emotion. Must be one of: ' + validEmotions.join(', ') },
        { status: 400 }
      );
    }

    // Validate audience
    const validAudiences = ['children', 'young_adults', 'adults'];
    if (!validAudiences.includes(audience)) {
      return NextResponse.json(
        { error: 'Invalid audience. Must be one of: ' + validAudiences.join(', ') },
        { status: 400 }
      );
    }

    // Validate style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(style)) {
      return NextResponse.json(
        { error: 'Invalid style. Must be one of: ' + validStyles.join(', ') },
        { status: 400 }
      );
    }

    // Check for mock mode
    const useMock = process.env.USE_MOCK === 'true';
    if (useMock) {
      return NextResponse.json({
        url: 'https://placekitten.com/1024/1024',
        prompt_used: image_prompt,
        mock: true,
        reused: false
      });
    }

    // Optional cache check for existing images
    if (user_id && cartoon_image) {
      try {
        const { getCachedCartoonImage } = await import('@/lib/supabase/cache-utils');
        const cachedUrl = await getCachedCartoonImage(cartoon_image, style, user_id);
        if (cachedUrl) {
          console.log('✅ Found cached cartoon image');
          return NextResponse.json({ 
            url: cachedUrl, 
            reused: true,
            prompt_used: 'Cached image - no prompt needed',
            cached: true
          });
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache lookup failed, continuing with job creation:', cacheError);
      }
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`🎨 Creating image generation job: ${jobId}`);

    // Create job entry in image_generation_jobs table
    const { data: job, error: insertError } = await adminSupabase
      .from('image_generation_jobs')
      .insert({
        id: jobId,
        user_id: user_id,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing image generation',
        image_prompt: image_prompt,
        character_description: character_description,
        emotion: emotion,
        audience: audience,
        is_reused_image: isReusedImage || false,
        cartoon_image: cartoon_image,
        style: style,
        character_art_style: characterArtStyle || style,
        layout_type: layoutType || 'comic-book-panels',
        panel_type: panelType || 'standard',
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3,
        has_errors: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create image generation job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create image generation job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time
    const estimatedMinutes = 2; // Image generation typically takes 1-3 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created image generation job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`,
      message: 'Image generation job created. Processing will be handled by worker service.',
      imageInfo: {
        style,
        emotion,
        audience,
        isReusedImage: !!isReusedImage,
        promptLength: image_prompt.length,
        panelType: panelType || 'standard'
      }
    });

  } catch (error: unknown) {
    console.error('❌ Image generation job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create image generation job',
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