import { NextResponse } from 'next/server';
import { jobManager } from '@/lib/background-jobs/job-manager';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { jobid: string } }
) {
  try {
    const { jobid } = params;

    if (!jobid) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Get job status
    const job = await jobManager.getJobStatus(jobid);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate estimated time remaining for scene generation
    let estimatedTimeRemaining: string | null = null;
    let currentPhase: string | null = null;

    if (job.status === 'processing' && job.progress < 100) {
      const remainingProgress = 100 - job.progress;
      const estimatedMinutes = Math.max(1, remainingProgress * 0.03); // Scene generation is relatively fast
      estimatedTimeRemaining = `${Math.ceil(estimatedMinutes)} minutes`;

      // Determine current phase based on progress
      if (job.progress < 30) {
        currentPhase = 'Analyzing story structure';
      } else if (job.progress < 60) {
        currentPhase = 'Breaking down into scenes';
      } else if (job.progress < 90) {
        currentPhase = 'Creating visual descriptions';
      } else {
        currentPhase = 'Finalizing scene layout';
      }
    }

    // Prepare response
    const response: any = {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentStep: job.current_step,
      currentPhase,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      estimatedTimeRemaining
    };

    // Add timing information
    if (job.started_at) {
      response.startedAt = job.started_at;
    }
    if (job.completed_at) {
      response.completedAt = job.completed_at;
    }

    // Add results if completed
    if (job.status === 'completed' && job.result_data) {
      response.result = job.result_data;
      response.message = 'Scene generation completed successfully';
      
      // Include scene count and page information - Fixed type checking
      if (job.result_data && 'pages' in job.result_data && job.result_data.pages) {
        const totalScenes = job.result_data.pages.reduce((total: number, page: any) => 
          total + (page.scenes ? page.scenes.length : 0), 0
        );
        response.sceneInfo = {
          totalPages: job.result_data.pages.length,
          totalScenes,
          averageScenesPerPage: Math.round(totalScenes / job.result_data.pages.length * 10) / 10
        };
      }
    }

    // Add error information if failed
    if (job.status === 'failed') {
      response.error = job.error_message || 'Scene generation failed';
      response.retryCount = job.retry_count;
      response.maxRetries = job.max_retries;
    }

    // Add retry information if applicable
    if (job.retry_count > 0) {
      response.retryCount = job.retry_count;
      response.maxRetries = job.max_retries;
    }

    // Set appropriate cache headers
    const headers: Record<string, string> = {};

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      headers['Cache-Control'] = 'public, max-age=3600';
    } else {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    return NextResponse.json(response, { headers });

  } catch (error: unknown) {
    console.error('❌ Scene status check error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get job status',
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