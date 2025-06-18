import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get job status from cartoonize_jobs table
    const { data: job, error } = await adminSupabase
      .from('cartoonize_jobs')
      .select('*')
      .eq('id', jobid)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate estimated time remaining for cartoonization
    let estimatedTimeRemaining: string | null = null;
    let currentPhase: string | null = null;

    if (job.status === 'processing' && job.progress < 100) {
      const remainingProgress = 100 - job.progress;
      const estimatedSeconds = Math.max(30, remainingProgress * 1.2); // Cartoonize is fast
      
      if (estimatedSeconds < 60) {
        estimatedTimeRemaining = `${Math.ceil(estimatedSeconds)} seconds`;
      } else {
        estimatedTimeRemaining = `${Math.ceil(estimatedSeconds / 60)} minutes`;
      }

      // Determine current phase based on progress
      if (job.progress < 20) {
        currentPhase = 'Analyzing image content';
      } else if (job.progress < 50) {
        currentPhase = 'Generating cartoon style';
      } else if (job.progress < 80) {
        currentPhase = 'Applying artistic filters';
      } else {
        currentPhase = 'Finalizing cartoon image';
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
    if (job.status === 'completed' && job.generated_image_url) {
      response.result = {
        url: job.generated_image_url,
        cached: !!job.final_cloudinary_url
      };
      response.message = 'Image cartoonization completed successfully';
      
      response.processingInfo = {
        cached: !!job.final_cloudinary_url,
        message: job.final_cloudinary_url ? 'Result retrieved from cache for faster delivery' : 'New cartoon image generated'
      };
    }

    // Add error information if failed
    if (job.status === 'failed') {
      response.error = job.error_message || 'Image cartoonization failed';
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
    console.error('❌ Cartoonize status check error:', error);
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