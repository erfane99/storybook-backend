import { jobManager } from './job-manager';
import { JobData, JobType, StorybookJobData, AutoStoryJobData, SceneJobData, CartoonizeJobData, ImageJobData } from './types';
import { cartoonizeService } from '@/lib/services/cartoonize-service';

class BackgroundJobProcessor {
  private isProcessing = false;
  private maxConcurrentJobs = 3;
  private currentlyProcessing = new Set<string>();

  constructor() {
    console.log('🔧 Background job processor initialized');
  }

  // Main processing function - processes one step at a time
  async processNextJobStep(): Promise<boolean> {
    if (this.isProcessing || this.currentlyProcessing.size >= this.maxConcurrentJobs) {
      return false;
    }

    this.isProcessing = true;
    let processedAny = false;

    try {
      // Get pending jobs
      const pendingJobs = await jobManager.getPendingJobs({}, 10);
      
      for (const job of pendingJobs) {
        if (this.currentlyProcessing.has(job.id)) {
          continue; // Skip if already processing
        }

        if (this.currentlyProcessing.size >= this.maxConcurrentJobs) {
          break; // Respect concurrency limit
        }

        // Process this job
        this.currentlyProcessing.add(job.id);
        processedAny = true;

        // Process job in background (don't await to allow parallel processing)
        this.processJobAsync(job).finally(() => {
          this.currentlyProcessing.delete(job.id);
        });
      }
    } catch (error) {
      console.error('❌ Error in processNextJobStep:', error);
    } finally {
      this.isProcessing = false;
    }

    return processedAny;
  }

  // Process a single job asynchronously
  private async processJobAsync(job: JobData): Promise<void> {
    try {
      console.log(`🔄 Processing job: ${job.id} (${job.type})`);

      // Update job to processing status if still pending
      if (job.status === 'pending') {
        await jobManager.updateJobProgress(job.id, 1, 'Starting job processing');
      }

      // Route to appropriate processor with proper type checking
      switch (job.type) {
        case 'storybook':
          await this.processStorybookJob(job as StorybookJobData);
          break;
        case 'auto-story':
          await this.processAutoStoryJob(job as AutoStoryJobData);
          break;
        case 'scenes':
          await this.processSceneJob(job as SceneJobData);
          break;
        case 'cartoonize':
          await this.processCartoonizeJob(job as CartoonizeJobData);
          break;
        case 'image-generation':
          await this.processImageJob(job as ImageJobData);
          break;
        default:
          // Use type assertion to help TypeScript understand this is a valid job type
          const jobType = (job as JobData).type;
          throw new Error(`Unknown job type: ${jobType}`);
      }
    } catch (error: any) {
      console.error(`❌ Job processing failed: ${job.id}`, error);
      await jobManager.markJobFailed(job.id, error.message || 'Job processing failed', true);
    }
  }

  // Process storybook generation job
  async processStorybookJob(job: StorybookJobData): Promise<void> {
    const { title, story, characterImage, pages, audience, isReusedImage } = job.input_data;

    try {
      // Step 1: Character description (0% → 25%)
      await jobManager.updateJobProgress(job.id, 5, 'Analyzing character image');
      
      let characterDescription = '';
      if (!isReusedImage) {
        try {
          const describeResponse = await fetch('/api/image/describe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: characterImage }),
          });

          if (describeResponse.ok) {
            const { characterDescription: description } = await describeResponse.json();
            characterDescription = description;
          } else {
            characterDescription = 'a cartoon character';
          }
        } catch (error) {
          console.warn('⚠️ Character description failed, using fallback');
          characterDescription = 'a cartoon character';
        }
      }

      await jobManager.updateJobProgress(job.id, 25, 'Character analysis complete');

      // Step 2: Process scenes page by page (25% → 75%)
      const updatedPages: any[] = [];
      const totalScenes = pages.reduce((total: number, page: any) => total + (page.scenes?.length || 0), 0);
      let processedScenes = 0;

      for (const [pageIndex, page] of pages.entries()) {
        console.log(`Processing Page ${pageIndex + 1} of ${pages.length}`);
        const updatedScenes = [];

        for (const [sceneIndex, scene] of (page.scenes || []).entries()) {
          try {
            const imageResponse = await fetch('/api/story/generate-cartoon-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image_prompt: scene.imagePrompt,
                character_description: characterDescription,
                emotion: scene.emotion,
                audience,
                isReusedImage,
                cartoon_image: characterImage,
                style: 'storybook',
              }),
            });

            if (imageResponse.ok) {
              const { url } = await imageResponse.json();
              updatedScenes.push({
                ...scene,
                generatedImage: url,
              });
            } else {
              updatedScenes.push({
                ...scene,
                generatedImage: characterImage, // Fallback
                error: 'Failed to generate image',
              });
            }
          } catch (error: any) {
            updatedScenes.push({
              ...scene,
              generatedImage: characterImage, // Fallback
              error: error.message || 'Failed to generate image',
            });
          }

