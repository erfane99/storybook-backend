import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import cloudinary from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for image processing

interface SaveCartoonRequest {
  originalCloudinaryUrl: string;
  temporaryCartoonUrl: string;
  cartoonStyle: string;
  characterDescription?: string;
  originalPrompt?: string;
  generationCount?: number;
}

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

    // Validate Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('❌ Missing Cloudinary environment variables');
      return NextResponse.json(
        { error: 'Image storage service not configured. Please check server configuration.' },
        { status: 500 }
      );
    }

    // Initialize dual Supabase clients
    const cookieStore = cookies();
    const authSupabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication required to save cartoon images' },
        { status: 401 }
      );
    }

    // Parse and validate input data
    const {
      originalCloudinaryUrl,
      temporaryCartoonUrl,
      cartoonStyle,
      characterDescription,
      originalPrompt,
      generationCount = 1
    }: SaveCartoonRequest = await request.json();

    // Input validation
    if (!originalCloudinaryUrl?.trim()) {
      return NextResponse.json({ error: 'Original Cloudinary URL is required' }, { status: 400 });
    }

    if (!temporaryCartoonUrl?.trim()) {
      return NextResponse.json({ error: 'Temporary cartoon URL is required' }, { status: 400 });
    }

    if (!cartoonStyle?.trim()) {
      return NextResponse.json({ error: 'Cartoon style is required' }, { status: 400 });
    }

    // Validate cartoon style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(cartoonStyle)) {
      return NextResponse.json({ 
        error: `Invalid cartoon style. Must be one of: ${validStyles.join(', ')}` 
      }, { status: 400 });
    }

    // Validate URLs
    try {
      new URL(originalCloudinaryUrl);
      new URL(temporaryCartoonUrl);
    } catch (urlError) {
      return NextResponse.json({ error: 'Invalid URL format provided' }, { status: 400 });
    }

    console.log(`🎨 Saving cartoon image for user ${user.id} - Style: ${cartoonStyle}`);

    let permanentCloudinaryUrl: string | null = null;
    let cloudinaryPublicId: string | null = null;

    try {
      // Step 1: Download temporary image from OpenAI URL
      console.log('📥 Downloading temporary cartoon image...');
      const imageResponse = await fetch(temporaryCartoonUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Storybook-Backend/1.0'
        }
      });

      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      if (imageBuffer.length === 0) {
        throw new Error('Downloaded image is empty');
      }

      console.log(`✅ Downloaded image: ${imageBuffer.length} bytes`);

      // Step 2: Upload to Cloudinary in organized folder structure
      const folderPath = `storybook/cartoons/${user.id}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const publicId = `${folderPath}/cartoon-${cartoonStyle}-${timestamp}`;

      console.log('📤 Uploading to Cloudinary...');
      
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            public_id: publicId,
            folder: folderPath,
            overwrite: false,
            quality: 'auto:good',
            format: 'jpg',
            transformation: [
              { quality: 'auto:good' },
              { fetch_format: 'auto' }
            ],
            tags: [`user-${user.id}`, `style-${cartoonStyle}`, 'cartoon', 'permanent']
          },
          (error, result) => {
            if (error) {
              console.error('❌ Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(imageBuffer);
      });

      permanentCloudinaryUrl = (uploadResult as any).secure_url;
      cloudinaryPublicId = (uploadResult as any).public_id;

      console.log(`✅ Uploaded to Cloudinary: ${permanentCloudinaryUrl}`);

      // Step 3: Save to database using admin client (bypasses RLS)
      const { data: savedCartoon, error: dbError } = await adminSupabase
        .from('cartoon_images')
        .insert({
          user_id: user.id,
          original_url: originalCloudinaryUrl,
          generated_url: permanentCloudinaryUrl,
          style: cartoonStyle,
          character_description: characterDescription || null,
          original_prompt: originalPrompt || null,
          generation_count: generationCount,
          cloudinary_public_id: cloudinaryPublicId,
          created_at: new Date().toISOString()
        })
        .select('id, created_at')
        .single();

      if (dbError) {
        console.error('❌ Database save error:', dbError);
        
        // Rollback: Delete from Cloudinary if database save fails
        if (cloudinaryPublicId) {
          try {
            console.log('🔄 Rolling back Cloudinary upload...');
            await cloudinary.uploader.destroy(cloudinaryPublicId);
            console.log('✅ Cloudinary rollback successful');
          } catch (rollbackError) {
            console.error('❌ Cloudinary rollback failed:', rollbackError);
          }
        }
        
        throw new Error(`Database save failed: ${dbError.message}`);
      }

      console.log(`✅ Cartoon image saved successfully - ID: ${savedCartoon.id}`);

      return NextResponse.json({
        success: true,
        id: savedCartoon.id,
        permanentUrl: permanentCloudinaryUrl,
        cloudinaryPublicId,
        style: cartoonStyle,
        createdAt: savedCartoon.created_at,
        message: 'Cartoon image saved permanently'
      });

    } catch (processingError: any) {
      console.error('❌ Image processing error:', processingError);
      
      // Additional cleanup if needed
      if (permanentCloudinaryUrl && cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(cloudinaryPublicId);
        } catch (cleanupError) {
          console.error('❌ Cleanup error:', cleanupError);
        }
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to process and save cartoon image',
          details: processingError.message || 'Image processing failed'
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Save cartoon API error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to save cartoon image',
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