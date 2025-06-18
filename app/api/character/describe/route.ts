import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute for AI processing

interface DescribeCharacterRequest {
  imageUrl: string;
  analysisType?: 'basic' | 'detailed' | 'story-focused';
  includePersonality?: boolean;
  includeClothing?: boolean;
  includeBackground?: boolean;
}

export async function POST(request: Request) {
  try {
    // Comprehensive environment variable validation
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
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

    console.log('🔑 OpenAI API Key found, length:', openaiApiKey.length);

    // Parse and validate input data
    const {
      imageUrl,
      analysisType = 'detailed',
      includePersonality = true,
      includeClothing = true,
      includeBackground = false
    }: DescribeCharacterRequest = await request.json();

    // Input validation
    if (!imageUrl?.trim()) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch (urlError) {
      return NextResponse.json({ error: 'Invalid image URL format' }, { status: 400 });
    }

    // Validate analysis type
    const validAnalysisTypes = ['basic', 'detailed', 'story-focused'];
    if (!validAnalysisTypes.includes(analysisType)) {
      return NextResponse.json({ 
        error: `Invalid analysis type. Must be one of: ${validAnalysisTypes.join(', ')}` 
      }, { status: 400 });
    }

    console.log(`🔍 Analyzing character image - Type: ${analysisType}, URL: ${imageUrl.substring(0, 50)}...`);

    // Build analysis prompt based on type and options
    const getAnalysisPrompt = (type: string) => {
      const basePrompt = `You are a professional character artist and storyteller. Analyze this image and provide a comprehensive character description suitable for consistent story illustration.`;
      
      const analysisInstructions = {
        basic: `Provide a concise character description focusing on:
- Physical appearance (age, gender, hair, eyes, skin tone)
- Basic clothing and accessories
- Overall style and mood
Keep the description under 100 words and focus on visual elements only.`,
        
        detailed: `Provide a detailed character description including:
- Physical characteristics (age, gender, hair color/style, eye color, skin tone, build)
- Facial features and expressions
- Clothing style, colors, and accessories
- Artistic style and visual mood
${includePersonality ? '- Personality traits suggested by appearance and expression' : ''}
${includeBackground ? '- Background elements and setting context' : ''}
Aim for 150-250 words with rich visual details for consistent illustration.`,
        
        'story-focused': `Create a story-ready character description optimized for narrative consistency:
- Complete physical profile for illustration reference
- Character archetype and role suggestions
- Emotional range and expression capabilities
- Clothing variations and style adaptability
- Personality traits and story potential
${includeBackground ? '- Environmental context and world-building elements' : ''}
Provide 200-300 words focusing on storytelling applications.`
      };

      const focusAreas = [];
      if (!includeClothing) focusAreas.push('Minimize clothing details unless essential to character identity');
      if (!includePersonality) focusAreas.push('Focus only on visual appearance, not personality traits');
      if (!includeBackground) focusAreas.push('Ignore background elements and focus solely on the character');

      return `${basePrompt}

${analysisInstructions[type as keyof typeof analysisInstructions]}

${focusAreas.length > 0 ? `Additional guidelines:\n${focusAreas.map(f => `- ${f}`).join('\n')}` : ''}

CRITICAL: Only describe what you can clearly observe. Avoid assumptions or creative interpretations. Focus on factual visual elements that would help an artist recreate this character consistently across multiple illustrations.`;
    };

    try {
      // Make request to OpenAI Vision API
      console.log('🤖 Making request to OpenAI Vision API...');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: getAnalysisPrompt(analysisType)
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this character image and provide a ${analysisType} description following the guidelines.`
                },
                {
                  type: 'image_url',
                  image_url: { 
                    url: imageUrl,
                    detail: analysisType === 'basic' ? 'low' : 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: analysisType === 'basic' ? 200 : analysisType === 'detailed' ? 400 : 500,
          temperature: 0.3 // Lower temperature for more consistent, factual descriptions
        }),
      });

      console.log('📥 OpenAI response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        
        try {
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          console.error('❌ Failed to parse OpenAI error response:', errorText);
          throw new Error(`OpenAI API request failed with status ${response.status}: ${errorText}`);
        }

        console.error('❌ OpenAI API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });

        const errorMessage = errorData?.error?.message || `OpenAI API request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (!data?.choices?.[0]?.message?.content) {
        console.error('❌ Invalid OpenAI response structure:', data);
        throw new Error('Invalid response from OpenAI API - no content received');
      }

      const characterDescription = data.choices[0].message.content;
      
      // Extract key characteristics for structured response
      const wordCount = characterDescription.split(' ').length;
      const hasPersonalityTraits = includePersonality && characterDescription.toLowerCase().includes('personality');
      const hasClothingDetails = includeClothing && (characterDescription.toLowerCase().includes('clothing') || characterDescription.toLowerCase().includes('wearing'));

      console.log(`✅ Character analysis completed - Type: ${analysisType}, Words: ${wordCount}`);

      return NextResponse.json({
        success: true,
        characterDescription,
        analysisMetadata: {
          analysisType,
          wordCount,
          includePersonality,
          includeClothing,
          includeBackground,
          hasPersonalityTraits,
          hasClothingDetails,
          imageUrl: imageUrl.substring(0, 100) + '...', // Truncated for privacy
          processedAt: new Date().toISOString()
        },
        usage: {
          model: 'gpt-4o',
          analysisLevel: analysisType,
          estimatedTokens: Math.ceil(wordCount * 1.3) // Rough estimate
        }
      });

    } catch (aiError: any) {
      console.error('❌ AI processing error:', aiError);
      return NextResponse.json(
        { 
          error: 'Failed to analyze character image',
          details: aiError.message || 'AI analysis failed',
          analysisType
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Character describe API error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to describe character',
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