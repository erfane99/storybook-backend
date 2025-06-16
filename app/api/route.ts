import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    message: 'Storybook Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
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
        cartoonize: '/api/jobs/cartoonize/start',
        autoStory: '/api/jobs/auto-story/start',
        storybook: '/api/jobs/storybook/start',
        scenes: '/api/jobs/scenes/start',
        images: '/api/jobs/images/start',
        health: '/api/jobs/health',
        process: '/api/jobs/process',
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