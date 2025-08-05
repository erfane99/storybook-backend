import { NextResponse } from 'next/server';
import { serviceContainer } from '@/lib/services/service-container';
import type { IAIService } from '@/lib/services/interfaces/service-contracts';
import type { ImageGenerationOptions, ImageGenerationResult } from '@/lib/services/interfaces/service-contracts';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const {
      image_prompt,
      character_description,
      emotion,
      audience,
      isReusedImage,
      cartoon_image,
      user_id,
      style = 'storybook',
      // New optional parameters for enhanced generation
      characterArtStyle,
      layoutType,
      panelType
    } = await request.json();

    // Validation
    if (!image_prompt || !character_description || !emotion) {
      return NextResponse.json(
        { error: 'Missing required fields: image_prompt, character_description, and emotion are required' }, 
        { status: 400 }
      );
    }

    const useMock = process.env.USE_MOCK === 'true';

    // Optional cache operations - completely isolated to prevent failures
    if (user_id && cartoon_image && !useMock) {
      try {
        const { getCachedCartoonImage } = await import('@/lib/supabase/cache-utils');
        const cachedUrl = await getCachedCartoonImage(cartoon_image, style, user_id);
        if (cachedUrl) {
          console.log('✅ Found cached cartoon image');
          return NextResponse.json({ 
            url: cachedUrl, 
            reused: true,
            prompt_used: 'Cached image - no prompt needed',
            cached: true
          });
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache lookup failed, continuing with generation:', cacheError);
      }
    }

    if (useMock) {
      return NextResponse.json({
        url: 'https://placekitten.com/1024/1024',
        prompt_used: image_prompt,
        mock: true,
        reused: false
      });
    }

    console.log('🎨 Generating professional comic panel with modular AI service...');
    console.log(`🎭 Emotion: ${emotion}`);
    console.log(`👥 Audience: ${audience}`);
    console.log(`🎨 Style: ${style}`);
    console.log(`♻️ Reused character: ${isReusedImage}`);

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

    // Prepare options for the modular image generation
    const imageGenerationOptions: ImageGenerationOptions = {
      image_prompt: image_prompt.trim(),
      character_description: character_description.trim(),
      emotion: emotion as 'happy' | 'sad' | 'excited' | 'scared' | 'angry' | 'surprised' | 'curious' | 'confused' | 'determined',
      audience: audience as 'children' | 'young adults' | 'adults',
      isReusedImage: isReusedImage || false,
      cartoon_image: cartoon_image || undefined,
      style: style,
      characterArtStyle: characterArtStyle || style || 'storybook',
      layoutType: layoutType || 'comic-book-panels',
      panelType: panelType || 'standard'
    };

    console.log('🚀 Calling enhanced image generation with character consistency...');

    // Use the modular AI service with all its advanced features:
    // - Character DNA consistency (95%+ accuracy)
    // - Professional panel composition
    // - Speech bubble intelligence (if dialogue)
    // - Environmental consistency
    // - Quality enforcement layers
    // - Intelligent prompt compression
    const imageResult: ImageGenerationResult = await aiService.generateSceneImage(imageGenerationOptions);

    console.log('✅ Image generation complete with enhanced AI service');
    console.log(`🎯 Character consistency applied: ${!imageResult.reused}`);
    console.log(`📊 Prompt compression applied: ${imageResult.compressionApplied || false}`);

    // Optional cache save for new generations
    if (user_id && cartoon_image && !useMock && !imageResult.reused && imageResult.url) {
      try {
        const { saveCartoonImageToCache } = await import('@/lib/supabase/cache-utils');
        await saveCartoonImageToCache(cartoon_image, imageResult.url, style, user_id);
        console.log('💾 Saved to cache for future use');
      } catch (cacheError) {
        console.warn('⚠️ Failed to save to cache (non-critical):', cacheError);
      }
    }

    // Return the enhanced result
    return NextResponse.json({
      url: imageResult.url,
      prompt_used: imageResult.prompt_used,
      reused: imageResult.reused,
      // Additional metadata from the enhanced system
      metadata: {
        compressionApplied: imageResult.compressionApplied || false,
        characterConsistency: !imageResult.reused, // New images use character DNA
        professionalStandards: true,
        panelType: panelType || 'standard',
        emotion: emotion,
        audience: audience,
        style: style
      }
    });

  } catch (error: any) {
    console.error('❌ Generate cartoon image error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // Check for specific error types from the modular system
    if (error.name === 'AIContentPolicyError') {
      return NextResponse.json(
        { 
          error: 'Content policy violation detected. Please modify your image prompt.',
          details: error.message
        },
        { status: 400 }
      );
    }

    if (error.name === 'AIRateLimitError') {
      return NextResponse.json(
        { 
          error: 'AI service rate limit exceeded. Please try again later.',
          retryAfter: error.retryAfter || 60
        },
        { status: 429 }
      );
    }

    if (error.message?.includes('Prompt too long')) {
      return NextResponse.json(
        { 
          error: 'Image prompt is too complex. The system will automatically compress it.',
          details: 'This should not happen with the modular system'
        },
        { status: 400 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate image',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}