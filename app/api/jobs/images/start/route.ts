import { NextResponse } from 'next/server';
import { jobManager } from '@/lib/background-jobs/job-manager';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Parse and validate input data
    const { 
      image_prompt, 
      character_description, 
      emotion, 
      audience, 
      isReusedImage, 
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

    // Create background job
    const jobId = await jobManager.createImageJob({
      image_prompt,
      character_description,
      emotion,
      audience,
      isReusedImage,
      cartoon_image,
      style
    }, userId);

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create background job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (single image generation)
    const estimatedMinutes = 2; // Single image generation typically takes 1-3 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    // Dynamic base URL detection
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    console.log(`✅ Created image generation job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `${baseUrl}/api/jobs/image/status/${jobId}`,
      message: 'Image generation started. Creating a custom illustration for your scene.',
      imageInfo: {
        style,
        audience,
        emotion,
        isReusedImage: !!isReusedImage,
        promptLength: image_prompt.length
      }
    });

  } catch (error: any) {
    console.error('❌ Image job creation error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to start image generation',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}