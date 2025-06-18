import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Scene {
  description: string;
  emotion: string;
  imagePrompt: string;
  generatedImage?: string;
  error?: string;
}

interface Page {
  pageNumber: number;
  scenes: Scene[];
}

export async function POST(request: Request) {
  try {
    // Comprehensive environment variable validation
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ 
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY environment variable is missing');
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.',
          configurationError: true
        },
        { status: 500 }
      );
    }

    // Removed strict format validation - OpenAI now uses multiple key formats (sk-, sk-proj-, etc.)
    console.log('🔑 OpenAI API Key found, length:', openaiApiKey.length);

    // Initialize dual Supabase clients
    const cookieStore = cookies();
    const authSupabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user using auth client
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
      // Continue without user_id if auth fails
    }

    const useMock = process.env.USE_MOCK === 'true';

    const { title, story, characterImage, pages, audience, isReusedImage } = await request.json();

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!story?.trim()) return NextResponse.json({ error: 'Story content is required' }, { status: 400 });
    if (!Array.isArray(pages) || pages.length === 0) return NextResponse.json({ error: 'At least one page is required' }, { status: 400 });
    if (!characterImage) return NextResponse.json({ error: 'Character image is required' }, { status: 400 });

    // Check if user has already created a storybook (using auth client)
    if (user?.id) {
      const { count } = await authSupabase
        .from('storybook_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (count && count > 0) {
        return NextResponse.json(
          { error: "You've already created your free storybook. Upgrade to unlock more." },
          { status: 403 }
        );
      }
    }

    console.log('🌐 Processing storybook creation...');

    let characterDescription = '';

    if (!isReusedImage) {
      console.log('🔍 Getting character description...');
      try {
        const describeResponse = await fetch('/api/image/describe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: characterImage }),
        });

        if (!describeResponse.ok) {
          const errorText = await describeResponse.text();
          console.warn('⚠️ Character description failed:', errorText);
          characterDescription = 'a cartoon character';
        } else {
          const { characterDescription: description } = await describeResponse.json();
          characterDescription = description;
          console.log('✅ Character description:', characterDescription);
        }
      } catch (descError) {
        console.warn('⚠️ Character description failed, continuing without it:', descError);
        characterDescription = 'a cartoon character';
      }
    }

    const updatedPages: Page[] = [];
    let hasErrors = false;

    console.log(`🎨 Processing ${pages.length} pages...`);

    for (const [pageIndex, page] of pages.entries()) {
      console.log(`\n=== Processing Page ${pageIndex + 1} ===`);
      const updatedScenes: Scene[] = [];

      for (const [sceneIndex, scene] of page.scenes.entries()) {
        console.log(`Processing Scene ${sceneIndex + 1} of Page ${pageIndex + 1}`);

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

          if (!imageResponse.ok) {
            const errorText = await imageResponse.text();
            console.error(`❌ Failed to generate image for Scene ${sceneIndex + 1}:`, errorText);
            hasErrors = true;
            updatedScenes.push({
              ...scene,
              error: `Failed to generate image: ${errorText}`,
              generatedImage: characterImage, // Fallback to character image
            });
            continue;
          }

          const { url } = await imageResponse.json();
          console.log(`✅ Generated image URL for Scene ${sceneIndex + 1}:`, url);

          updatedScenes.push({
            ...scene,
            generatedImage: url,
          });
        } catch (err: any) {
          console.error(`🔥 Error during image generation:`, err);
          hasErrors = true;
          updatedScenes.push({
            ...scene,
            error: err.message || 'Failed to generate image',
            generatedImage: characterImage, // Fallback to character image
          });
        }
      }

      updatedPages.push({
        pageNumber: pageIndex + 1,
        scenes: updatedScenes,
      });
    }

    console.log('💾 Saving storybook to database...');
    
    // Use admin client for database operations (bypasses RLS)
    const { data: storybookEntry, error: supabaseError } = await adminSupabase
      .from('storybook_entries')
      .insert({
        title,
        story,
        pages: updatedPages,
        user_id: user?.id || null,
        audience,
        character_description: characterDescription,
        has_errors: hasErrors,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('❌ Failed to save storybook:', supabaseError);
      return NextResponse.json(
        {
          error: 'Failed to save storybook',
          details: supabaseError.message,
          code: supabaseError.code,
        },
        { status: 500 }
      );
    }

    console.log('✅ Storybook saved successfully!');

    return NextResponse.json({
      id: storybookEntry.id,
      title,
      story,
      pages: updatedPages,
      audience,
      has_errors: hasErrors,
      images: [
        {
          original: characterImage,
          generated: updatedPages[0]?.scenes[0]?.generatedImage || '',
        },
      ],
      warning: hasErrors ? 'Some images failed to generate' : undefined,
    });
  } catch (error: any) {
    console.error('❗ Unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create storybook',
        details: error.message || 'Unexpected error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}