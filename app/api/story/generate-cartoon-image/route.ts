import { NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

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

    // Removed strict format validation - OpenAI now uses multiple key formats (sk-, sk-proj-, etc.)
    console.log('🔑 OpenAI API Key found, length:', openaiApiKey.length);

    const {
      image_prompt,
      character_description,
      emotion,
      audience,
      isReusedImage,
      cartoon_image,
      user_id,
      style = 'storybook',
    } = await request.json();

    if (!image_prompt || !character_description || !emotion) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const useMock = process.env.USE_MOCK === 'true';

    // Optional cache operations - completely isolated to prevent failures
    if (user_id && cartoon_image && !useMock) {
      try {
        const { getCachedCartoonImage } = await import('@/lib/supabase/cache-utils');
        const cachedUrl = await getCachedCartoonImage(cartoon_image, style, user_id);
        if (cachedUrl) {
          console.log('✅ Found cached cartoon image');
          return NextResponse.json({ url: cachedUrl, reused: true });
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
      });
    }

    console.log('🔑 OpenAI API Key configured correctly');

    // Inline audience styles to avoid import issues
    const audienceStyles = {
      children: 'Create a bright, clear illustration with simple shapes and warm colors. Focus on readability and emotional expression.',
      young_adults: 'Use dynamic composition with strong lines and detailed environments. Balance realism with stylized elements.',
      adults: 'Employ sophisticated lighting, detailed textures, and nuanced emotional expression. Maintain artistic maturity.',
    };

    const finalPrompt = [
      `Scene: ${image_prompt}`,
      `Emotional state: ${emotion}`,
      isReusedImage ? 'Include the same cartoon character as previously described below.' : '',
      `Character description: ${character_description}`,
      audienceStyles[audience as keyof typeof audienceStyles] || audienceStyles.children,
    ].filter(Boolean).join('\n\n');

    console.log('🎨 Making request to OpenAI DALL-E API...');

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: finalPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
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
    
    if (!data?.data?.[0]?.url) {
      console.error('❌ Invalid OpenAI response structure:', data);
      throw new Error('Invalid response from OpenAI API - no image URL received');
    }

    const imageUrl = data.data[0].url;
    console.log('✅ Successfully generated cartoon image');

    // Optional cache save - completely isolated to prevent failures
    if (user_id && cartoon_image && !useMock) {
      try {
        const { saveCartoonImageToCache } = await import('@/lib/supabase/cache-utils');
        await saveCartoonImageToCache(cartoon_image, imageUrl, style, user_id);
      } catch (cacheError) {
        console.warn('⚠️ Failed to save to cache (non-critical):', cacheError);
      }
    }

    return NextResponse.json({
      url: imageUrl,
      prompt_used: finalPrompt,
      reused: false,
    });
  } catch (error: any) {
    console.error('❌ Generate Cartoon Image API Error:', {
      message: error.message,
      stack: error.stack,
      details: error.response?.data || error.toString()
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate image',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}