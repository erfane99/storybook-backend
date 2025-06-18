import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface RequestBody {
  genre: string;
  characterDescription: string;
  cartoonImageUrl: string;
  audience?: 'children' | 'young_adults' | 'adults';
  user_id?: string;
}

export async function POST(req: Request) {
  try {
    // Comprehensive environment variable validation
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
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

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({ 
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

    const { genre, characterDescription, cartoonImageUrl, audience = 'children', user_id } = await req.json() as RequestBody;

    if (!genre || !characterDescription || !cartoonImageUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Inline genre prompts to avoid import issues
    const genrePrompts = {
      adventure: 'Create an exciting adventure story filled with discovery, challenges to overcome, and personal growth.',
      siblings: 'Write a heartwarming story about the joys and challenges of sibling relationships, focusing on sharing, understanding, and family bonds.',
      bedtime: 'Create a gentle, soothing bedtime story with calming imagery and a peaceful resolution that helps children transition to sleep.',
      fantasy: 'Craft a magical tale filled with wonder, enchantment, and imaginative elements that spark creativity.',
      history: 'Tell an engaging historical story that brings the past to life while weaving in educational elements naturally.',
    };

    if (!genrePrompts[genre as keyof typeof genrePrompts]) {
      return NextResponse.json(
        { error: 'Invalid genre' },
        { status: 400 }
      );
    }

    console.log('🔑 OpenAI API Key configured correctly');

    // Inline audience configuration
    const audienceConfig = {
      children: {
        prompt: `
          Story Requirements:
          - Use simple, clear language suitable for young readers
          - Keep sentences short and direct
          - Include repetitive elements and patterns
          - Focus on positive themes and clear morals
          - Create opportunities for interactive engagement
          - Maintain a gentle pace with 5-8 distinct scenes
          - Use familiar concepts and relatable situations
          - Include moments of humor and playfulness
          - Ensure emotional safety throughout the story
          
          Language Guidelines:
          - Vocabulary: Simple, everyday words with occasional new terms explained through context
          - Sentence Structure: Short, clear sentences with basic patterns
          - Dialogue: Natural, age-appropriate conversations
          - Descriptions: Vivid but straightforward, focusing on primary colors and basic emotions
          
          Emotional Elements:
          - Clear emotional expressions
          - Simple conflict resolution
          - Emphasis on friendship, family, and kindness
          - Positive reinforcement of good behavior
          - Gentle handling of challenging situations`,
        wordCount: '300-400',
        scenes: '5-8'
      },
      young_adults: {
        prompt: `
          Story Requirements:
          - Develop more complex character arcs and relationships
          - Include meaningful personal growth and self-discovery
          - Address relevant social and emotional themes
          - Create engaging dialogue with distinct character voices
          - Build tension and resolution across 8-12 scenes
          - Incorporate subtle humor and wit
          - Balance entertainment with deeper messages
          
          Language Guidelines:
          - Vocabulary: Rich and varied, including metaphors and imagery
          - Sentence Structure: Mix of simple and complex sentences
          - Dialogue: Natural conversations that reveal character
          - Descriptions: Detailed and evocative, painting clear mental pictures
          
          Emotional Elements:
          - Complex emotional situations
          - Realistic internal conflicts
          - Exploration of relationships and identity
          - Nuanced character development
          - Meaningful resolution that allows for reflection`,
        wordCount: '600-800',
        scenes: '8-12'
      },
      adults: {
        prompt: `
          Story Requirements:
          - Craft sophisticated narrative structures
          - Develop layered character relationships
          - Explore complex themes and moral ambiguity
          - Create subtle, nuanced dialogue
          - Build a rich narrative across 10-15 scenes
          - Include symbolic and metaphorical elements
          - Address mature themes thoughtfully
          
          Language Guidelines:
          - Vocabulary: Sophisticated and precise
          - Sentence Structure: Complex and varied
          - Dialogue: Subtle, revealing subtext and character depth
          - Descriptions: Rich, atmospheric, with careful attention to detail
          
          Emotional Elements:
          - Deep psychological insights
          - Complex moral choices
          - Sophisticated relationship dynamics
          - Nuanced emotional resolution
          - Room for interpretation and reflection`,
        wordCount: '800-1200',
        scenes: '10-15'
      }
    };

    const config = audienceConfig[audience as keyof typeof audienceConfig];

    const storyPrompt = `You are a professional story writer crafting a high-quality, imaginative, and emotionally engaging story in the ${genre} genre.
This story is for a ${audience} audience and will be turned into a cartoon storybook with illustrations.

The main character is described as follows:
"${characterDescription}"

✨ Story Guidelines:
- Use descriptive language that matches the visual traits of the character
- Keep the character's appearance, personality, and role consistent throughout
- Include rich sensory details that can be illustrated
- Create ${config.scenes} distinct visual scenes that flow naturally
- Build emotional connection through character reactions and feelings
- Maintain a clear story arc: setup, challenge/conflict, resolution
- Target word count: ${config.wordCount} words

Genre-specific guidance:
${genrePrompts[genre as keyof typeof genrePrompts]}

Audience-specific requirements:
${config.prompt}

✍️ Write a cohesive story that brings this character to life in an engaging way. Focus on creating vivid scenes that will translate well to illustrations.`;

    console.log('📝 Making request to OpenAI GPT-4 API...');

    // Generate the story using GPT-4
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: storyPrompt
          },
          {
            role: 'user',
            content: 'Generate a story following the provided guidelines.'
          }
        ],
        temperature: 0.8,
        max_tokens: 2000,
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

    const generatedStory = data.choices[0].message.content;
    console.log('✅ Successfully generated story');

    console.log('🌐 Processing story scenes...');

    // Generate scenes using the existing endpoint
    const scenesResponse = await fetch('/api/story/generate-scenes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        story: generatedStory,
        characterImage: cartoonImageUrl,
        audience,
      }),
    });

    if (!scenesResponse.ok) {
      const errorText = await scenesResponse.text();
      console.error('❌ Failed to generate scenes:', errorText);
      throw new Error('Failed to generate scenes');
    }

    const { pages } = await scenesResponse.json();

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: storybook, error: supabaseError } = await adminSupabase
      .from('storybook_entries')
      .insert({
        title: `${genre.charAt(0).toUpperCase() + genre.slice(1)} Story`,
        story: generatedStory,
        pages,
        user_id,
        audience,
        character_description: characterDescription,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('Failed to save storybook:', supabaseError);
      throw new Error('Failed to save storybook');
    }

    console.log('✅ Successfully saved storybook');

    return NextResponse.json({
      storybookId: storybook.id
    });
  } catch (error: any) {
    console.error('❌ Generate Auto Story API Error:', {
      message: error.message,
      stack: error.stack,
      details: error.response?.data || error.toString()
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate story',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}