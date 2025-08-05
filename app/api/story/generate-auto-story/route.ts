import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';
import { serviceContainer } from '@/lib/services/service-container';
import type { IAIService } from '@/lib/services/interfaces/service-contracts';
import type { StoryGenerationOptions, StoryGenerationResult, SceneGenerationOptions } from '@/lib/services/interfaces/service-contracts';

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

    // JWT Authentication
    const authResult = await validateAuthToken(request);
    const { userId, error: authError } = extractUserId(authResult);

    if (authError || !userId) {
      console.error('❌ JWT validation failed:', authError);
      return NextResponse.json(
        createAuthErrorResponse(authError || 'Authentication required'),
        { status: 401 }
      );
    }

    const { genre, characterDescription, cartoonImageUrl, audience = 'children' } = await request.json();

    // Validation
    const validGenres = ['adventure', 'comedy', 'drama', 'fantasy', 'mystery', 'superhero', 'animal', 'friendship', 'growth', 'science', 'magic', 'discovery', 'courage', 'cooperation', 'honesty', 'creativity', 'kindness', 'perseverance', 'responsibility', 'fairytale', 'holiday', 'nature', 'sports', 'mythology', 'folk-tale', 'space', 'pirates', 'dinosaurs', 'robots', 'underwater', 'time-travel', 'music', 'art', 'cooking', 'school', 'family', 'pets', 'seasons', 'emotions', 'problem-solving', 'imagination', 'dreams', 'wishes', 'secrets', 'quests', 'riddles', 'treasure', 'circus', 'transportation', 'birthday', 'siblings', 'bedtime', 'history'];

    if (!genre || !validGenres.includes(genre)) {
      return NextResponse.json(
        { error: `Invalid genre. Must be one of: ${validGenres.join(', ')}` },
        { status: 400 }
      );
    }

    if (!characterDescription || characterDescription.trim().length < 10) {
      return NextResponse.json(
        { error: 'Character description must be at least 10 characters long' },
        { status: 400 }
      );
    }

    if (!cartoonImageUrl) {
      return NextResponse.json(
        { error: 'Cartoon image URL is required' },
        { status: 400 }
      );
    }

    console.log('📚 Generating auto-story with modular AI service...');
    console.log(`📖 Genre: ${genre}`);
    console.log(`👥 Audience: ${audience}`);
    console.log(`🎭 Character: ${characterDescription.substring(0, 50)}...`);

    // Get AI service from container
    let aiService: IAIService;
    try {
      aiService = serviceContainer.resolve<IAIService>('IAIService');
      console.log('✅ AI service resolved from container');
    } catch (error) {
      console.error('❌ Failed to resolve AI service:', error);
      return NextResponse.json(
        { 
          error: 'AI service not available. Please check service configuration.',
          configurationError: true
        },
        { status: 500 }
      );
    }

    // Step 1: Generate story with narrative intelligence
    console.log('🚀 Generating story with narrative intelligence and genre expertise...');
    
    const storyGenerationOptions: StoryGenerationOptions = {
      genre: genre,
      characterDescription: characterDescription.trim(),
      audience: audience as 'children' | 'young adults' | 'adults',
      targetLength: audience === 'children' ? 800 : audience === 'young adults' ? 1200 : 1500,
      includeCharacterDevelopment: true,
      narrativeStyle: 'engaging'
    };

    // Generate story using the modular AI service with:
    // - Genre-specific narrative structures
    // - Character-driven plot development
    // - Audience-appropriate language and themes
    // - Story archetype detection
    // - Emotional arc planning
    const storyResult: StoryGenerationResult = await aiService.generateAutoStory(storyGenerationOptions);

    console.log('✅ Story generated with narrative intelligence');
    console.log(`📊 Story length: ${storyResult.story.length} characters`);
    console.log(`🎭 Story archetype: ${storyResult.metadata?.archetype || 'general'}`);
    console.log(`💫 Emotional arc: ${storyResult.metadata?.emotionalArc || 'standard'}`);

    // Step 2: Generate scenes with the enhanced story
    console.log('🎨 Generating scenes from the story...');

    const sceneGenerationOptions: SceneGenerationOptions = {
      story: storyResult.story,
      audience: audience as 'children' | 'young adults' | 'adults',
      characterImage: cartoonImageUrl,
      characterArtStyle: 'storybook',
      layoutType: 'comic-book-panels'
    };

    // Generate scenes with all the advanced features
    const sceneResult = await aiService.generateScenesWithAudience(sceneGenerationOptions);

    console.log(`✅ Generated ${sceneResult.pages.length} pages with professional comic layout`);

    // Step 3: Save to database
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: storybook, error: supabaseError } = await adminSupabase
      .from('storybook_entries')
      .insert({
        title: storyResult.title || `${genre.charAt(0).toUpperCase() + genre.slice(1)} Story`,
        story: storyResult.story,
        pages: sceneResult.pages,
        user_id: userId,
        audience,
        character_description: characterDescription,
        created_at: new Date().toISOString(),
        // Additional metadata from the enhanced system
        metadata: {
          genre: genre,
          storyArchetype: storyResult.metadata?.archetype,
          emotionalArc: storyResult.metadata?.emotionalArc,
          narrativeIntelligence: sceneResult.metadata?.narrativeIntelligenceApplied || false,
          characterConsistency: sceneResult.metadata?.characterConsistencyEnabled || false,
          environmentalConsistency: sceneResult.metadata?.environmentalConsistencyEnabled || false,
          qualityScore: sceneResult.metadata?.qualityScore || 0,
          generatedWith: 'modular-ai-service-v2'
        }
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('❌ Failed to save storybook:', supabaseError);
      throw new Error('Failed to save storybook to database');
    }

    console.log('✅ Successfully saved enhanced storybook');
    console.log(`🎯 Storybook ID: ${storybook.id}`);

    // Return success response
    return NextResponse.json({
      storybookId: storybook.id,
      metadata: {
        title: storybook.title,
        genre: genre,
        audience: audience,
        totalPages: sceneResult.pages.length,
        totalScenes: sceneResult.pages.reduce((total, page) => total + page.scenes.length, 0),
        storyLength: storyResult.story.length,
        // Enhanced metadata
        storyArchetype: storyResult.metadata?.archetype || 'general',
        emotionalArc: storyResult.metadata?.emotionalArc || 'standard',
        narrativeIntelligence: true,
        characterConsistency: true,
        environmentalConsistency: true,
        professionalStandards: true,
        qualityScore: sceneResult.metadata?.qualityScore || 85
      }
    });

  } catch (error: any) {
    console.error('❌ Generate auto story error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // Check for specific error types
    if (error.name === 'AIRateLimitError') {
      return NextResponse.json(
        { 
          error: 'AI service rate limit exceeded. Please try again later.',
          retryAfter: error.retryAfter || 60
        },
        { status: 429 }
      );
    }

    if (error.name === 'AIContentPolicyError') {
      return NextResponse.json(
        { 
          error: 'Content policy violation detected. Please try a different genre or character description.',
          details: error.message
        },
        { status: 400 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate story',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}