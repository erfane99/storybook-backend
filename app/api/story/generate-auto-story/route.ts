import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * @deprecated Use POST /api/jobs/auto-story/start instead (multi-character support, current pipeline).
 */
export async function POST() {
  console.warn(
    '⚠️ DEPRECATED: /api/story/generate-auto-story is deprecated. Use /api/jobs/auto-story/start instead.'
  );
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Use /api/jobs/auto-story/start instead.',
      deprecated: true,
      newEndpoint: '/api/jobs/auto-story/start',
    },
    { status: 410 }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}
