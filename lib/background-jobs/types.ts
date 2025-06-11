export type JobType = 'storybook' | 'auto-story' | 'scenes' | 'cartoonize' | 'image-generation';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BaseJobData {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0-100
  current_step?: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
}

// Storybook generation job
export interface StorybookJobData extends BaseJobData {
  type: 'storybook';
  input_data: {
    title: string;
    story: string;
    characterImage: string;
    pages: any[];
    audience: 'children' | 'young_adults' | 'adults';
    isReusedImage?: boolean;
  };
  result_data?: {
    storybook_id: string;
    pages: any[];
    has_errors: boolean;
    warning?: string;
  };
}

// Auto-story generation job
export interface AutoStoryJobData extends BaseJobData {
  type: 'auto-story';
  input_data: {
    genre: string;
    characterDescription: string;
    cartoonImageUrl: string;
    audience: 'children' | 'young_adults' | 'adults';
  };
  result_data?: {
    storybook_id: string;
    generated_story: string;
  };
}

// Scene generation job
export interface SceneJobData extends BaseJobData {
  type: 'scenes';
  input_data: {
    story: string;
    characterImage: string;
    audience: 'children' | 'young_adults' | 'adults';
  };
  result_data?: {
    pages: any[];
    character_description?: string;
  };
}

// Image cartoonization job
export interface CartoonizeJobData extends BaseJobData {
  type: 'cartoonize';
  input_data: {
    prompt: string;
    style: string;
    imageUrl?: string;
  };
  result_data?: {
    url: string;
    cached: boolean;
  };
}

// Single image generation job
export interface ImageJobData extends BaseJobData {
  type: 'image-generation';
  input_data: {
    image_prompt: string;
    character_description: string;
    emotion: string;
    audience: 'children' | 'young_adults' | 'adults';
    isReusedImage?: boolean;
    cartoon_image?: string;
    style?: string;
  };
  result_data?: {
    url: string;
    prompt_used: string;
    reused: boolean;
  };
}

export type JobData = StorybookJobData | AutoStoryJobData | SceneJobData | CartoonizeJobData | ImageJobData;

export interface JobFilter {
  user_id?: string;
  type?: JobType;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}

export interface JobUpdateData {
  status?: JobStatus;
  progress?: number;
  current_step?: string;
  error_message?: string;
  result_data?: any;
  started_at?: string;
  completed_at?: string;
}