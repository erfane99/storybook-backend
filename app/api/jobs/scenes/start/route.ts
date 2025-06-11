import { NextResponse } from 'next/server';
import { jobManager } from '@/lib/background-jobs/job-manager';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Parse and validate input data
    const { story, characterImage, audience = 'children' } = await request.json();

    // Validation - same as current generate-scenes
    if (!story || story.trim().length < 50) {
      return NextResponse.json({ 
        error: 'Story must be at least 50 characters long.' 
      }, { status: 400 });
    }

    if (!['children', 'young_adults', 'adults'].includes(audience)) {
      return NextResponse.json({ 
        error: 'Invalid audience type' 
      }, { status: 400 });
    }

    // Optional user authentication (scenes can be generated anonymously)
    let userId: string | undefined;
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        // Extract user ID from token if provided (optional)
        // This is for tracking purposes only, not required
      }
    } catch (authError) {
      // Continue without user ID - scenes can be generated anonymously
    }

    // Create background job
    const jobId = await jobManager.createSceneJob({
      story,
      characterImage,
      audience
    }, userId);

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create background job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time based on story length and audience
    const wordCount = story.trim().split(/\s+/).length;
    const baseMinutes = audience === 'children' ? 2 : audience === 'young_adults' ? 3 : 4;
    const estimatedMinutes = Math.max(1, baseMinutes + Math.floor(wordCount / 200));
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    // Dynamic base URL detection
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    console.log(`✅ Created scene generation job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `${baseUrl}/api/jobs/scenes/status/${jobId}`,
      message: 'Scene generation started. Your story will be broken down into illustrated scenes.',
      storyInfo: {
        wordCount,
        audience,
        estimatedScenes: audience === 'children' ? '5-8' : audience === 'young_adults' ? '8-12' : '10-15'
      }
    });

  } catch (error: any) {
    console.error('❌ Scene job creation error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to start scene generation',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}