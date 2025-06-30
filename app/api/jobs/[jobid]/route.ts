import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Job table configuration for systematic querying
const JOB_TABLES = [
  {
    table: 'storybook_jobs',
    type: 'storybook',
    resultFields: ['storybook_entry_id', 'processed_pages'],
    estimatedMinutesPerProgress: 0.1
  },
  {
    table: 'auto_story_jobs',
    type: 'auto-story',
    resultFields: ['storybook_entry_id', 'generated_story'],
    estimatedMinutesPerProgress: 0.05
  },
  {
    table: 'cartoonize_jobs',
    type: 'cartoonize',
    resultFields: ['generated_image_url', 'final_cloudinary_url'],
    estimatedMinutesPerProgress: 1.2 / 100 // 1.2 seconds per progress point
  },
  {
    table: 'scene_generation_jobs',
    type: 'scenes',
    resultFields: ['generated_scenes'],
    estimatedMinutesPerProgress: 0.03
  },
  {
    table: 'image_generation_jobs',
    type: 'images',
    resultFields: ['generated_image_url', 'final_prompt_used'],
    estimatedMinutesPerProgress: 1.5 / 100 // 1.5 seconds per progress point
  }
] as const;

interface JobResult {
  jobId: string;
  jobType: string;
  status: string;
  progress: number;
  currentStep: string | null;
  currentPhase: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedTimeRemaining?: string;
  result?: any;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
  processingTimeSeconds?: number;
  message?: string;
  jobMetadata?: any;
}

/**
 * Calculate estimated time remaining based on job type and progress
 */
function calculateEstimatedTimeRemaining(
  jobType: string,
  progress: number,
  status: string
): string | null {
  if (status !== 'processing' || progress >= 100) {
    return null;
  }

  const jobConfig = JOB_TABLES.find(config => config.type === jobType);
  if (!jobConfig) {
    return null;
  }

  const remainingProgress = 100 - progress;
  const estimatedMinutes = Math.max(0.5, remainingProgress * jobConfig.estimatedMinutesPerProgress);
  
  if (estimatedMinutes < 1) {
    const estimatedSeconds = Math.ceil(estimatedMinutes * 60);
    return `${estimatedSeconds} seconds`;
  } else {
    return `${Math.ceil(estimatedMinutes)} minutes`;
  }
}

/**
 * Determine current processing phase based on job type and progress
 */
function getCurrentPhase(jobType: string, progress: number): string | null {
  if (progress >= 100) {
    return null;
  }

  switch (jobType) {
    case 'storybook':
      if (progress < 25) return 'Analyzing story content';
      if (progress < 50) return 'Creating comic book panel breakdown';
      if (progress < 90) return 'Generating character-consistent panel illustrations';
      return 'Assembling comic book pages';

    case 'auto-story':
      if (progress < 25) return 'Generating story content';
      if (progress < 50) return 'Creating scene breakdown';
      if (progress < 90) return 'Generating illustrations';
      return 'Assembling final storybook';

    case 'cartoonize':
      if (progress < 20) return 'Analyzing image content';
      if (progress < 50) return 'Generating cartoon style';
      if (progress < 80) return 'Applying artistic filters';
      return 'Finalizing cartoon image';

    case 'scenes':
      if (progress < 30) return 'Analyzing story structure';
      if (progress < 60) return 'Breaking down into scenes';
      if (progress < 90) return 'Creating visual descriptions';
      return 'Finalizing scene layout';

    case 'images':
      if (progress < 25) return 'Processing scene description';
      if (progress < 50) return 'Generating base composition';
      if (progress < 75) return 'Adding character details';
      return 'Finalizing illustration';

    default:
      return 'Processing...';
  }
}

/**
 * Format job results based on job type
 */
