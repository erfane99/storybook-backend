import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    message: 'Storybook Backend API',
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    architecture: 'microservices',
    description: 'Pure API service - job processing handled by dedicated worker service',
    endpoints: {
      health: '/api/health',
      image: {
        describe: '/api/image/describe',
        cartoonize: '/api/image/cartoonize',
      },
      upload: '/api/upload-image',
      auth: {
        sendOtp: '/api/send-otp',
        verifyOtp: '/api/verify-otp',
      },
      story: {
        generateScenes: '/api/story/generate-scenes',
        generateCartoonImage: '/api/story/generate-cartoon-image',
        generateAutoStory: '/api/story/generate-auto-story',
        createStorybook: '/api/story/create-storybook',
      },
      jobs: {
        cartoonize: {
          start: '/api/jobs/cartoonize/start',
          status: '/api/jobs/cartoonize/status/{jobId}'
        },
        autoStory: {
          start: '/api/jobs/auto-story/start',
          status: '/api/jobs/auto-story/status/{jobId}'
        },
        storybook: {
          start: '/api/jobs/storybook/start',
          status: '/api/jobs/storybook/status/{jobId}'
        },
        scenes: {
          start: '/api/jobs/scenes/start',
          status: '/api/jobs/scenes/status/{jobId}'
        },
        images: {
          start: '/api/jobs/images/start',
          status: '/api/jobs/images/status/{jobId}'
        }
      },
    },
  });
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}