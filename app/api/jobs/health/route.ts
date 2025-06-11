import { NextResponse } from 'next/server';
import { jobMonitor } from '@/lib/background-jobs/monitor';
import { jobConfig } from '@/lib/background-jobs/config';
import { jobManager } from '@/lib/background-jobs/job-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('🏥 Health check requested');

    // Check if core systems are initialized
    const systemStatus = {
      monitor: jobMonitor.isHealthy(),
      manager: jobManager.isHealthy(),
      config: true,
      timestamp: new Date().toISOString(),
    };

    // If core systems are down, return basic status
    if (!systemStatus.monitor || !systemStatus.manager) {
      return NextResponse.json({
        status: 'critical',
        message: 'Core job systems are not operational',
        systemStatus,
        recommendations: [
          'Check database connectivity',
          'Verify environment variables',
          'Restart job processing services',
        ],
      }, { status: 503 });
    }

    // Get comprehensive health information
    const [healthReport, configSummary] = await Promise.all([
      jobMonitor.generateHealthReport().catch((error: unknown) => {
        console.error('❌ Failed to generate health report:', error);
        return null;
      }),
      Promise.resolve(jobConfig.getConfigSummary()),
    ]);

    if (!healthReport) {
      return NextResponse.json({
        status: 'warning',
        message: 'Health monitoring is experiencing issues',
        systemStatus,
        configSummary,
        recommendations: [
          'Check monitoring system connectivity',
          'Verify database access permissions',
        ],
      }, { status: 200 });
    }

    // Determine overall system status
    let overallStatus = healthReport.systemHealth.status;
    let httpStatus = 200;

    if (overallStatus === 'critical') {
      httpStatus = 503;
    } else if (overallStatus === 'warning') {
      httpStatus = 200;
    }

    // Prepare response
    const response = {
      status: overallStatus,
      message: getStatusMessage(overallStatus),
      timestamp: healthReport.timestamp,
      systemStatus,
      configSummary,
      
      // Core metrics
      metrics: {
        queueDepth: healthReport.jobStatistics.queueDepth,
        processingCapacity: healthReport.systemHealth.processingCapacity,
        successRate: healthReport.jobStatistics.successRate,
        averageProcessingTime: healthReport.jobStatistics.averageProcessingTime,
        jobsPerHour: healthReport.performanceMetrics.jobsPerHour,
        errorRate: healthReport.systemHealth.errorRate,
      },

      // Detailed statistics
      statistics: {
        jobs: healthReport.jobStatistics,
        byType: healthReport.typeStatistics,
        performance: healthReport.performanceMetrics,
      },

      // System health details
      health: {
        status: healthReport.systemHealth.status,
        alerts: healthReport.systemHealth.alerts,
        recommendations: healthReport.systemHealth.recommendations,
        stuckJobsCount: healthReport.stuckJobs.length,
      },

      // Operational information
      operational: {
        autoProcessingEnabled: jobConfig.isFeatureEnabled('enableAutoProcessing'),
        metricsCollectionEnabled: jobConfig.isFeatureEnabled('enableMetricsCollection'),
        processingInterval: jobConfig.getProcessingInterval(),
        maxConcurrentJobs: jobConfig.getMaxConcurrentJobs(),
      },
    };

    console.log(`✅ Health check completed - Status: ${overallStatus}`);
    return NextResponse.json(response, { status: httpStatus });

  } catch (error: unknown) {
    console.error('❌ Health check failed:', error);
    
    return NextResponse.json({
      status: 'critical',
      message: 'Health check system failure',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      recommendations: [
        'Check system logs for detailed error information',
        'Verify all required services are running',
        'Contact system administrator if problem persists',
      ],
    }, { status: 500 });
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
    },
  });
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'healthy':
      return 'All systems operational';
    case 'warning':
      return 'System operational with minor issues';
    case 'critical':
      return 'System experiencing critical issues';
    default:
      return 'System status unknown';
  }
}