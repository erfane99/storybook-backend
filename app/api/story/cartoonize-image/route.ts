import { NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  console.log('✅ Entered cartoonize-image API route');

  const formData = await req.formData();
  const file = formData.get('image') as File;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 500 });
  }

  try {
    // Convert image to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload original image to Cloudinary
    const originalUpload = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    // Call OpenAI API to generate image
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: 'Create a cartoon-style character suitable for a children\'s storybook, with a whimsical and friendly appearance',
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(errorData.error?.message || 'Failed to generate image');
    }

    const data = await response.json();
    
    if (!data.data?.[0]?.url) {
      throw new Error('No image URL received from OpenAI');
    }

    // Download the generated image and upload to Cloudinary
    const generatedImageResponse = await fetch(data.data[0].url);
    const generatedImageBuffer = Buffer.from(await generatedImageResponse.arrayBuffer());
    
    const generatedUpload = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(generatedImageBuffer);
    });

    return NextResponse.json({
      original: (originalUpload as any).secure_url,
      generated: (generatedUpload as any).secure_url
    });
  } catch (error: any) {
    console.error('Error generating image:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate image',
        details: error.response?.data || error.toString()
      },
      { status: 500 }
    );
  }
}