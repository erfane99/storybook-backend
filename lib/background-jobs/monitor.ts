import { createClient } from '@supabase/supabase-js';
import { JobData, JobType, JobStatus } from './types';

interface JobStatistics {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  successRate: number;
  queueDepth: number;
  oldestPendingJob?: Date;
}

interface JobTypeStats {
  [key: string]: {
    total: number;
    completed: number;
    failed: number;
    averageTime: number;
    successRate: number;
  };
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  queueDepth: number;
  processingCapacity: number;
  errorRate: number;
  averageWaitTime: number;
  recommendations: string[];
  alerts: string[];
}

interface PerformanceMetrics {
  jobsPerHour: number;
  jobsPerDay: number;
  peakProcessingTime: number;
  resourceUtilization: number;
  errorFrequency: number;
  retryRate: number;
}

interface CachedMetric {
  data: any;
  timestamp: number;
}

// Database table mapping for each job type
const JOB_TABLE_MAP: Record<JobType, string> = {
  'storybook': 'storybook_jobs',
  'auto-story': 'auto_story_jobs',
  'scenes': 'scene_generation_jobs',
  'cartoonize': 'cartoonize_jobs',
  'image-generation': 'image_generation_jobs'
};

class BackgroundJobMonitor {
  private supabase: ReturnType<typeof createClient> | null = null;
  private initialized = false;
  private metricsCache: Map<string, CachedMetric> = new Map();
  private cacheTimeout = 60000; // 1 minute cache

  constructor() {
    this.initializeSupabase();
  }

