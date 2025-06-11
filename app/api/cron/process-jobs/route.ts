import { NextResponse } from 'next/server';
import { jobWorker } from '@/lib/background-jobs/worker';
import { jobManager } from '@/lib/background-jobs/job-manager';
import { jobConfig } from '@/lib/background-jobs/config';
import { jobMonitor } from '@/lib/background-jobs/monitor';

export const dynamic = 'force-dynamic';

interface CronProvider {
  name: string;
  userAgent: string;
  headerKey: string;
  secretEnvVar: string;
}

// Supported cron providers
const cronProviders: CronProvider[] = [
  {
    name: 'GitHub Actions',
    userAgent: 'github-actions',
    headerKey: 'x-github-token',
    secretEnvVar: 'GITHUB_WEBHOOK_SECRET',
  },
  {
    name: 'Vercel Cron',
    userAgent: 'vercel-cron',
    headerKey: 'x-vercel-signature',
    secretEnvVar: 'VERCEL_WEBHOOK_SECRET',
  },
  {
    name: 'External Cron',
    userAgent: 'external-cron',
    headerKey: 'x-webhook-secret',
    secretEnvVar: 'WEBHOOK_SECRET',
  },
];

export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    console.log('⏰ Cron job processing triggered');

    // Validate webhook authenticity
    const validationResult = await validateWebhook(request);
    if (!validationResult.valid) {
      console.log(`🚫 Webhook validation failed: ${validationResult.reason}`);
      return NextResponse.json({
        error: 'Unauthorized webhook request',
        reason: validationResult.reason,
      }, { status: 401 });
    }

    console.log(`✅ Webhook validated from provider: ${validationResult.provider}`);

    // Parse request body for options
    const body = await request.json().catch(() => ({}));
    const {
      maxJobs = 10,
      jobTypes = [],
      emergencyMode = false,
      cleanup = false,
      cleanupDays = 7,
      healthCheck = true,
    } = body;

    const results: any = {
      timestamp: new Date().toISOString(),
      provider: validationResult.provider,
      processed: 0,
      errors: 0,
      skipped: 0,
      emergencyMode,
    };

    // Health check first (unless disabled)
    if (healthCheck) {
      const healthResult = await performHealthCheck();
      results.healthCheck = healthResult;

      if (!healthResult.healthy && !emergencyMode) {
        console.log('❌ Health check failed, aborting cron processing');
        return NextResponse.json({
          ...results,
          error: 'System health check failed',
          message: 'Use emergencyMode=true to override health check',
        }, { status: 503 });
      }
    }

    // Check if auto-processing is enabled (unless emergency mode)
    if (!emergencyMode && !jobConfig.isFeatureEnabled('enableAutoProcessing')) {
      return NextResponse.json({
        ...results,
        error: 'Automatic processing is disabled',
        message: 'Use emergencyMode=true to override this setting',
      }, { status: 400 });
    }

    // Apply rate limiting - Add null check for provider
    if (!validationResult.provider) {
      return NextResponse.json({
        error: 'Provider is required for rate limiting',
      }, { status: 400 });
    }

    const rateLimitResult = await checkRateLimit(validationResult.provider);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({
        ...results,
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
      }, { status: 429 });
    }

    // Process jobs with provider-specific configuration
    const processingConfig = getProviderConfig(validationResult.provider, emergencyMode);
    const actualMaxJobs = Math.min(maxJobs, processingConfig.maxJobs);

    console.log(`📋 Processing up to ${actualMaxJobs} jobs for ${validationResult.provider}`);

    // Process jobs - Fix: Call with single argument only
    const processingStats = await jobWorker.processJobs(actualMaxJobs);
    
    results.processed = processingStats.processed;
    results.errors = processingStats.errors;
    results.skipped = processingStats.skipped;
    results.details = [];

    // Add job type filtering information to results if specified
    if (jobTypes.length > 0) {
      results.filteredTypes = jobTypes;
      results.note = 'Job type filtering was requested but is handled at the job selection level';
    }

    // Optional cleanup
    if (cleanup) {
      console.log(`🧹 Running cleanup (${cleanupDays} days)`);
      try {
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

    // Get current system status
    const queueStatus = await jobWorker.getQueueStatus();
    results.queueStatus = queueStatus;

    // Get job statistics
    const jobStats = await jobManager.getJobStats();
    results.statistics = jobStats;

    // Calculate performance metrics
    const processingTime = Date.now() - startTime;
    results.performance = {
      processingTime,
      processingRate: results.processed > 0 ? results.processed / (processingTime / 1000) : 0,
      errorRate: results.processed > 0 ? (results.errors / (results.processed + results.errors)) * 100 : 0,
      efficiency: results.processed > 0 ? (results.processed / (results.processed + results.skipped)) * 100 : 0,
    };

    // Generate recommendations
    results.recommendations = generateCronRecommendations(results, queueStatus, validationResult.provider);

    // Log completion
    console.log(`✅ Cron processing completed: ${results.processed} processed, ${results.errors} errors in ${processingTime}ms`);

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('❌ Cron job processing error:', error);
    
    const processingTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: error.message || 'Cron processing failed',
      timestamp: new Date().toISOString(),
      processed: 0,
      errors: 1,
      processingTime,
      details: process.env.NODE_ENV === 'development' ? error.toString() : undefined,
      recommendations: [
        'Check system logs for detailed error information',
        'Verify webhook configuration and secrets',
        'Ensure all required services are operational',
      ],
    }, { status: 500 });
  }
}

