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

// Define proper database row types to avoid unknown issues
interface DatabaseJobRow {
  status: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  type: string;
  retry_count: number;
  updated_at: string;
  [key: string]: any;
}

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

  // Get comprehensive job statistics
  async getJobStatistics(): Promise<JobStatistics> {
    const cacheKey = 'job-statistics';
    const cached = this.getCachedMetric(cacheKey);
    if (cached) return cached;

    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const { data: jobs, error } = await this.supabase
        .from('background_jobs')
        .select('status, created_at, started_at, completed_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const stats: JobStatistics = {
        totalJobs: jobs?.length || 0,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTime: 0,
        successRate: 0,
        queueDepth: 0,
        oldestPendingJob: undefined,
      };

      if (!jobs || !Array.isArray(jobs)) return stats;

      let totalProcessingTime = 0;
      let completedJobsWithTime = 0;
      let oldestPending: Date | undefined;

      jobs.forEach((job: DatabaseJobRow) => {
        switch (job.status) {
          case 'pending':
            stats.pendingJobs++;
            // ✅ Fixed: Properly type the created_at property
            const pendingDate = new Date(job.created_at as string);
            if (!oldestPending || pendingDate < oldestPending) {
              oldestPending = pendingDate;
            }
            break;
          case 'processing':
            stats.processingJobs++;
            break;
          case 'completed':
            stats.completedJobs++;
            // ✅ Fixed: Add proper null checks for started_at and completed_at
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

  // Get statistics by job type
  async getJobTypeStatistics(): Promise<JobTypeStats> {
    const cacheKey = 'job-type-statistics';
    const cached = this.getCachedMetric(cacheKey);
    if (cached) return cached;

    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const { data: jobs, error } = await this.supabase
        .from('background_jobs')
        .select('type, status, started_at, completed_at');

      if (error) throw error;

      const typeStats: JobTypeStats = {};

      if (!jobs || !Array.isArray(jobs)) {
        this.setCachedMetric(cacheKey, typeStats);
        return typeStats;
      }

      jobs.forEach((job: DatabaseJobRow) => {
        const jobType = job.type as string;
        if (!typeStats[jobType]) {
          typeStats[jobType] = {
            total: 0,
            completed: 0,
            failed: 0,
            averageTime: 0,
            successRate: 0,
          };
        }

        const stats = typeStats[jobType];
        stats.total++;

        if (job.status === 'completed') {
          stats.completed++;
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          stats.failed++;
        }
      });

      // Calculate success rates and average times
      Object.keys(typeStats).forEach(type => {
        const stats = typeStats[type];
        const totalFinished = stats.completed + stats.failed;
        stats.successRate = totalFinished > 0 ? (stats.completed / totalFinished) * 100 : 0;

        // Calculate average processing time for completed jobs
        const completedJobs = jobs.filter((j: DatabaseJobRow) => 
          j.type === type && j.status === 'completed' && j.started_at && j.completed_at
        );
        if (completedJobs.length > 0) {
          const totalTime = completedJobs.reduce((sum, job: DatabaseJobRow) => {
            return sum + (new Date(job.completed_at!).getTime() - new Date(job.started_at!).getTime());
          }, 0);
          stats.averageTime = totalTime / completedJobs.length;
        }
      });

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

  // Get performance metrics
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

      const { data: recentJobs, error } = await this.supabase
        .from('background_jobs')
        .select('status, created_at, started_at, completed_at, retry_count')
        .gte('created_at', oneDayAgo.toISOString());

      if (error) throw error;

      if (!recentJobs || !Array.isArray(recentJobs)) {
        const emptyMetrics: PerformanceMetrics = {
          jobsPerHour: 0,
          jobsPerDay: 0,
          peakProcessingTime: 0,
          resourceUtilization: 0,
          errorFrequency: 0,
          retryRate: 0,
        };
        this.setCachedMetric(cacheKey, emptyMetrics);
        return emptyMetrics;
      }

      const hourlyJobs = recentJobs.filter((job: DatabaseJobRow) => new Date(job.created_at) >= oneHourAgo);
      const completedJobs = recentJobs.filter((job: DatabaseJobRow) => job.status === 'completed');
      const failedJobs = recentJobs.filter((job: DatabaseJobRow) => job.status === 'failed');
      const retriedJobs = recentJobs.filter((job: DatabaseJobRow) => job.retry_count > 0);

      const processingTimes = completedJobs
        .filter((job: DatabaseJobRow) => job.started_at && job.completed_at)
        .map((job: DatabaseJobRow) => new Date(job.completed_at!).getTime() - new Date(job.started_at!).getTime());

      const metrics: PerformanceMetrics = {
        jobsPerHour: hourlyJobs.length,
        jobsPerDay: recentJobs.length,
        peakProcessingTime: processingTimes.length > 0 ? Math.max(...processingTimes) : 0,
        resourceUtilization: this.calculateResourceUtilization(),
        errorFrequency: recentJobs.length > 0 ? (failedJobs.length / recentJobs.length) * 100 : 0,
        retryRate: recentJobs.length > 0 ? (retriedJobs.length / recentJobs.length) * 100 : 0,
      };

      this.setCachedMetric(cacheKey, metrics);
      return metrics;
    } catch (error: unknown) {
      console.error('❌ Failed to get performance metrics:', error);
      throw error;
    }
  }

  // Detect stuck jobs that need intervention
  async getStuckJobs(): Promise<JobData[]> {
    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const { data: stuckJobs, error } = await this.supabase
        .from('background_jobs')
        .select('*')
        .eq('status', 'processing')
        .lt('updated_at', stuckThreshold.toISOString());

      if (error) throw error;

      console.log(`🔍 Found ${stuckJobs?.length || 0} potentially stuck jobs`);
      return (stuckJobs as JobData[]) || [];
    } catch (error: unknown) {
      console.error('❌ Failed to detect stuck jobs:', error);
      throw error;
    }
  }

  // Clean up old completed jobs
  async cleanupOldJobs(retentionDays: number = 7): Promise<number> {
    if (!this.initialized || !this.supabase) {
      throw new Error('Monitor not initialized');
    }

    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const { data: deletedJobs, error } = await this.supabase
        .from('background_jobs')
        .delete()
        .in('status', ['completed', 'failed', 'cancelled'])
        .lt('completed_at', cutoffDate.toISOString())
        .select('id');

      if (error) throw error;

      const deletedCount = deletedJobs?.length || 0;
      console.log(`🧹 Cleaned up ${deletedCount} old jobs`);
      return deletedCount;
    } catch (error: unknown) {
      console.error('❌ Failed to cleanup old jobs:', error);
      throw error;
    }
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
    // This would be based on system configuration
    const maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS || '3');
    return maxConcurrentJobs;
  }

  private calculateAverageWaitTime(stats: JobStatistics): number {
    if (!stats.oldestPendingJob) return 0;
    return Date.now() - stats.oldestPendingJob.getTime();
  }

  private calculateResourceUtilization(): number {
    // This would integrate with actual system metrics
    // For now, return a placeholder based on queue depth
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