  private initializeSupabase(): void {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.warn('⚠️ Supabase environment variables not configured for monitoring');
        return;
      }

      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });

      this.initialized = true;
      console.log('✅ Background job monitor initialized');
    } catch (error: unknown) {
      console.error('❌ Failed to initialize background job monitor:', error);
    }
  }

  // Get comprehensive job statistics across all job tables
  async getJobStatistics(): Promise<JobStatistics> {
    const cacheKey = 'job-statistics';
    const cached = this.getCachedMetric(cacheKey);
    if (cached) return cached;

    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const stats: JobStatistics = {
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTime: 0,
        successRate: 0,
        queueDepth: 0,
        oldestPendingJob: undefined,
      };

      let totalProcessingTime = 0;
      let completedJobsWithTime = 0;
      let oldestPending: Date | undefined;

      // Query each job table separately
      const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
      
      for (const jobType of jobTypes) {
        const tableName = JOB_TABLE_MAP[jobType];
        
        try {
          const { data: jobs, error } = await this.supabase
            .from(tableName)
            .select('status, created_at, started_at, completed_at')
            .order('created_at', { ascending: false });

          if (error) {
            console.warn(`⚠️ Failed to query ${tableName}:`, error);
            continue;
          }

          if (!jobs || !Array.isArray(jobs)) continue;

          jobs.forEach((job: any) => {
            stats.totalJobs++;

            switch (job.status) {
              case 'pending':
                stats.pendingJobs++;
                const pendingDate = new Date(job.created_at);
                if (!oldestPending || pendingDate < oldestPending) {
                  oldestPending = pendingDate;
                }
                break;
              case 'processing':
                stats.processingJobs++;
                break;
              case 'completed':
                stats.completedJobs++;
                if (job.started_at && job.completed_at) {
                  const processingTime = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
                  totalProcessingTime += processingTime;
                  completedJobsWithTime++;
                }
                break;
              case 'failed':
              case 'cancelled':
                stats.failedJobs++;
                break;
            }
          });
        } catch (tableError) {
          console.warn(`⚠️ Error querying table ${tableName}:`, tableError);
        }
      }

      stats.queueDepth = stats.pendingJobs + stats.processingJobs;
      stats.oldestPendingJob = oldestPending;
      stats.averageProcessingTime = completedJobsWithTime > 0 
        ? totalProcessingTime / completedJobsWithTime 
        : 0;
      stats.successRate = stats.totalJobs > 0 
        ? (stats.completedJobs / (stats.completedJobs + stats.failedJobs)) * 100 
        : 0;

      this.setCachedMetric(cacheKey, stats);
      return stats;
    } catch (error: unknown) {
      console.error('❌ Failed to get job statistics:', error);
      throw error;
    }
  }

  // Get statistics by job type using individual tables
  async getJobTypeStatistics(): Promise<JobTypeStats> {
    const cacheKey = 'job-type-statistics';
    const cached = this.getCachedMetric(cacheKey);
    if (cached) return cached;

    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const typeStats: JobTypeStats = {};
      const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
      
      for (const jobType of jobTypes) {
        const tableName = JOB_TABLE_MAP[jobType];
        
        try {
          const { data: jobs, error } = await this.supabase
            .from(tableName)
            .select('status, started_at, completed_at');

          if (error) {
            console.warn(`⚠️ Failed to query ${tableName}:`, error);
            continue;
          }

          if (!jobs || !Array.isArray(jobs)) continue;

          typeStats[jobType] = {
            total: 0,
            completed: 0,
            failed: 0,
            averageTime: 0,
            successRate: 0,
          };

          const stats = typeStats[jobType];
          let totalTime = 0;
          let completedWithTime = 0;

          jobs.forEach((job: any) => {
            stats.total++;

            if (job.status === 'completed') {
              stats.completed++;
              if (job.started_at && job.completed_at) {
                const processingTime = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
                totalTime += processingTime;
                completedWithTime++;
              }
            } else if (job.status === 'failed' || job.status === 'cancelled') {
              stats.failed++;
            }
          });

          // Calculate averages
          const totalFinished = stats.completed + stats.failed;
          stats.successRate = totalFinished > 0 ? (stats.completed / totalFinished) * 100 : 0;
          stats.averageTime = completedWithTime > 0 ? totalTime / completedWithTime : 0;

        } catch (tableError) {
          console.warn(`⚠️ Error processing table ${tableName}:`, tableError);
        }
      }

      this.setCachedMetric(cacheKey, typeStats);
      return typeStats;
    } catch (error: unknown) {
      console.error('❌ Failed to get job type statistics:', error);
      throw error;
    }
  }

  // Assess overall system health
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const stats = await this.getJobStatistics();
      const typeStats = await this.getJobTypeStatistics();
      
      const health: SystemHealth = {
        status: 'healthy',
        queueDepth: stats.queueDepth,
        processingCapacity: this.getProcessingCapacity(),
        errorRate: 100 - stats.successRate,
        averageWaitTime: this.calculateAverageWaitTime(stats),
        recommendations: [],
        alerts: [],
      };

      // Determine health status and generate recommendations
      if (stats.queueDepth > 50) {
        health.status = 'critical';
        health.alerts.push('Queue depth is critically high');
        health.recommendations.push('Increase processing capacity or investigate stuck jobs');
      } else if (stats.queueDepth > 20) {
        health.status = 'warning';
        health.alerts.push('Queue depth is elevated');
        health.recommendations.push('Monitor queue closely and consider scaling');
      }

      if (stats.successRate < 80) {
        health.status = 'critical';
        health.alerts.push('Job success rate is below acceptable threshold');
        health.recommendations.push('Investigate failing jobs and improve error handling');
      } else if (stats.successRate < 90) {
        health.status = 'warning';
        health.alerts.push('Job success rate could be improved');
        health.recommendations.push('Review failed jobs for common patterns');
      }

      if (stats.oldestPendingJob) {
        const waitTime = Date.now() - stats.oldestPendingJob.getTime();
        if (waitTime > 30 * 60 * 1000) { // 30 minutes
          health.status = 'critical';
          health.alerts.push('Jobs are waiting too long in queue');
          health.recommendations.push('Check processing system and clear any stuck jobs');
        }
      }

      // Add performance recommendations
      if (stats.averageProcessingTime > 10 * 60 * 1000) { // 10 minutes
        health.recommendations.push('Consider optimizing job processing performance');
      }

      return health;
    } catch (error: unknown) {
      console.error('❌ Failed to assess system health:', error);
      return {
        status: 'critical',
        queueDepth: 0,
        processingCapacity: 0,
        errorRate: 100,
        averageWaitTime: 0,
        recommendations: ['System health check failed - investigate monitoring system'],
        alerts: ['Unable to assess system health'],
      };
    }
  }

  // Get performance metrics across all job tables
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const cacheKey = 'performance-metrics';
    const cached = this.getCachedMetric(cacheKey);
    if (cached) return cached;

    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      let allRecentJobs: any[] = [];
      const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
      
      for (const jobType of jobTypes) {
        const tableName = JOB_TABLE_MAP[jobType];
        
        try {
          const { data: jobs, error } = await this.supabase
            .from(tableName)
            .select('status, created_at, started_at, completed_at, retry_count')
            .gte('created_at', oneDayAgo.toISOString());

          if (error) {
            console.warn(`⚠️ Failed to query ${tableName} for metrics:`, error);
            continue;
          }

          if (jobs && Array.isArray(jobs)) {
            // Add job type to each record for analysis
            const jobsWithType = jobs.map(job => ({ ...job, type: jobType }));
            allRecentJobs = allRecentJobs.concat(jobsWithType);
          }
        } catch (tableError) {
          console.warn(`⚠️ Error getting metrics from table ${tableName}:`, tableError);
        }
      }

      const hourlyJobs = allRecentJobs.filter(job => new Date(job.created_at) >= oneHourAgo);
      const completedJobs = allRecentJobs.filter(job => job.status === 'completed');
      const failedJobs = allRecentJobs.filter(job => job.status === 'failed');
      const retriedJobs = allRecentJobs.filter(job => (job.retry_count || 0) > 0);

      const processingTimes = completedJobs
        .filter(job => job.started_at && job.completed_at)
        .map(job => new Date(job.completed_at).getTime() - new Date(job.started_at).getTime());

      const metrics: PerformanceMetrics = {
        jobsPerHour: hourlyJobs.length,
        jobsPerDay: allRecentJobs.length,
        peakProcessingTime: processingTimes.length > 0 ? Math.max(...processingTimes) : 0,
        resourceUtilization: this.calculateResourceUtilization(),
        errorFrequency: allRecentJobs.length > 0 ? (failedJobs.length / allRecentJobs.length) * 100 : 0,
        retryRate: allRecentJobs.length > 0 ? (retriedJobs.length / allRecentJobs.length) * 100 : 0,
      };

      this.setCachedMetric(cacheKey, metrics);
      return metrics;
    } catch (error: unknown) {
      console.error('❌ Failed to get performance metrics:', error);
      throw error;
    }
  }

  // Detect stuck jobs across all job tables
  async getStuckJobs(): Promise<JobData[]> {
    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const stuckJobs: JobData[] = [];
      const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
      
      for (const jobType of jobTypes) {
        const tableName = JOB_TABLE_MAP[jobType];
        
        try {
          const { data: jobs, error } = await this.supabase
            .from(tableName)
            .select('*')
            .eq('status', 'processing')
            .lt('updated_at', stuckThreshold.toISOString());

          if (error) {
            console.warn(`⚠️ Failed to check stuck jobs in ${tableName}:`, error);
            continue;
          }

          if (jobs && Array.isArray(jobs)) {
            // Convert to unified JobData format
            const convertedJobs = jobs.map(job => this.convertToJobData(jobType, job));
            stuckJobs.push(...convertedJobs);
          }
        } catch (tableError) {
          console.warn(`⚠️ Error checking stuck jobs in table ${tableName}:`, tableError);
        }
      }

      console.log(`🔍 Found ${stuckJobs.length} potentially stuck jobs`);
      return stuckJobs;
    } catch (error: unknown) {
      console.error('❌ Failed to detect stuck jobs:', error);
      throw error;
    }
  }

  // Clean up old completed jobs from all tables
  async cleanupOldJobs(retentionDays: number = 7): Promise<number> {
    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      let totalDeleted = 0;
      const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
      
      for (const jobType of jobTypes) {
        const tableName = JOB_TABLE_MAP[jobType];
        
        try {
          const { data: deletedJobs, error } = await this.supabase
            .from(tableName)
            .delete()
            .in('status', ['completed', 'failed', 'cancelled'])
            .lt('completed_at', cutoffDate.toISOString())
            .select('id');

          if (error) {
            console.warn(`⚠️ Failed to cleanup ${tableName}:`, error);
            continue;
          }

          const deletedCount = deletedJobs?.length || 0;
          totalDeleted += deletedCount;
          
          if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old jobs from ${tableName}`);
          }
        } catch (tableError) {
          console.warn(`⚠️ Error cleaning up table ${tableName}:`, tableError);
        }
      }

      console.log(`🧹 Total cleaned up: ${totalDeleted} old jobs`);
      return totalDeleted;
    } catch (error: unknown) {
      console.error('❌ Failed to cleanup old jobs:', error);
      throw error;
    }
  }

  // Convert table-specific job data to unified JobData format
  private convertToJobData(jobType: JobType, tableData: any): JobData {
    const baseJob: any = {
      id: tableData.id?.toString() || 'unknown',
      type: jobType,
      status: tableData.status || 'pending',
      progress: tableData.progress || 0,
      current_step: tableData.current_step,
      user_id: tableData.user_id?.toString(),
      created_at: tableData.created_at,
      updated_at: tableData.updated_at,
      started_at: tableData.started_at,
      completed_at: tableData.completed_at,
      error_message: tableData.error_message,
      retry_count: tableData.retry_count || 0,
      max_retries: tableData.max_retries || 3,
      input_data: {},
      result_data: {}
    };

    // Map job-type specific fields
    if (jobType === 'cartoonize') {
      baseJob.input_data = {
        prompt: tableData.original_image_data || '',
        style: tableData.style || 'cartoon',
        imageUrl: tableData.original_cloudinary_url
      };
      if (tableData.generated_image_url) {
        baseJob.result_data = {
          url: tableData.generated_image_url,
          cached: !!tableData.final_cloudinary_url
        };
      }
    }
    // Add other job type mappings as needed...

    return baseJob as JobData;
  }

  // Generate comprehensive health report
  async generateHealthReport(): Promise<{
    timestamp: string;
    systemHealth: SystemHealth;
    jobStatistics: JobStatistics;
    typeStatistics: JobTypeStats;
    performanceMetrics: PerformanceMetrics;
    stuckJobs: JobData[];
  }> {
    try {
      const [systemHealth, jobStatistics, typeStatistics, performanceMetrics, stuckJobs] = await Promise.all([
        this.getSystemHealth(),
        this.getJobStatistics(),
        this.getJobTypeStatistics(),
        this.getPerformanceMetrics(),
        this.getStuckJobs(),
      ]);

      return {
        timestamp: new Date().toISOString(),
        systemHealth,
        jobStatistics,
        typeStatistics,
        performanceMetrics,
        stuckJobs,
      };
    } catch (error: unknown) {
      console.error('❌ Failed to generate health report:', error);
      throw error;
    }
  }

  // Private helper methods
  private getCachedMetric(key: string): any {
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedMetric(key: string, data: any): void {
    this.metricsCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  private getProcessingCapacity(): number {
    const maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS || '3');
    return maxConcurrentJobs;
  }

  private calculateAverageWaitTime(stats: JobStatistics): number {
    if (!stats.oldestPendingJob) return 0;
    return Date.now() - stats.oldestPendingJob.getTime();
  }

  private calculateResourceUtilization(): number {
    const cachedStats = this.metricsCache.get('job-statistics');
    const queueDepth = cachedStats?.data?.queueDepth || 0;
    return Math.min(100, queueDepth * 10);
  }

  // Health check
  isHealthy(): boolean {
    return this.initialized && this.supabase !== null;
  }
}

// Export singleton instance
export const jobMonitor = new BackgroundJobMonitor();
export default jobMonitor;