import { NextResponse } from 'next/server';
import { jobWorker } from '@/lib/background-jobs/worker';
import { jobManager } from '@/lib/background-jobs/job-manager';
import { jobConfig } from '@/lib/background-jobs/config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Optional: Add admin authentication
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader?.startsWith('Bearer ')) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Parse request body for options
    const body = await request.json().catch(() => ({}));
    const { 
      maxJobs = 10, 
      specificJobId, 
      cleanup = false, 
      cleanupDays = 7,
      forceProcessing = false,
      jobTypes = [],
    } = body;

    console.log('🔄 Manual job processing triggered');

    const results: any = {
      timestamp: new Date().toISOString(),
      processed: 0,
      errors: 0,
      skipped: 0,
      configuration: jobConfig.getConfigSummary(),
    };

    // Health check first
    if (!jobWorker.isHealthy()) {
      return NextResponse.json({
        ...results,
        error: 'Job processing system is not healthy',
        health: await jobWorker.getQueueStatus(),
      }, { status: 503 });
    }

    // Check if auto-processing is enabled (unless forced)
    if (!forceProcessing && !jobConfig.isFeatureEnabled('enableAutoProcessing')) {
      return NextResponse.json({
        ...results,
        error: 'Automatic processing is disabled',
        message: 'Use forceProcessing=true to override this setting',
      }, { status: 400 });
    }

    // Process specific job if requested
    if (specificJobId) {
      console.log(`🎯 Processing specific job: ${specificJobId}`);
      const success = await jobWorker.processJobById(specificJobId);
      
      results.processed = success ? 1 : 0;
      results.errors = success ? 0 : 1;
      results.specificJob = {
        jobId: specificJobId,
        success,
      };
    } else {
      // Process multiple jobs
      console.log(`📋 Processing up to ${maxJobs} jobs`);
      
      // Apply job type filter if specified
      const filter: any = {};
      if (jobTypes.length > 0) {
        filter.types = jobTypes;
        results.filteredTypes = jobTypes;
      }

      const stats = await jobWorker.processJobs(maxJobs, filter);
      
      results.processed = stats.processed;
      results.errors = stats.errors;
      results.skipped = stats.skipped;
      results.details = stats.details || [];
    }

    // Optional cleanup
    if (cleanup) {
      console.log(`🧹 Running cleanup (${cleanupDays} days)`);
      try {
        const { jobMonitor } = await import('@/lib/background-jobs/monitor');
        const cleaned = await jobMonitor.cleanupOldJobs(cleanupDays);
        results.cleanup = {
          cleaned,
          olderThanDays: cleanupDays,
        };
      } catch (cleanupError) {
        console.error('❌ Cleanup failed:', cleanupError);
        results.cleanup = {
          error: 'Cleanup failed',
          details: cleanupError.message,
        };
      }
    }

    // Get current queue status
    const queueStatus = await jobWorker.getQueueStatus();
    results.queueStatus = queueStatus;

    // Get job statistics
    const jobStats = await jobManager.getJobStats();
    results.statistics = jobStats;

    // Add performance metrics
    results.performance = {
      processingRate: results.processed > 0 ? results.processed / (Date.now() - new Date(results.timestamp).getTime()) * 1000 : 0,
      errorRate: results.processed > 0 ? (results.errors / (results.processed + results.errors)) * 100 : 0,
      efficiency: results.processed > 0 ? (results.processed / (results.processed + results.skipped)) * 100 : 0,
    };

    // Add recommendations based on results
    results.recommendations = generateRecommendations(results, queueStatus);

    console.log(`✅ Manual processing complete: ${results.processed} processed, ${results.errors} errors`);

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('❌ Manual job processing error:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process jobs',
        timestamp: new Date().toISOString(),
        processed: 0,
        errors: 1,
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined,
        recommendations: [
          'Check system logs for detailed error information',
          'Verify database connectivity',
          'Ensure all required environment variables are set',
        ],
      },
      { status: 500 }
    );
  }
}

// GET endpoint for status checking
export async function GET() {
  try {
    const queueStatus = await jobWorker.getQueueStatus();
    const jobStats = await jobManager.getJobStats();
    const configSummary = jobConfig.getConfigSummary();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      healthy: jobWorker.isHealthy(),
      worker: jobWorker.getStats(),
      queue: queueStatus,
      statistics: jobStats,
      configuration: configSummary,
      features: {
        autoProcessing: jobConfig.isFeatureEnabled('enableAutoProcessing'),
        priorityProcessing: jobConfig.isFeatureEnabled('enablePriorityProcessing'),
        metricsCollection: jobConfig.isFeatureEnabled('enableMetricsCollection'),
        healthChecks: jobConfig.isFeatureEnabled('enableHealthChecks'),
      },
    });

  } catch (error: any) {
    console.error('❌ Status check error:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to get status',
        timestamp: new Date().toISOString(),
        healthy: false,
      },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function generateRecommendations(results: any, queueStatus: any): string[] {
  const recommendations: string[] = [];

  // Queue depth recommendations
  if (queueStatus.pending > 20) {
    recommendations.push('High queue depth detected - consider increasing processing frequency');
  }

  // Error rate recommendations
  if (results.performance.errorRate > 10) {
    recommendations.push('High error rate detected - investigate failing jobs');
  }

  // Processing efficiency recommendations
  if (results.performance.efficiency < 80) {
    recommendations.push('Low processing efficiency - check for stuck or problematic jobs');
  }

  // No jobs processed recommendations
  if (results.processed === 0 && queueStatus.pending > 0) {
    recommendations.push('No jobs processed despite pending queue - check system health');
  }

  // Success recommendations
  if (results.processed > 0 && results.errors === 0) {
    recommendations.push('Processing completed successfully - system operating normally');
  }

  return recommendations;
}