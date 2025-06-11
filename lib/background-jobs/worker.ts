import { jobProcessor } from './job-processor';
import { jobManager } from './job-manager';

class BackgroundJobWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private processingInterval = 5000; // 5 seconds
  private maxRunTime = 300000; // 5 minutes max run time

  constructor() {
    console.log('🔧 Background job worker initialized');
  }

  // Start automatic job processing
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Worker already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting background job worker');

    this.intervalId = setInterval(async () => {
      try {
        await this.processJobs();
      } catch (error) {
        console.error('❌ Worker processing error:', error);
      }
    }, this.processingInterval);
  }

  // Stop automatic job processing
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Worker not running');
      return;
    }

    this.isRunning = false;
    console.log('🛑 Stopping background job worker');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Process jobs manually (for testing or manual triggers)
  async processJobs(maxJobs: number = 10): Promise<{
    processed: number;
    errors: number;
    skipped: number;
  }> {
    if (!jobManager.isHealthy()) {
      console.warn('⚠️ Job manager not healthy, skipping processing');
      return { processed: 0, errors: 0, skipped: 1 };
    }

    const stats = {
      processed: 0,
      errors: 0,
      skipped: 0,
    };

    console.log(`🔄 Processing up to ${maxJobs} jobs...`);

    try {
      // Get pending jobs
      const pendingJobs = await jobManager.getPendingJobs({}, maxJobs);
      
      if (pendingJobs.length === 0) {
        console.log('📭 No pending jobs to process');
        return stats;
      }

      console.log(`📋 Found ${pendingJobs.length} pending jobs`);

      // Process jobs with timeout protection
      const processingPromises = pendingJobs.map(async (job) => {
        try {
          // Set a timeout for each job processing
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Job processing timeout')), this.maxRunTime);
          });

          const processingPromise = jobProcessor.processNextJobStep();

          await Promise.race([processingPromise, timeoutPromise]);
          stats.processed++;
          
        } catch (error: any) {
          console.error(`❌ Job processing failed: ${job.id}`, error);
          stats.errors++;
          
          // Mark job as failed
          await jobManager.markJobFailed(
            job.id, 
            error.message || 'Job processing failed', 
            true // Allow retry
          );
        }
      });

      // Wait for all jobs to complete or timeout
      await Promise.allSettled(processingPromises);

      console.log(`✅ Processing complete: ${stats.processed} processed, ${stats.errors} errors`);

    } catch (error) {
      console.error('❌ Worker processing error:', error);
      stats.errors++;
    }

    return stats;
  }

  // Process a specific job by ID
  async processJobById(jobId: string): Promise<boolean> {
    try {
      const job = await jobManager.getJobStatus(jobId);
      
      if (!job) {
        console.error(`❌ Job not found: ${jobId}`);
        return false;
      }

      if (job.status !== 'pending') {
        console.warn(`⚠️ Job ${jobId} is not pending (status: ${job.status})`);
        return false;
      }

      console.log(`🔄 Processing specific job: ${jobId}`);

      // Process the job with timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job processing timeout')), this.maxRunTime);
      });

      const processingPromise = jobProcessor.processNextJobStep();

      await Promise.race([processingPromise, timeoutPromise]);

      console.log(`✅ Job processed successfully: ${jobId}`);
      return true;

    } catch (error: any) {
      console.error(`❌ Failed to process job ${jobId}:`, error);
      
      // Mark job as failed
      await jobManager.markJobFailed(
        jobId, 
        error.message || 'Job processing failed', 
        true // Allow retry
      );
      
      return false;
    }
  }

  // Get worker statistics
  getStats() {
    return {
      isRunning: this.isRunning,
      processingInterval: this.processingInterval,
      maxRunTime: this.maxRunTime,
      processorStats: jobProcessor.getProcessingStats(),
    };
  }

  // Health check
  isHealthy(): boolean {
    return jobManager.isHealthy() && jobProcessor.isHealthy();
  }

  // Clean up old jobs
  async cleanup(olderThanDays: number = 7): Promise<number> {
    try {
      console.log(`🧹 Cleaning up jobs older than ${olderThanDays} days...`);
      const cleaned = await jobManager.cleanupOldJobs(olderThanDays);
      console.log(`✅ Cleaned up ${cleaned} old jobs`);
      return cleaned;
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      return 0;
    }
  }

  // Get processing queue status
  async getQueueStatus() {
    try {
      const stats = await jobManager.getJobStats();
      const processorStats = jobProcessor.getProcessingStats();
      
      return {
        queue: stats,
        processor: processorStats,
        worker: {
          isRunning: this.isRunning,
          healthy: this.isHealthy(),
        },
      };
    } catch (error) {
      console.error('❌ Failed to get queue status:', error);
      return null;
    }
  }
}

// Export singleton instance
export const jobWorker = new BackgroundJobWorker();
export default jobWorker;