function formatJobResults(job: any, jobType: string): any {
  if (job.status !== 'completed') {
    return undefined;
  }

  switch (jobType) {
    case 'storybook':
      return {
        storybook_id: job.storybook_entry_id,
        pages: job.processed_pages || job.pages,
        has_errors: job.has_errors || false
      };

    case 'auto-story':
      return {
        storybook_id: job.storybook_entry_id,
        generated_story: job.generated_story
      };

    case 'cartoonize':
      return {
        url: job.generated_image_url,
        temporaryUrl: job.generated_image_url,
        permanentUrl: job.final_cloudinary_url || null,
        cached: !!job.final_cloudinary_url,
        style: job.style || 'semi-realistic',
        originalPrompt: job.original_image_data || null
      };

    case 'scenes':
      return {
        pages: job.generated_scenes,
        character_description: job.character_description
      };

    case 'images':
      return {
        url: job.generated_image_url,
        prompt_used: job.final_prompt_used || job.image_prompt,
        reused: job.is_reused_image || false
      };

    default:
      return job.result_data || {};
  }
}

/**
 * Create job metadata based on job type and data
 */
function createJobMetadata(job: any, jobType: string): any {
  const baseMetadata = {
    type: jobType,
    userId: job.user_id || null
  };

  switch (jobType) {
    case 'storybook':
      return {
        ...baseMetadata,
        title: job.title,
        audience: job.audience,
        characterArtStyle: job.character_art_style,
        layoutType: job.layout_type,
        hasCharacterImage: !!job.character_image
      };

    case 'auto-story':
      return {
        ...baseMetadata,
        genre: job.genre,
        audience: job.audience,
        characterArtStyle: job.character_art_style,
        layoutType: job.layout_type
      };

    case 'cartoonize':
      return {
        ...baseMetadata,
        hasSourceImage: !!job.original_cloudinary_url,
        style: job.style || 'semi-realistic'
      };

    case 'scenes':
      return {
        ...baseMetadata,
        audience: job.audience,
        hasCharacterImage: !!job.character_image
      };

    case 'images':
      return {
        ...baseMetadata,
        style: job.style || 'storybook',
        audience: job.audience,
        emotion: job.emotion,
        isReusedImage: !!job.is_reused_image
      };

    default:
      return baseMetadata;
  }
}

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

    // Validate job ID format (should be UUID)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(jobid)) {
      return NextResponse.json(
        { error: 'Invalid job ID format' },
        { status: 400 }
      );
    }

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`🔍 Searching for job ${jobid} across all job tables...`);

    // Search for the job across all job tables
    let foundJob: any = null;
    let jobType: string = '';

    for (const config of JOB_TABLES) {
      try {
        const { data: job, error } = await adminSupabase
          .from(config.table)
          .select('*')
          .eq('id', jobid)
          .single();

        if (!error && job) {
          foundJob = job;
          jobType = config.type;
          console.log(`✅ Found ${jobType} job ${jobid} in ${config.table}`);
          break;
        }
      } catch (tableError) {
        // Continue searching other tables
        console.warn(`⚠️ Error searching ${config.table}:`, tableError);
      }
    }

    if (!foundJob) {
      console.warn(`❌ Job ${jobid} not found in any job table`);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate estimated time remaining and current phase
    const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
      jobType,
      foundJob.progress,
      foundJob.status
    );
    const currentPhase = getCurrentPhase(jobType, foundJob.progress);

    // Calculate processing time if completed
    let processingTimeSeconds: number | undefined;
    if (foundJob.started_at && foundJob.completed_at) {
      const processingTimeMs = new Date(foundJob.completed_at).getTime() - new Date(foundJob.started_at).getTime();
      processingTimeSeconds = Math.round(processingTimeMs / 1000);
    }

    // Format results based on job type
    const result = formatJobResults(foundJob, jobType);

    // Create job metadata
    const jobMetadata = createJobMetadata(foundJob, jobType);

    // Build comprehensive response
    const response: JobResult = {
      jobId: foundJob.id,
      jobType,
      status: foundJob.status,
      progress: foundJob.progress,
      currentStep: foundJob.current_step,
      currentPhase,
      createdAt: foundJob.created_at,
      updatedAt: foundJob.updated_at,
      estimatedTimeRemaining,
      jobMetadata
    };

    // Add timing information
    if (foundJob.started_at) {
      response.startedAt = foundJob.started_at;
    }
    if (foundJob.completed_at) {
      response.completedAt = foundJob.completed_at;
    }
    if (processingTimeSeconds !== undefined) {
      response.processingTimeSeconds = processingTimeSeconds;
    }

    // Add results if completed
    if (foundJob.status === 'completed' && result) {
      response.result = result;
      
      // Add job-type specific success messages
      switch (jobType) {
        case 'storybook':
          response.message = 'Storybook generation completed successfully';
          if (result.storybook_id) {
            response.storybookUrl = `/storybook/${result.storybook_id}`;
          }
          break;
        case 'auto-story':
          response.message = 'Auto-story generation completed successfully';
          if (result.storybook_id) {
            response.storybookUrl = `/storybook/${result.storybook_id}`;
          }
          break;
        case 'cartoonize':
          response.message = 'Image cartoonization completed successfully';
          // Add processing information for cartoonize jobs
          response.processingInfo = {
            cached: !!result.permanentUrl,
            style: result.style,
            hasOriginalData: !!result.originalPrompt,
            message: result.permanentUrl 
              ? 'Result retrieved from cache for faster delivery' 
              : 'New cartoon image generated',
            canSavePermanently: !result.permanentUrl
          };
          // Add save options for temporary results
          if (!result.permanentUrl && result.url) {
            response.saveOptions = {
              available: true,
              temporaryUrl: result.url,
              suggestedStyle: result.style,
              saveEndpoint: '/api/cartoon/save'
            };
          }
          break;
        case 'scenes':
          response.message = 'Scene generation completed successfully';
          // Include scene count and page information
          if (result.pages && Array.isArray(result.pages)) {
            const totalScenes = result.pages.reduce((total: number, page: any) => 
              total + (page.scenes ? page.scenes.length : 0), 0
            );
            response.sceneInfo = {
              totalPages: result.pages.length,
              totalScenes,
              averageScenesPerPage: Math.round(totalScenes / result.pages.length * 10) / 10
            };
          }
          break;
        case 'images':
          response.message = 'Image generation completed successfully';
          response.generationInfo = {
            reused: result.reused,
            promptUsed: result.prompt_used,
            style: jobMetadata.style
          };
          break;
        default:
          response.message = 'Job completed successfully';
      }
    }

    // Add error information if failed
    if (foundJob.status === 'failed') {
      response.error = foundJob.error_message || `${jobType} job failed`;
      response.retryCount = foundJob.retry_count;
      response.maxRetries = foundJob.max_retries;
      
      // Add retry information
      if (foundJob.retry_count < foundJob.max_retries) {
        response.canRetry = true;
        response.nextRetryIn = '30 seconds'; // Typical retry delay
      }
    }

    // Add retry information if applicable
    if (foundJob.retry_count > 0) {
      response.retryCount = foundJob.retry_count;
      response.maxRetries = foundJob.max_retries;
      response.retryHistory = `Attempted ${foundJob.retry_count} time(s)`;
    }

    // Set appropriate cache headers
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (['completed', 'failed', 'cancelled'].includes(foundJob.status)) {
      headers['Cache-Control'] = 'public, max-age=3600'; // Cache completed jobs for 1 hour
    } else {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'; // Don't cache active jobs
    }

    console.log(`✅ Returning ${jobType} job status for ${jobid}: ${foundJob.status} (${foundJob.progress}%)`);

    return NextResponse.json(response, { headers });

  } catch (error: unknown) {
    console.error('❌ Generic job status check error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get job status',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}