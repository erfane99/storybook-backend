import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ 
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

    // Parse and validate input data  
    const { 
      story, 
      character_image,  // ✅ FIXED: Use database field name (snake_case)
      audience = 'children',
      character_description  // ✅ ADDED: Include optional field
    } = await request.json();

    // Validation - same as current generate-scenes
    if (!story || story.trim().length < 50) {
      return NextResponse.json({ 
        error: 'Story must be at least 50 characters long.' 
      }, { status: 400 });
    }

    if (!['children', 'young_adults', 'adults'].includes(audience)) {
      return NextResponse.json({ 
        error: 'Invalid audience type' 
      }, { status: 400 });
    }

    // Optional user authentication (scenes can be generated anonymously)
    let userId: string | undefined;
    try {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        // Extract user ID from token if provided (optional)
        // This is for tracking purposes only, not required
      }
    } catch (authError) {
      // Continue without user ID - scenes can be generated anonymously
    }

    // Generate job ID
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // ✅ DATABASE-FIRST: Store in individual columns matching exact database schema
    const { error: insertError } = await adminSupabase
      .from('scene_generation_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing scene generation',
        // Individual columns matching database schema
        story: story,
        character_image: character_image,  // ✅ FIXED: Use correct field name
        audience: audience,
        character_description: character_description,  // ✅ ADDED: Include optional field
        created_at: now,
        updated_at: now,
        retry_count: 0,
        max_retries: 3
      });

    if (insertError) {
      console.error('❌ Failed to create scene job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create scene job' },
        { status: 500 }
      );
    }

    // Calculate estimated completion time based on story length and audience
    const wordCount = story.trim().split(/\s+/).length;
    const baseMinutes = audience === 'children' ? 2 : audience === 'young_adults' ? 3 : 4;
    const estimatedMinutes = Math.max(1, baseMinutes + Math.floor(wordCount / 200));
    const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    console.log(`✅ Created scene generation job: ${jobId}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedCompletion: estimatedCompletion.toISOString(),
      estimatedMinutes,
      pollingUrl: `/api/jobs/scenes/status/${jobId}`,
      message: 'Scene generation job created. Processing will be handled by worker service.',
      storyInfo: {
        wordCount,
        audience,
        estimatedScenes: audience === 'children' ? '5-8' : audience === 'young_adults' ? '8-12' : '10-15'
      }
    });

  } catch (error: unknown) {
    console.error('❌ Scene job creation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create scene job',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}