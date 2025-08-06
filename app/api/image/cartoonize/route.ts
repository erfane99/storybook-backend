import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import cloudinary from '@/lib/cloudinary';

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

    // Validate Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('❌ Missing Cloudinary environment variables');
      return NextResponse.json(
        { error: 'Image storage service not configured. Please check server configuration.' },
        { status: 500 }
      );
    }

    // Handle both JSON and FormData inputs
    let prompt: string;
    let style: string = 'semi-realistic';
    let imageUrl: string | undefined;
    let audience: string = 'children';

    const contentType = request.headers.get('content-type');

    if (contentType?.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('image') as File;
      prompt = formData.get('prompt') as string || '';
      style = formData.get('style') as string || 'semi-realistic';
      audience = formData.get('audience') as string || 'children';

      if (!file || file.size === 0) {
        return NextResponse.json({ 
          error: 'No image file provided' 
        }, { status: 400 });
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({
          error: 'Image file too large. Maximum size is 10MB'
        }, { status: 400 });
      }

      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return NextResponse.json({
          error: 'Invalid file type. Supported formats: JPEG, PNG, WebP'
        }, { status: 400 });
      }

      // Upload image to Cloudinary
      try {
        console.log('☁️ Uploading image to Cloudinary...');
        
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadResult = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { 
              resource_type: 'image',
              folder: 'storybook/originals',
              transformation: [
                { width: 1024, height: 1024, crop: 'limit' },
                { quality: 'auto:best' }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        imageUrl = uploadResult.secure_url;
        console.log('✅ Image uploaded to Cloudinary successfully');
      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', uploadError);
        return NextResponse.json({ 
          error: 'Failed to upload image for processing' 
        }, { status: 500 });
      }
    } else {
      // Handle JSON input
      const body = await request.json();
      prompt = body.prompt;
      style = body.style || 'semi-realistic';
      audience = body.audience || 'children';
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

    // Validate audience
    const validAudiences = ['children', 'young_adults', 'adults'];
    if (!validAudiences.includes(audience)) {
      return NextResponse.json({ 
        error: 'Invalid audience. Must be one of: ' + validAudiences.join(', ') 
      }, { status: 400 });
    }

    // Optional user authentication (cartoonize can work anonymously)
    let userId: string | undefined;
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        // Extract user ID from token if provided (optional for cartoonize)
        const { validateAuthToken, extractUserId } = await import('@/lib/auth-utils');
        const authResult = await validateAuthToken(request);
        const { userId: validatedUserId } = extractUserId(authResult);
        userId = validatedUserId || undefined;
      }
    } catch (authError) {
      // Continue without user ID - cartoonize can work anonymously
      console.log('Authentication optional for cartoonize, proceeding anonymously');
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`🎨 Creating cartoonize job: ${jobId}`);

    // Create job entry in cartoonize_jobs table
    const { data: job, error: insertError } = await adminSupabase
      .from('cartoonize_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing image cartoonization',
        original_image_data: prompt,
        style: style,
        original_cloudinary_url: imageUrl,
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3,
        has_errors: false
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create cartoonize job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create cartoonize job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time
    const estimatedMinutes = 2; // Cartoonization typically takes 1-3 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created cartoonize job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/${jobId}`,
      message: 'Image cartoonization job created. Processing will be handled by worker service.',
      processingInfo: {
        style,
        audience,
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

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}