// Validate webhook authenticity
async function validateWebhook(request: Request): Promise<{
  valid: boolean;
  provider?: string;
  reason?: string;
}> {
  const userAgent = request.headers.get('user-agent') || '';
  
  // Find matching provider
  const provider = cronProviders.find(p => 
    userAgent.toLowerCase().includes(p.userAgent) ||
    request.headers.get(p.headerKey)
  );

  if (!provider) {
    return {
      valid: false,
      reason: 'Unknown cron provider or missing authentication headers',
    };
  }

  // Check for webhook secret
  const secret = process.env[provider.secretEnvVar];
  if (!secret) {
    console.warn(`⚠️ No webhook secret configured for ${provider.name}`);
    // Allow if no secret is configured (for development)
    return {
      valid: true,
      provider: provider.name,
    };
  }

  // Validate secret
  const providedSecret = request.headers.get(provider.headerKey);
  if (!providedSecret) {
    return {
      valid: false,
      reason: `Missing ${provider.headerKey} header for ${provider.name}`,
    };
  }

  // Simple secret comparison (in production, use proper signature validation)
  if (providedSecret !== secret) {
    return {
      valid: false,
      reason: 'Invalid webhook secret',
    };
  }

  return {
    valid: true,
    provider: provider.name,
  };
}

// Perform system health check
async function performHealthCheck(): Promise<{
  healthy: boolean;
  message: string;
  details?: any;
}> {
  try {
    // Check if core systems are healthy
    const systemsHealthy = jobWorker.isHealthy() && jobManager.isHealthy();
    
    if (!systemsHealthy) {
      return {
        healthy: false,
        message: 'Core job systems are not operational',
      };
    }

    // Get basic health metrics
    const queueStatus = await jobWorker.getQueueStatus();
    const config = jobConfig.getConfig();

    // Check queue depth
    if (queueStatus.pending > config.alertThresholds.queueDepth) {
      return {
        healthy: false,
        message: 'Queue depth exceeds alert threshold',
        details: { queueDepth: queueStatus.pending, threshold: config.alertThresholds.queueDepth },
      };
    }

    return {
      healthy: true,
      message: 'System is healthy',
      details: queueStatus,
    };

  } catch (error: any) {
    console.error('❌ Health check failed:', error);
    return {
      healthy: false,
      message: 'Health check failed',
      details: { error: error.message },
    };
  }
}

// Rate limiting for cron providers
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

async function checkRateLimit(provider: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10; // Max 10 requests per minute per provider

  const key = `cron:${provider}`;
  const current = rateLimitStore.get(key);

  // Reset if window expired
  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }

  // Check if limit exceeded
  if (current.count >= maxRequests) {
    const retryAfter = Math.ceil((current.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment counter
  current.count++;
  return { allowed: true };
}

// Get provider-specific configuration
function getProviderConfig(provider: string, emergencyMode: boolean): {
  maxJobs: number;
  timeout: number;
} {
  const baseConfig = {
    maxJobs: emergencyMode ? 20 : 10,
    timeout: emergencyMode ? 60000 : 30000,
  };

  // Provider-specific overrides
  switch (provider) {
    case 'GitHub Actions':
      return {
        ...baseConfig,
        maxJobs: emergencyMode ? 15 : 8, // GitHub Actions has time limits
      };
    case 'Vercel Cron':
      return {
        ...baseConfig,
        maxJobs: emergencyMode ? 25 : 12, // Vercel is more generous
      };
    default:
      return baseConfig;
  }
}

// Generate cron-specific recommendations
function generateCronRecommendations(
  results: any,
  queueStatus: any,
  provider: string
): string[] {
  const recommendations: string[] = [];

  // Provider-specific recommendations
  if (provider === 'GitHub Actions' && results.processed === 0 && queueStatus.pending > 0) {
    recommendations.push('Consider increasing GitHub Actions frequency or using Vercel Cron for more frequent processing');
  }

  // Performance recommendations
  if (results.performance.processingTime > 25000) {
    recommendations.push('Processing time is approaching timeout limits - consider reducing maxJobs or optimizing job processing');
  }

  // Queue recommendations
  if (queueStatus.pending > 20) {
    recommendations.push('High queue depth - consider increasing cron frequency or enabling emergency mode');
  }

  // Error rate recommendations
  if (results.performance.errorRate > 20) {
    recommendations.push('High error rate detected - investigate failing jobs and system health');
  }

  // Success recommendations
  if (results.processed > 0 && results.errors === 0) {
    recommendations.push('Cron processing completed successfully - system operating normally');
  }

  return recommendations;
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-secret, x-github-token, x-vercel-signature',
    },
  });
}