          processedScenes++;
          const progress = 25 + (processedScenes / totalScenes) * 50;
          await jobManager.updateJobProgress(
            job.id, 
            Math.round(progress), 
            `Generated ${processedScenes}/${totalScenes} scene illustrations`
          );
        }

        updatedPages.push({
          pageNumber: pageIndex + 1,
          scenes: updatedScenes,
        });
      }

      await jobManager.updateJobProgress(job.id, 75, 'All scenes processed, saving storybook');

      // Step 3: Save to database (75% → 100%)
      const hasErrors = updatedPages.some((page: any) => 
        page.scenes.some((scene: any) => scene.error)
      );

      // Import Supabase client with proper error handling
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing required Supabase environment variables');
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: storybookEntry, error: supabaseError } = await supabase
        .from('storybook_entries')
        .insert({
          title,
          story,
          pages: updatedPages,
          user_id: job.user_id || null,
          audience,
          character_description: characterDescription,
          has_errors: hasErrors,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (supabaseError) {
        throw new Error(`Database save failed: ${supabaseError.message}`);
      }

      await jobManager.updateJobProgress(job.id, 100, 'Storybook saved successfully');

      // Mark job as completed
      await jobManager.markJobCompleted(job.id, {
        storybook_id: storybookEntry.id,
        pages: updatedPages,
        has_errors: hasErrors,
        warning: hasErrors ? 'Some images failed to generate' : undefined,
      });

      console.log(`✅ Storybook job completed: ${job.id}`);

    } catch (error: any) {
      console.error(`❌ Storybook job failed: ${job.id}`, error);
      throw error;
    }
  }

  // Process auto-story generation job
  async processAutoStoryJob(job: AutoStoryJobData): Promise<void> {
    const { genre, characterDescription, cartoonImageUrl, audience } = job.input_data;

    try {
      // Step 1: Generate story content (0% → 40%)
      await jobManager.updateJobProgress(job.id, 5, 'Generating story content');

      const storyResponse = await fetch('/api/story/generate-auto-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre,
          characterDescription,
          cartoonImageUrl,
          audience,
          user_id: job.user_id,
        }),
      });

      if (!storyResponse.ok) {
        const errorData = await storyResponse.json();
        throw new Error(errorData.error || 'Failed to generate story');
      }

      const { storybookId } = await storyResponse.json();

      await jobManager.updateJobProgress(job.id, 100, 'Auto-story generation complete');

      // Mark job as completed
      await jobManager.markJobCompleted(job.id, {
        storybook_id: storybookId,
        generated_story: 'Auto-generated story',
      });

      console.log(`✅ Auto-story job completed: ${job.id}`);

    } catch (error: any) {
      console.error(`❌ Auto-story job failed: ${job.id}`, error);
      throw error;
    }
  }

  // Process scene generation job
  async processSceneJob(job: SceneJobData): Promise<void> {
    const { story, characterImage, audience } = job.input_data;

    try {
      // Step 1: Character analysis (0% → 30%)
      await jobManager.updateJobProgress(job.id, 10, 'Analyzing story structure');

      let characterDescription = 'a young protagonist';
      if (characterImage) {
        try {
          const describeResponse = await fetch('/api/image/describe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: characterImage }),
          });

          if (describeResponse.ok) {
            const { characterDescription: description } = await describeResponse.json();
            characterDescription = description;
          }
        } catch (error) {
          console.warn('⚠️ Character description failed, using default');
        }
      }

      await jobManager.updateJobProgress(job.id, 30, 'Character analysis complete');

      // Step 2: Scene planning (30% → 70%)
      await jobManager.updateJobProgress(job.id, 40, 'Breaking story into scenes');

      const scenesResponse = await fetch('/api/story/generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story,
          characterImage,
          audience,
        }),
      });

      if (!scenesResponse.ok) {
        const errorText = await scenesResponse.text();
        throw new Error(`Scene generation failed: ${errorText}`);
      }

      const { pages } = await scenesResponse.json();

      await jobManager.updateJobProgress(job.id, 70, 'Scene breakdown complete');

      // Step 3: Final formatting (70% → 100%)
      await jobManager.updateJobProgress(job.id, 90, 'Finalizing scene layout');

      const updatedPages = pages.map((page: any) => ({
        ...page,
        scenes: page.scenes.map((scene: any) => ({
          ...scene,
          generatedImage: characterImage // Placeholder until image generation
        }))
      }));

      await jobManager.updateJobProgress(job.id, 100, 'Scene generation complete');

      // Mark job as completed
      await jobManager.markJobCompleted(job.id, {
        pages: updatedPages,
        character_description: characterDescription,
      });

      console.log(`✅ Scene job completed: ${job.id}`);

    } catch (error: any) {
      console.error(`❌ Scene job failed: ${job.id}`, error);
      throw error;
    }
  }

  // Process image cartoonization job - UPDATED TO USE INTERNAL SERVICE
  async processCartoonizeJob(job: CartoonizeJobData): Promise<void> {
    const { prompt, style, imageUrl } = job.input_data;

    try {
      // Step 1: Initialize processing (0% → 10%)
      await jobManager.updateJobProgress(job.id, 10, 'Preparing image for processing');

      // Step 2: Process with cartoonize service (10% → 90%)
      await jobManager.updateJobProgress(job.id, 40, 'Generating cartoon image');

      const result = await cartoonizeService.processCartoonize({
        prompt,
        style,
        imageUrl,
        userId: job.user_id,
      });

      await jobManager.updateJobProgress(job.id, 90, 'Cartoon generation complete');

      // Step 3: Finalize (90% → 100%)
      await jobManager.updateJobProgress(job.id, 100, 'Cartoonization complete');

      // Mark job as completed
      await jobManager.markJobCompleted(job.id, {
        url: result.url,
        cached: result.cached,
      });

      console.log(`✅ Cartoonize job completed: ${job.id}`);

    } catch (error: any) {
      console.error(`❌ Cartoonize job failed: ${job.id}`, error);
      throw error;
    }
  }

  // Process single image generation job
  async processImageJob(job: ImageJobData): Promise<void> {
    const { 
      image_prompt, 
      character_description, 
      emotion, 
      audience, 
      isReusedImage, 
      cartoon_image, 
      style 
    } = job.input_data;

    try {
      // Step 1: Cache check (0% → 50%)
      await jobManager.updateJobProgress(job.id, 10, 'Checking for cached images');

      // Check cache if user and cartoon image provided
      let cachedUrl: string | null = null;
      if (job.user_id && cartoon_image) {
        try {
          // Use relative import path that's more likely to resolve
          const cacheUtils = await import('../supabase/cache-utils').catch(() => null);
          if (cacheUtils?.getCachedCartoonImage) {
            cachedUrl = await cacheUtils.getCachedCartoonImage(cartoon_image, style || 'storybook', job.user_id);
          }
        } catch (error) {
          console.warn('⚠️ Cache check failed, continuing with generation');
        }
      }

      if (cachedUrl) {
        await jobManager.updateJobProgress(job.id, 100, 'Retrieved from cache');
        await jobManager.markJobCompleted(job.id, {
          url: cachedUrl,
          prompt_used: image_prompt,
          reused: true,
        });
        return;
      }

      await jobManager.updateJobProgress(job.id, 50, 'Cache check complete, generating new image');

      // Step 2: DALL-E generation (50% → 100%)
      const imageResponse = await fetch('/api/story/generate-cartoon-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_prompt,
          character_description,
          emotion,
          audience,
          isReusedImage,
          cartoon_image,
          user_id: job.user_id,
          style,
        }),
      });

      if (!imageResponse.ok) {
        const errorData = await imageResponse.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }

      const { url, prompt_used, reused } = await imageResponse.json();

      await jobManager.updateJobProgress(job.id, 100, 'Image generation complete');

      // Mark job as completed
      await jobManager.markJobCompleted(job.id, {
        url,
        prompt_used: prompt_used || image_prompt,
        reused: reused || false,
      });

      console.log(`✅ Image job completed: ${job.id}`);

    } catch (error: any) {
      console.error(`❌ Image job failed: ${job.id}`, error);
      throw error;
    }
  }

  // Get processing statistics
  getProcessingStats() {
    return {
      isProcessing: this.isProcessing,
      currentlyProcessing: this.currentlyProcessing.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      activeJobs: Array.from(this.currentlyProcessing),
    };
  }

  // Health check
  isHealthy(): boolean {
    return this.currentlyProcessing.size < this.maxConcurrentJobs;
  }
}

// Export singleton instance
export const jobProcessor = new BackgroundJobProcessor();
export default jobProcessor;