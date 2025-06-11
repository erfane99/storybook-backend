import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Inline prompt helpers to avoid import issues
function cleanStoryPrompt(prompt: string): string {
  return prompt
    .trim()
    .replace(/\b(adorable|cute|precious|delightful|charming|lovely|beautiful|perfect)\s/gi, '')
    .replace(/\b(gazing|peering|staring)\s+(?:curiously|intently|lovingly|sweetly)\s+at\b/gi, 'looking at')
    .replace(/\badding a touch of\s+\w+\b/gi, '')
    .replace(/\bwith a hint of\s+\w+\b/gi, '')
    .replace(/\bexuding\s+(?:innocence|wonder|joy|happiness)\b/gi, '')
    .replace(/\b(cozy|perfect for|wonderfully|overall cuteness)\s/gi, '')
    .replace(/\b(?:filled with|radiating|emanating)\s+(?:warmth|joy|happiness|wonder)\b/gi, '')
    .replace(/\b(a|an)\s+(baby|toddler|child|teen|adult)\s+(boy|girl|man|woman)\b/gi, '$2 $3')
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '');
}

// Inline style prompts
const stylePrompts = {
  'storybook': 'Use a soft, whimsical storybook style with gentle colors and clean lines.',
  'semi-realistic': 'Use a semi-realistic cartoon style with smooth shading and facial detail accuracy.',
  'comic-book': 'Use a bold comic book style with strong outlines, vivid colors, and dynamic shading.',
  'flat-illustration': 'Use a modern flat illustration style with minimal shading, clean vector lines, and vibrant flat colors.',
  'anime': 'Use anime style with expressive eyes, stylized proportions, and crisp linework inspired by Japanese animation.'
};

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

    // Removed strict validation - OpenAI now uses multiple key formats (sk-, sk-proj-, etc.)
    console.log('🔑 OpenAI API Key found, length:', openaiApiKey.length);

    const { prompt, style = 'semi-realistic', user_id } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log('🔑 OpenAI API Key configured correctly');

    // Optional cache operations - wrapped in try-catch to prevent failures
    if (user_id) {
      try {
        // Dynamically import cache utilities to avoid build-time issues
        const { getCachedImage } = await import('@/lib/supabase/cache-utils');
        const cachedUrl = await getCachedImage(prompt, style, user_id);
        if (cachedUrl) {
          console.log('✅ Found cached image');
          return NextResponse.json({ url: cachedUrl, cached: true });
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache lookup failed, continuing with generation:', cacheError);
      }
    }

    const cleanPrompt = cleanStoryPrompt(prompt);
    const stylePrompt = stylePrompts[style as keyof typeof stylePrompts] || stylePrompts['semi-realistic'];
    const finalPrompt = `Create a cartoon-style portrait of the person described below. Focus on accurate facial features and clothing details. ${cleanPrompt}. ${stylePrompt}`;

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

    const generatedUrl = data.data[0].url;
    console.log('✅ Successfully generated image');

    // Optional cache save - wrapped in try-catch to prevent failures
    if (user_id) {
      try {
        const { saveToCache } = await import('@/lib/supabase/cache-utils');
        await saveToCache(prompt, generatedUrl, style, user_id);
      } catch (cacheError) {
        console.warn('⚠️ Failed to save to cache (non-critical):', cacheError);
      }
    }

    return NextResponse.json({ url: generatedUrl, cached: false });
  } catch (error: any) {
    console.error('❌ Cartoonize API Error:', {
      message: error.message,
      stack: error.stack,
      details: error.response?.data || error.toString()
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to cartoonize image',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}