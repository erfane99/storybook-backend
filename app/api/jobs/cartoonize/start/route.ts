import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ 
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY environment variable is missing');
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.',
          configurationError: true
        },
        { status: 500 }
      );
    }

    // Initialize server-side Supabase client for authentication (uses anon key)
    const cookieStore = cookies();
    const authSupabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Initialize admin Supabase client for job creation (uses service role key)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user (optional for cartoonize)
    let userId: string | undefined;
    try {
      const {
        data: { user },
        error: authError,
      } = await authSupabase.auth.getUser();

      if (!authError && user) {
        userId = user.id;
      }
    } catch (authError) {
      // Continue without user ID - cartoonize can work anonymously
      console.log('No authenticated user, proceeding anonymously');
    }

    // Handle both JSON and FormData inputs
    let prompt: string;
    let style: string = 'semi-realistic';
    let imageUrl: string | undefined;

    const contentType = request.headers.get('content-type');

    if (contentType?.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('image') as File;
      prompt = formData.get('prompt') as string || '';
      style = formData.get('style') as string || 'semi-realistic';

      if (!file || file.size === 0) {
        return NextResponse.json({ 
          error: 'No image file provided' 
        }, { status: 400 });
      }

      // Upload image to temporary storage (Cloudinary)
      try {
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);

        const uploadResponse = await fetch('/api/upload-image', {
          method: 'POST',
          body: uploadFormData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload image');
        }

        const { secure_url } = await uploadResponse.json();
        imageUrl = secure_url;
      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError);
        return NextResponse.json({ 
          error: 'Failed to upload image for processing' 
        }, { status: 500 });
      }
    } else {
      // Handle JSON input
      const body = await request.json();
      prompt = body.prompt;
      style = body.style || 'semi-realistic';
      imageUrl = body.imageUrl;
    }

    // Validation
    if (!prompt?.trim()) {
      return NextResponse.json({ 
        error: 'Prompt is required' 
      }, { status: 400 });
    }

    // Validate style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(style)) {
      return NextResponse.json({ 
        error: 'Invalid style. Must be one of: ' + validStyles.join(', ') 
      }, { status: 400 });
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // ✅ DATABASE-FIRST: Store in individual columns matching exact database schema
    const { error: insertError } = await adminSupabase
      .from('cartoonize_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing image cartoonization',
        // Individual columns matching database schema
        original_image_data: prompt,    // Database column for prompt
        style: style,                   // Database column for style
        original_cloudinary_url: imageUrl, // Database column for source image
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3,
        has_errors: false
      });

    if (insertError) {
      console.error('❌ Failed to create cartoonize job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create cartoonize job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (cartoonize is usually fast)
    const estimatedMinutes = 2; // Cartoonization typically takes 1-3 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created cartoonize job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/cartoonize/status/${jobId}`,
      message: 'Image cartoonization job created. Processing will be handled by worker service.',
      processingInfo: {
        style,
        promptLength: prompt.length,
        hasSourceImage: !!imageUrl
      }
    });

  } catch (error: unknown) {
    console.error('❌ Cartoonize job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create cartoonize job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}