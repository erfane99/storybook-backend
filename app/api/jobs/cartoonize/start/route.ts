import { NextResponse } from 'next/server';
import { jobManager } from '@/lib/background-jobs/job-manager';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Handle both JSON and FormData inputs
    let prompt: string;
    let style: string = 'semi-realistic';
    let imageUrl: string | undefined;
    let userId: string | undefined;

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

        const host = request.headers.get('host');
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        const uploadUrl = `${protocol}://${host}/api/upload-image`;

        const uploadResponse = await fetch(uploadUrl, {
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
      userId = body.user_id;
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

    // Optional user authentication
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ') && !userId) {
        // Extract user ID from token if provided
        // This is optional for cartoonize operations
      }
    } catch (authError) {
      // Continue without user ID - cartoonize can work anonymously
    }

    // Create background job
    const jobId = await jobManager.createCartoonizeJob({
      prompt,
      style,
      imageUrl
    }, userId);

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create background job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time (cartoonize is usually fast)
    const estimatedMinutes = 2; // Cartoonization typically takes 1-3 minutes
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    // Dynamic base URL detection
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    console.log(`✅ Created cartoonize job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `${baseUrl}/api/jobs/cartoonize/status/${jobId}`,
      message: 'Image cartoonization started. Your image will be transformed into cartoon style.',
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
        error: error instanceof Error ? error.message : 'Failed to start image cartoonization',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}