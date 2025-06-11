import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  JobData, 
  JobType, 
  JobStatus, 
  JobFilter, 
  JobUpdateData,
  StorybookJobData,
  AutoStoryJobData,
  SceneJobData,
  CartoonizeJobData,
  ImageJobData
} from './types';

class BackgroundJobManager {
  private supabase: SupabaseClient | null = null;
  private initialized = false;

  constructor() {
    this.initializeSupabase();
  }

  private initializeSupabase(): void {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.warn('⚠️ Supabase environment variables not configured for job management');
        return;
      }

      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false
        }
      });

      this.initialized = true;
      console.log('✅ Background job manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize background job manager:', error);
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private async executeQuery<T>(
    operation: string,
    queryFn: (supabase: SupabaseClient) => Promise<{ data: T | null; error: any }>
  ): Promise<T | null> {
    if (!this.initialized || !this.supabase) {
      console.error(`❌ Cannot execute ${operation} - job manager not initialized`);
      return null;
    }

    try {
      const { data, error } = await queryFn(this.supabase);
      
      if (error) {
        console.error(`❌ ${operation} failed:`, error);
        return null;
      }

      return data;
    } catch (error) {
      console.error(`❌ ${operation} error:`, error);
      return null;
    }
  }

  // Create storybook generation job
  async createStorybookJob(
    inputData: StorybookJobData['input_data'],
    userId?: string
  ): Promise<string | null> {
    const jobId = this.generateJobId();
    const now = new Date().toISOString();

    const jobData: StorybookJobData = {
      id: jobId,
      type: 'storybook',
      status: 'pending',
      progress: 0,
      current_step: 'Initializing storybook generation',
      user_id: userId,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      max_retries: 3,
      input_data: inputData
    };

    const result = await this.executeQuery(
      'Create storybook job',
      async (supabase) => {
        const response = await supabase.from('background_jobs').insert(jobData).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`✅ Created storybook job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create auto-story generation job
  async createAutoStoryJob(
    inputData: AutoStoryJobData['input_data'],
    userId?: string
  ): Promise<string | null> {
    const jobId = this.generateJobId();
    const now = new Date().toISOString();

    const jobData: AutoStoryJobData = {
      id: jobId,
      type: 'auto-story',
      status: 'pending',
      progress: 0,
      current_step: 'Initializing auto-story generation',
      user_id: userId,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      max_retries: 3,
      input_data: inputData
    };

    const result = await this.executeQuery(
      'Create auto-story job',
      async (supabase) => {
        const response = await supabase.from('background_jobs').insert(jobData).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`✅ Created auto-story job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create scene generation job
  async createSceneJob(
    inputData: SceneJobData['input_data'],
    userId?: string
  ): Promise<string | null> {
    const jobId = this.generateJobId();
    const now = new Date().toISOString();

    const jobData: SceneJobData = {
      id: jobId,
      type: 'scenes',
      status: 'pending',
      progress: 0,
      current_step: 'Initializing scene generation',
      user_id: userId,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      max_retries: 3,
      input_data: inputData
    };

    const result = await this.executeQuery(
      'Create scene job',
      async (supabase) => {
        const response = await supabase.from('background_jobs').insert(jobData).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`✅ Created scene job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create image cartoonization job
  async createCartoonizeJob(
    inputData: CartoonizeJobData['input_data'],
    userId?: string
  ): Promise<string | null> {
    const jobId = this.generateJobId();
    const now = new Date().toISOString();

    const jobData: CartoonizeJobData = {
      id: jobId,
      type: 'cartoonize',
      status: 'pending',
      progress: 0,
      current_step: 'Initializing image cartoonization',
      user_id: userId,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      max_retries: 3,
      input_data: inputData
    };

    const result = await this.executeQuery(
      'Create cartoonize job',
      async (supabase) => {
        const response = await supabase.from('background_jobs').insert(jobData).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`✅ Created cartoonize job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create single image generation job
  async createImageJob(
    inputData: ImageJobData['input_data'],
    userId?: string
  ): Promise<string | null> {
    const jobId = this.generateJobId();
    const now = new Date().toISOString();

    const jobData: ImageJobData = {
      id: jobId,
      type: 'image-generation',
      status: 'pending',
      progress: 0,
      current_step: 'Initializing image generation',
      user_id: userId,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      max_retries: 3,
      input_data: inputData
    };

    const result = await this.executeQuery(
      'Create image job',
      async (supabase) => {
        const response = await supabase.from('background_jobs').insert(jobData).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`✅ Created image job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Get job status and details
  async getJobStatus(jobId: string): Promise<JobData | null> {
    const result = await this.executeQuery(
      'Get job status',
      async (supabase) => {
        const response = await supabase.from('background_jobs').select('*').eq('id', jobId).single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`📊 Retrieved job status for: ${jobId}`);
    }

    return result as JobData | null;
  }

  // Update job progress atomically
  async updateJobProgress(
    jobId: string,
    progress: number,
    currentStep?: string
  ): Promise<boolean> {
    const updateData: JobUpdateData = {
      progress: Math.max(0, Math.min(100, progress)), // Clamp between 0-100
      updated_at: new Date().toISOString()
    };

    if (currentStep) {
      updateData.current_step = currentStep;
    }

    // If progress is > 0 and job hasn't started, mark as processing
    if (progress > 0) {
      updateData.status = 'processing';
      if (!updateData.started_at) {
        updateData.started_at = new Date().toISOString();
      }
    }

    const result = await this.executeQuery(
      'Update job progress',
      async (supabase) => {
        const response = await supabase.from('background_jobs').update(updateData).eq('id', jobId).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`📈 Updated job progress: ${jobId} -> ${progress}%`);
      return true;
    }

    return false;
  }

  // Mark job as completed with results
  async markJobCompleted(
    jobId: string,
    resultData: any
  ): Promise<boolean> {
    const now = new Date().toISOString();
    
    const updateData: JobUpdateData = {
      status: 'completed',
      progress: 100,
      current_step: 'Completed successfully',
      result_data: resultData,
      completed_at: now,
      updated_at: now
    };

    const result = await this.executeQuery(
      'Mark job completed',
      async (supabase) => {
        const response = await supabase.from('background_jobs').update(updateData).eq('id', jobId).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`✅ Marked job completed: ${jobId}`);
      return true;
    }

    return false;
  }

  // Mark job as failed with error details
  async markJobFailed(
    jobId: string,
    errorMessage: string,
    shouldRetry: boolean = false
  ): Promise<boolean> {
    const now = new Date().toISOString();

    // First, get current job to check retry count
    const currentJob = await this.getJobStatus(jobId);
    if (!currentJob) {
      console.error(`❌ Cannot mark job failed - job not found: ${jobId}`);
      return false;
    }

    const newRetryCount = currentJob.retry_count + 1;
    const canRetry = shouldRetry && newRetryCount <= currentJob.max_retries;

    const updateData: JobUpdateData = {
      status: canRetry ? 'pending' : 'failed',
      error_message: errorMessage,
      updated_at: now,
      retry_count: newRetryCount
    };

    if (!canRetry) {
      updateData.completed_at = now;
      updateData.current_step = 'Failed after retries';
    } else {
      updateData.current_step = `Retrying (${newRetryCount}/${currentJob.max_retries})`;
      updateData.progress = 0; // Reset progress for retry
    }

    const result = await this.executeQuery(
      'Mark job failed',
      async (supabase) => {
        const response = await supabase.from('background_jobs').update(updateData).eq('id', jobId).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      const action = canRetry ? 'scheduled for retry' : 'marked as failed';
      console.log(`❌ Job ${action}: ${jobId} - ${errorMessage}`);
      return true;
    }

    return false;
  }

  // Get pending jobs that need processing
  async getPendingJobs(
    filter: JobFilter = {},
    limit: number = 50
  ): Promise<JobData[]> {
    const result = await this.executeQuery(
      'Get pending jobs',
      async (supabase) => {
        let query = supabase
          .from('background_jobs')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(limit);

        if (filter.user_id) {
          query = query.eq('user_id', filter.user_id);
        }

        if (filter.type) {
          query = query.eq('type', filter.type);
        }

        const response = await query;
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`📋 Retrieved ${Array.isArray(result) ? result.length : 0} pending jobs`);
      return Array.isArray(result) ? result as JobData[] : [];
    }

    return [];
  }

  // Get jobs by filter criteria
  async getJobs(filter: JobFilter = {}): Promise<JobData[]> {
    const result = await this.executeQuery(
      'Get jobs by filter',
      async (supabase) => {
        let query = supabase
          .from('background_jobs')
          .select('*')
          .order('created_at', { ascending: false });

        if (filter.user_id) {
          query = query.eq('user_id', filter.user_id);
        }

        if (filter.type) {
          query = query.eq('type', filter.type);
        }

        if (filter.status) {
          query = query.eq('status', filter.status);
        }

        if (filter.limit) {
          query = query.limit(filter.limit);
        }

        if (filter.offset) {
          query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
        }

        const response = await query;
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`📋 Retrieved ${Array.isArray(result) ? result.length : 0} jobs`);
      return Array.isArray(result) ? result as JobData[] : [];
    }

    return [];
  }

  // Cancel a job
  async cancelJob(jobId: string): Promise<boolean> {
    const updateData: JobUpdateData = {
      status: 'cancelled',
      current_step: 'Cancelled by user',
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };

    const result = await this.executeQuery(
      'Cancel job',
      async (supabase) => {
        const response = await supabase.from('background_jobs').update(updateData).eq('id', jobId).select('id').single();
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`🚫 Cancelled job: ${jobId}`);
      return true;
    }

    return false;
  }

  // Clean up old completed/failed jobs
  async cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.executeQuery(
      'Cleanup old jobs',
      async (supabase) => {
        const response = await supabase
          .from('background_jobs')
          .delete()
          .in('status', ['completed', 'failed', 'cancelled'])
          .lt('completed_at', cutoffDate.toISOString());
        return { data: response.data, error: response.error };
      }
    );

    if (result) {
      console.log(`🧹 Cleaned up old jobs`);
      return Array.isArray(result) ? result.length : 0;
    }

    return 0;
  }

  // Get job statistics
  async getJobStats(userId?: string): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const jobs = await this.getJobs({ user_id: userId });
    
    const stats = {
      total: jobs.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    jobs.forEach(job => {
      stats[job.status]++;
    });

    return stats;
  }

  // Health check
  isHealthy(): boolean {
    return this.initialized && this.supabase !== null;
  }
}

// Export singleton instance
export const jobManager = new BackgroundJobManager();
export default jobManager;