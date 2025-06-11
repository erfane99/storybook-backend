import { NextResponse } from 'next/server';

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

    const { story, characterImage, audience = 'children' } = await request.json();

    if (!story || story.trim().length < 50) {
      return NextResponse.json({ error: 'Story must be at least 50 characters long.' }, { status: 400 });
    }

    console.log('🔑 OpenAI API Key configured correctly');

    // Inline audience configuration to avoid import issues
    const audienceConfig = {
      children: { scenes: 10, pages: 4, notes: 'Simple, playful structure. 2–3 scenes per page.' },
      young_adults: { scenes: 14, pages: 6, notes: '2–3 scenes per page with meaningful plot turns.' },
      adults: { scenes: 18, pages: 8, notes: '3–5 scenes per page, allow complexity and layered meaning.' }
    };

    const { scenes, pages, notes } = audienceConfig[audience as keyof typeof audienceConfig] || audienceConfig.children;

    let characterDesc = 'a young protagonist';
    if (characterImage) {
      try {
        characterDesc = await describeCharacter(characterImage, openaiApiKey);
        console.log('✅ Generated character description:', characterDesc);
      } catch (error: any) {
        console.warn('⚠️ Failed to describe character, using default:', error.message);
        // Continue with default description instead of failing
      }
    }

    const systemPrompt = `
You are a professional comic book scene planner for a cartoon storybook app.

Audience: ${audience.toUpperCase()}
Target: ${scenes} scenes, grouped across ${pages} comic-style pages.

Each scene should reflect a strong visual moment or emotional beat from the story. Avoid filler.

Scene requirements:
- description: A short action summary for this scene
- emotion: Main character's emotional state
- imagePrompt: A rich, vivid DALL·E visual description (exclude character description; focus on environment, action, lighting, emotion)

Visual pacing notes:
${notes}

Return your output in this strict format:
{
  "pages": [
    {
      "pageNumber": 1,
      "scenes": [
        {
          "description": "...",
          "emotion": "...",
          "imagePrompt": "..."
        }
      ]
    }
  ]
}
`;

    console.log('📝 Making request to OpenAI GPT-4o API...');

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.85,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: story }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    console.log('📥 OpenAI response status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      let errorData;
      
      try {
        errorData = JSON.parse(errorText);
      } catch (parseError) {
        console.error('❌ Failed to parse OpenAI error response:', errorText);
        throw new Error(`OpenAI API request failed with status ${openaiResponse.status}: ${errorText}`);
      }

      console.error('❌ OpenAI API Error:', {
        status: openaiResponse.status,
        statusText: openaiResponse.statusText,
        error: errorData
      });

      const errorMessage = errorData?.error?.message || `OpenAI API request failed with status ${openaiResponse.status}`;
      return NextResponse.json({ error: errorMessage }, { status: openaiResponse.status });
    }

    const rawData = await openaiResponse.json();

    if (!rawData?.choices?.[0]?.message?.content) {
      console.error('❌ Invalid OpenAI response structure:', rawData);
      return NextResponse.json({ error: 'Invalid response from OpenAI API - no content received' }, { status: 500 });
    }

    const result = rawData.choices[0].message.content;
    
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (parseError) {
      console.error('❌ Failed to parse OpenAI JSON response:', result);
      return NextResponse.json({ error: 'Invalid JSON response from OpenAI' }, { status: 500 });
    }

    // Inject character image for visual consistency
    const updatedPages = parsed.pages.map((page: any) => ({
      ...page,
      scenes: page.scenes.map((scene: any) => ({
        ...scene,
        generatedImage: characterImage // used as fallback placeholder until image gen runs
      }))
    }));

    console.log('✅ Successfully generated scenes');

    return NextResponse.json({
      pages: updatedPages,
      audience,
      characterImage
    });
  } catch (err: any) {
    console.error('❌ Scene generation failed:', {
      message: err.message,
      stack: err.stack,
      details: err.response?.data || err.toString()
    });

    return NextResponse.json({ 
      error: err?.message || 'Unexpected error',
      details: process.env.NODE_ENV === 'development' ? err.toString() : undefined
    }, { status: 500 });
  }
}

// Helper function to describe character image
async function describeCharacter(imageUrl: string, openaiApiKey: string): Promise<string> {
  console.log('🔍 Making request to OpenAI Vision API for character description...');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
          content: 'You are a cartoon illustrator assistant. Your job is to analyze a character image and provide a short, repeatable cartoon description (face, hair, clothing, etc.). Exclude background or action.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this cartoon character' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
    }),
  });

  console.log('📥 Character description response status:', res.status);

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ Failed to describe character:', errorText);
    throw new Error('Failed to describe character image');
  }

  const data = await res.json();

  if (!data?.choices?.[0]?.message?.content) {
    console.error('❌ Invalid character description response:', data);
    throw new Error('Invalid response from character description API');
  }

  console.log('✅ Successfully described character');
  return data.choices[0].message.content;
}