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

// Database table mapping for each job type
const JOB_TABLE_MAP: Record<JobType, string> = {
  'storybook': 'storybook_jobs',
  'auto-story': 'auto_story_jobs',
  'scenes': 'scene_generation_jobs',
  'cartoonize': 'cartoonize_jobs',
  'image-generation': 'image_generation_jobs'
};

// Field mapping from unified interface to table-specific fields
const FIELD_MAPPINGS: Record<JobType, Record<string, string>> = {
  'cartoonize': {
    'input_data.prompt': 'original_image_data',
    'input_data.style': 'style',
    'input_data.imageUrl': 'original_cloudinary_url',
    'result_data.url': 'generated_image_url',
    'result_data.cached': 'final_cloudinary_url'
  },
  'auto-story': {
    'input_data.genre': 'genre',
    'input_data.characterDescription': 'character_description',
    'input_data.cartoonImageUrl': 'cartoon_image_url',
    'input_data.audience': 'audience',
    'result_data.storybook_id': 'storybook_entry_id',
    'result_data.generated_story': 'generated_story'
  },
  'image-generation': {
    'input_data.image_prompt': 'image_prompt',
    'input_data.character_description': 'character_description',
    'input_data.emotion': 'emotion',
    'input_data.audience': 'audience',
    'input_data.isReusedImage': 'is_reused_image',
    'input_data.cartoon_image': 'cartoon_image',
    'input_data.style': 'style',
    'result_data.url': 'generated_image_url',
    'result_data.prompt_used': 'final_prompt_used'
  },
  'storybook': {
    // Will be mapped based on storybook_jobs table structure
  },
  'scenes': {
    // Will be mapped based on scene_generation_jobs table structure
  }
};

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
      } else if (jobType === 'storybook') {
      baseJob.input_data = {
        title: tableData.title,
        story: tableData.story,
        characterImage: tableData.character_image,
        pages: tableData.pages,
        audience: tableData.audience,
        isReusedImage: tableData.is_reused_image
      };
      if (tableData.storybook_entry_id) {
        baseJob.result_data = {
          storybook_id: tableData.storybook_entry_id,
          pages: tableData.pages,
          has_errors: false
        };
      }
    } else if (jobType === 'scenes') {
      baseJob.input_data = {
        story: tableData.story,
        characterImage: tableData.character_image,
        audience: tableData.audience
      };
      if (tableData.generated_scenes) {
        baseJob.result_data = {
          pages: tableData.generated_scenes,
          character_description: tableData.character_description
        };
      }
    } else if (job.type === 'storybook') {
      tableData.title = jobData.input_data?.title;
      tableData.story = jobData.input_data?.story;
      tableData.character_image = jobData.input_data?.characterImage;
      tableData.pages = jobData.input_data?.pages;
      tableData.audience = jobData.input_data?.audience;
      tableData.is_reused_image = jobData.input_data?.isReusedImage;
      if (jobData.result_data?.storybook_id) {
        tableData.storybook_entry_id = jobData.result_data.storybook_id;
      }
    } else if (job.type === 'scenes') {
      tableData.story = jobData.input_data?.story;
      tableData.character_image = jobData.input_data?.characterImage;
      tableData.audience = jobData.input_data?.audience;
      if (jobData.result_data?.pages) {
        tableData.generated_scenes = jobData.result_data.pages;
      }
    }

      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
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

  private getTableName(jobType: JobType): string {
    return JOB_TABLE_MAP[jobType];
  }

  // Convert unified job data to table-specific format
  private mapToTableFormat(jobType: JobType, jobData: any): any {
    const tableName = this.getTableName(jobType);
    const mappings = FIELD_MAPPINGS[jobType] || {};
    
    // Start with common fields that exist in all job tables
    const tableData: any = {
      id: jobData.id, // Keep the generated string ID in a text field if table supports it
      user_id: jobData.user_id,
      status: jobData.status,
      progress: jobData.progress,
      current_step: jobData.current_step,
      error_message: jobData.error_message,
      retry_count: jobData.retry_count,
      max_retries: jobData.max_retries,
      created_at: jobData.created_at,
      updated_at: jobData.updated_at,
      started_at: jobData.started_at,
      completed_at: jobData.completed_at
    };

    // Add job-type specific fields based on mappings
    if (jobType === 'cartoonize') {
      tableData.original_image_data = jobData.input_data?.prompt || '';
      tableData.style = jobData.input_data?.style || 'cartoon';
      tableData.original_cloudinary_url = jobData.input_data?.imageUrl;
      if (jobData.result_data?.url) {
        tableData.generated_image_url = jobData.result_data.url;
      }
    } else if (jobType === 'auto-story') {
      tableData.genre = jobData.input_data?.genre;
      tableData.character_description = jobData.input_data?.characterDescription;
      tableData.cartoon_image_url = jobData.input_data?.cartoonImageUrl;
      tableData.audience = jobData.input_data?.audience;
      if (jobData.result_data?.storybook_id) {
        tableData.storybook_entry_id = jobData.result_data.storybook_id;
      }
    } else if (jobType === 'image-generation') {
      tableData.image_prompt = jobData.input_data?.image_prompt;
      tableData.character_description = jobData.input_data?.character_description;
      tableData.emotion = jobData.input_data?.emotion;
      tableData.audience = jobData.input_data?.audience;
      tableData.is_reused_image = jobData.input_data?.isReusedImage;
      tableData.cartoon_image = jobData.input_data?.cartoon_image;
      tableData.style = jobData.input_data?.style;
      if (jobData.result_data?.url) {
        tableData.generated_image_url = jobData.result_data.url;
      }
    }

    return tableData;
  }

  // Convert table format back to unified job data
  private mapFromTableFormat(jobType: JobType, tableData: any): JobData {
    const baseJob: any = {
      id: tableData.id?.toString() || this.generateJobId(),
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

    // Map job-type specific fields back to unified format
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
    } else if (jobType === 'auto-story') {
      baseJob.input_data = {
        genre: tableData.genre,
        characterDescription: tableData.character_description,
        cartoonImageUrl: tableData.cartoon_image_url,
        audience: tableData.audience
      };
      if (tableData.storybook_entry_id) {
        baseJob.result_data = {
          storybook_id: tableData.storybook_entry_id,
          generated_story: tableData.generated_story
        };
      }
    } else if (jobType === 'image-generation') {
      baseJob.input_data = {
        image_prompt: tableData.image_prompt,
        character_description: tableData.character_description,
        emotion: tableData.emotion,
        audience: tableData.audience,
        isReusedImage: tableData.is_reused_image,
        cartoon_image: tableData.cartoon_image,
        style: tableData.style
      };
      if (tableData.generated_image_url) {
        baseJob.result_data = {
          url: tableData.generated_image_url,
          prompt_used: tableData.final_prompt_used || tableData.image_prompt,
          reused: tableData.is_reused_image || false
        };
      }
    }

    return baseJob as JobData;
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

  // Create auto-story job using existing auto_story_jobs table
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

    const tableData = this.mapToTableFormat('auto-story', jobData);

    const result = await this.executeQuery<{ id: string }>(
      'Create auto-story job',
      async (supabase) => {
        const response = await supabase
          .from('auto_story_jobs')
          .insert(tableData)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`✅ Created auto-story job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create storybook job using existing storybook_jobs table
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

    const tableData = this.mapToTableFormat('storybook', jobData);

    const result = await this.executeQuery<{ id: string }>(
      'Create storybook job',
      async (supabase) => {
        const response = await supabase
          .from('storybook_jobs')
          .insert(tableData)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`✅ Created storybook job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create scene job using existing scene_generation_jobs table
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

    const tableData = this.mapToTableFormat('scenes', jobData);

    const result = await this.executeQuery<{ id: string }>(
      'Create scene job',
      async (supabase) => {
        const response = await supabase
          .from('scene_generation_jobs')
          .insert(tableData)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`✅ Created scene job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create image job using existing image_generation_jobs table
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

    const tableData = this.mapToTableFormat('image-generation', jobData);

    const result = await this.executeQuery<{ id: string }>(
      'Create image job',
      async (supabase) => {
        const response = await supabase
          .from('image_generation_jobs')
          .insert(tableData)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`✅ Created image job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Create cartoonize job using existing cartoonize_jobs table
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

    const tableData = this.mapToTableFormat('cartoonize', jobData);

    const result = await this.executeQuery<{ id: string }>(
      'Create cartoonize job',
      async (supabase) => {
        const response = await supabase
          .from('cartoonize_jobs')
          .insert(tableData)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`✅ Created cartoonize job: ${jobId}`);
      return jobId;
    }

    return null;
  }

  // Get job status from appropriate table
  async getJobStatus(jobId: string): Promise<JobData | null> {
    // Try to find the job in all job tables since we don't know the type
    const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
    
    for (const jobType of jobTypes) {
      const tableName = this.getTableName(jobType);
      
      const result = await this.executeQuery<any>(
        `Get job status from ${tableName}`,
        async (supabase) => {
          const response = await supabase
            .from(tableName)
            .select('*')
            .eq('id', jobId)
            .single();
          return { data: response.data, error: response.error };
        }
      );

      if (result) {
        console.log(`📊 Retrieved job status for: ${jobId} from ${tableName}`);
        return this.mapFromTableFormat(jobType, result);
      }
    }

    console.log(`❌ Job not found: ${jobId}`);
    return null;
  }

  // Update job progress in appropriate table
  async updateJobProgress(
    jobId: string,
    progress: number,
    currentStep?: string
  ): Promise<boolean> {
    // First find which table contains this job
    const job = await this.getJobStatus(jobId);
    if (!job) {
      console.error(`❌ Cannot update progress - job not found: ${jobId}`);
      return false;
    }

    const tableName = this.getTableName(job.type);
    const updateData: any = {
      progress: Math.max(0, Math.min(100, progress)),
      updated_at: new Date().toISOString()
    };

    if (currentStep) {
      updateData.current_step = currentStep;
    }

    if (progress > 0) {
      updateData.status = 'processing';
      if (!job.started_at) {
        updateData.started_at = new Date().toISOString();
      }
    }

    const result = await this.executeQuery<{ id: string }>(
      'Update job progress',
      async (supabase) => {
        const response = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', jobId)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`📈 Updated job progress: ${jobId} -> ${progress}%`);
      return true;
    }

    return false;
  }

  // Mark job as completed
  async markJobCompleted(jobId: string, resultData: any): Promise<boolean> {
    const job = await this.getJobStatus(jobId);
    if (!job) {
      console.error(`❌ Cannot mark completed - job not found: ${jobId}`);
      return false;
    }

    const tableName = this.getTableName(job.type);
    const now = new Date().toISOString();
    
    // Map result data to table-specific fields
    const updateData: any = {
      status: 'completed',
      progress: 100,
      current_step: 'Completed successfully',
      completed_at: now,
      updated_at: now
    };

    // Add job-type specific result fields
    if (job.type === 'cartoonize' && resultData?.url) {
      updateData.generated_image_url = resultData.url;
      if (resultData.cached) {
        updateData.final_cloudinary_url = resultData.url;
      }
    }

    const result = await this.executeQuery<{ id: string }>(
      'Mark job completed',
      async (supabase) => {
        const response = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', jobId)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`✅ Marked job completed: ${jobId}`);
      return true;
    }

    return false;
  }

  // Mark job as failed
  async markJobFailed(
    jobId: string,
    errorMessage: string,
    shouldRetry: boolean = false
  ): Promise<boolean> {
    const job = await this.getJobStatus(jobId);
    if (!job) {
      console.error(`❌ Cannot mark failed - job not found: ${jobId}`);
      return false;
    }

    const tableName = this.getTableName(job.type);
    const now = new Date().toISOString();
    const newRetryCount = job.retry_count + 1;
    const canRetry = shouldRetry && newRetryCount <= job.max_retries;

    const updateData: any = {
      status: canRetry ? 'pending' : 'failed',
      error_message: errorMessage,
      updated_at: now,
      retry_count: newRetryCount
    };

    if (!canRetry) {
      updateData.completed_at = now;
      updateData.current_step = 'Failed after retries';
    } else {
      updateData.current_step = `Retrying (${newRetryCount}/${job.max_retries})`;
      updateData.progress = 0;
    }

    const result = await this.executeQuery<{ id: string }>(
      'Mark job failed',
      async (supabase) => {
        const response = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', jobId)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      const action = canRetry ? 'scheduled for retry' : 'marked as failed';
      console.log(`❌ Job ${action}: ${jobId} - ${errorMessage}`);
      return true;
    }

    return false;
  }

  // Get pending jobs across all job tables
  async getPendingJobs(
    filter: JobFilter = {},
    limit: number = 50
  ): Promise<JobData[]> {
    const allPendingJobs: JobData[] = [];
    const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
    
    for (const jobType of jobTypes) {
      const tableName = this.getTableName(jobType);
      
      const result = await this.executeQuery<any[]>(
        `Get pending jobs from ${tableName}`,
        async (supabase) => {
          let query = supabase
            .from(tableName)
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(Math.ceil(limit / jobTypes.length)); // Distribute limit across tables

          if (filter.user_id) {
            query = query.eq('user_id', filter.user_id);
          }

          const response = await query;
          return { data: response.data, error: response.error };
        }
      );

      if (result && Array.isArray(result)) {
        const convertedJobs = result.map(job => this.mapFromTableFormat(jobType, job));
        allPendingJobs.push(...convertedJobs);
      }
    }

    // Sort by created_at and apply final limit
    allPendingJobs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const finalJobs = allPendingJobs.slice(0, limit);

    console.log(`📋 Retrieved ${finalJobs.length} pending jobs`);
    return finalJobs;
  }

  // Get jobs by filter criteria across all tables
  async getJobs(filter: JobFilter = {}): Promise<JobData[]> {
    const allJobs: JobData[] = [];
    const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
    
    for (const jobType of jobTypes) {
      const tableName = this.getTableName(jobType);
      
      const result = await this.executeQuery<any[]>(
        `Get jobs from ${tableName}`,
        async (supabase) => {
          let query = supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false });

          if (filter.user_id) {
            query = query.eq('user_id', filter.user_id);
          }

          if (filter.status) {
            query = query.eq('status', filter.status);
          }

          if (filter.limit) {
            query = query.limit(Math.ceil(filter.limit / jobTypes.length));
          }

          const response = await query;
          return { data: response.data, error: response.error };
        }
      );

      if (result && Array.isArray(result)) {
        const convertedJobs = result.map(job => this.mapFromTableFormat(jobType, job));
        allJobs.push(...convertedJobs);
      }
    }

    // Sort by created_at descending and apply final limit
    allJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const finalJobs = filter.limit ? allJobs.slice(0, filter.limit) : allJobs;

    console.log(`📋 Retrieved ${finalJobs.length} jobs`);
    return finalJobs;
  }

  // Cancel a job across all tables
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJobStatus(jobId);
    if (!job) {
      console.error(`❌ Cannot cancel - job not found: ${jobId}`);
      return false;
    }

    const tableName = this.getTableName(job.type);
    const updateData: any = {
      status: 'cancelled',
      current_step: 'Cancelled by user',
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };

    const result = await this.executeQuery<{ id: string }>(
      'Cancel job',
      async (supabase) => {
        const response = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', jobId)
          .select('id')
          .single();
        return { data: response.data, error: response.error };
      }
    );

    if (result?.id) {
      console.log(`🚫 Cancelled job: ${jobId}`);
      return true;
    }

    return false;
  }

  // Get job statistics across all job tables
  async getJobStats(userId?: string): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    const jobTypes: JobType[] = ['cartoonize', 'auto-story', 'image-generation', 'storybook', 'scenes'];
    
    for (const jobType of jobTypes) {
      const tableName = this.getTableName(jobType);
      
      const result = await this.executeQuery<any[]>(
        `Get stats from ${tableName}`,
        async (supabase) => {
          let query = supabase.from(tableName).select('status');
          
          if (userId) {
            query = query.eq('user_id', userId);
          }
          
          const response = await query;
          return { data: response.data, error: response.error };
        }
      );

      if (result && Array.isArray(result)) {
        result.forEach(job => {
          stats.total++;
          if (job.status in stats) {
            (stats as any)[job.status]++;
          }
        });
      }
    }

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