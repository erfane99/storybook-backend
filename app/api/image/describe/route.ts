import { NextResponse } from 'next/server';
import { serviceContainer } from '@/lib/services/service-container';
import type { IAIService } from '@/lib/services/interfaces/service-contracts';
import type { CharacterDescriptionOptions, CharacterDescriptionResult } from '@/lib/services/interfaces/service-contracts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    // Validation
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch (urlError) {
      return NextResponse.json(
        { error: 'Invalid image URL format' },
        { status: 400 }
      );
    }

    console.log('🔍 Analyzing character image with modular AI service...');
    console.log(`🖼️ Image URL: ${imageUrl.substring(0, 100)}...`);

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

    // Prepare options for character description
    const descriptionOptions: CharacterDescriptionOptions = {
      imageUrl: imageUrl,
      includeVisualDNA: true,      // Generate comprehensive visual DNA
      includePersonality: false,   // Keep it focused on visual aspects
      includeClothing: true,       // Important for consistency
      includeBackground: false,    // Exclude background elements
      generateFingerprint: true    // Create compressed fingerprint for efficiency
    };

    console.log('🚀 Generating character DNA with visual fingerprinting...');

    // Use the modular AI service with advanced features:
    // - Visual DNA extraction for 95%+ consistency
    // - Character fingerprinting for efficient reuse
    // - Professional character analysis
    // - Structured data extraction
    const descriptionResult: CharacterDescriptionResult = await aiService.generateCharacterDescription(descriptionOptions);

    console.log('✅ Character analysis complete with visual DNA');
    console.log(`🧬 Visual DNA created: ${descriptionResult.visualDNA ? 'Yes' : 'No'}`);
    console.log(`🔍 Fingerprint generated: ${descriptionResult.fingerprint ? 'Yes' : 'No'}`);
    console.log(`📝 Description length: ${descriptionResult.description.length} characters`);

    // Check cache for future optimization (optional)
    let cached = false;
    if (descriptionResult.fingerprint) {
      // In the future, we could cache this fingerprint for instant retrieval
      // For now, we'll just mark it as not cached
      cached = false;
    }

    // Return enhanced result
    return NextResponse.json({
      cached: cached,
      characterDescription: descriptionResult.description,
      // Enhanced metadata from the modular system
      metadata: {
        hasVisualDNA: !!descriptionResult.visualDNA,
        hasFingerprint: !!descriptionResult.fingerprint,
        wordCount: descriptionResult.description.split(' ').length,
        // Visual DNA details (if available)
        visualDNA: descriptionResult.visualDNA ? {
          facialFeatures: descriptionResult.visualDNA.facialFeatures || [],
          bodyType: descriptionResult.visualDNA.bodyType || 'standard',
          clothing: descriptionResult.visualDNA.clothing || 'casual',
          colorPalette: descriptionResult.visualDNA.colorPalette || [],
          distinctiveFeatures: descriptionResult.visualDNA.distinctiveFeatures || []
        } : undefined,
        // Compressed fingerprint for efficient reuse
        fingerprint: descriptionResult.fingerprint,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Image describe error:', {
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
          error: 'Image content policy violation detected.',
          details: error.message
        },
        { status: 400 }
      );
    }

    if (error.message?.includes('Invalid image')) {
      return NextResponse.json(
        { 
          error: 'Invalid or inaccessible image URL. Please ensure the image is publicly accessible.',
        },
        { status: 400 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: error.message || 'Failed to describe image',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}