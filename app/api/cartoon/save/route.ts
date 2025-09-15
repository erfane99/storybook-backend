import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';
import cloudinary from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for image processing

// ✅ Keep frontend interface clean
interface SaveCartoonRequest {
  originalImageUrl: string;
  cartoonImageUrl: string;
  artStyle: string;
  characterDescription?: string;
  originalPrompt?: string;
  generationCount?: number;
  metadata?: {
    processingTime?: number;
    modelVersion?: string;
    quality?: 'standard' | 'high' | 'premium';
    tags?: string[];
  };
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

    // ✅ JWT Authentication - Use standardized auth utility
    const authResult = await validateAuthToken(request);
    const { userId, error: authError } = extractUserId(authResult);

    if (authError || !userId) {
      console.error('❌ JWT validation failed:', authError);
      return NextResponse.json(
        createAuthErrorResponse(authError || 'Authentication required'),
        { status: 401 }
      );
    }

    console.log(`✅ User authenticated: ${userId}`);

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request with clean frontend interface
    const {
      originalImageUrl,
      cartoonImageUrl,
      artStyle,
      characterDescription,
      originalPrompt,
      generationCount = 1,
      metadata
    }: SaveCartoonRequest = await request.json();

    console.log('📥 Received save request:', {
      originalImageUrl: !!originalImageUrl,
      cartoonImageUrl: !!cartoonImageUrl,
      artStyle,
      characterDescription: !!characterDescription,
      descriptionLength: characterDescription?.length || 0
    });

    // Input validation
    if (!originalImageUrl?.trim()) {
      console.error('❌ Missing originalImageUrl');
      return NextResponse.json({ error: 'Original image URL is required' }, { status: 400 });
    }

    if (!cartoonImageUrl?.trim()) {
      console.error('❌ Missing cartoonImageUrl');
      return NextResponse.json({ error: 'Cartoon image URL is required' }, { status: 400 });
    }

    if (!artStyle?.trim()) {
      console.error('❌ Missing artStyle');
      return NextResponse.json({ error: 'Art style is required' }, { status: 400 });
    }

    // ✅ FIX: Add character description validation for quality
    if (!characterDescription || characterDescription.trim().length < 20) {
      console.error('❌ Character description missing or too short:', characterDescription?.length || 0);
      return NextResponse.json({ 
        error: 'Character description is required and must be at least 20 characters for quality storybooks',
        details: {
          provided: !!characterDescription,
          length: characterDescription?.length || 0,
          minimumRequired: 20
        }
      }, { status: 400 });
    }

    // Validate art style
    const validStyles = ['storybook', 'semi-realistic', 'comic-book', 'flat-illustration', 'anime'];
    if (!validStyles.includes(artStyle)) {
      return NextResponse.json({ 
        error: `Invalid art style. Must be one of: ${validStyles.join(', ')}` 
      }, { status: 400 });
    }

    // Validate URLs
    try {
      new URL(originalImageUrl);
      new URL(cartoonImageUrl);
    } catch (urlError) {
      return NextResponse.json({ error: 'Invalid URL format provided' }, { status: 400 });
    }

    console.log(`🎨 Saving cartoon image for user ${userId} - Style: ${artStyle}`);

    let permanentCloudinaryUrl: string | null = null;
    let cloudinaryPublicId: string | null = null;

    try {
      // Step 1: Download temporary image
      console.log('📥 Downloading temporary cartoon image...');
      const imageResponse = await fetch(cartoonImageUrl, {
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

      // Step 2: Upload to Cloudinary
      const folderPath = `storybook/cartoons/${userId}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const publicId = `${folderPath}/cartoon-${artStyle}-${timestamp}`;

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
            tags: [`user-${userId}`, `style-${artStyle}`, 'cartoon', 'permanent']
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

      // ✅ CRITICAL FIX: Map frontend fields to actual database column names
      const dbInsertData = {
        user_id: userId,
        // Map frontend fields to database schema
        original_cloudinary_url: originalImageUrl,           // frontend: originalImageUrl
        cartoonized_cloudinary_url: permanentCloudinaryUrl, // frontend: cartoonImageUrl (permanent)
        cartoon_style: artStyle,                             // frontend: artStyle
        cartoonized_cloudinary_public_id: cloudinaryPublicId,
        character_description: characterDescription || '',   // NOT NULL constraint
        original_prompt: originalPrompt || null,
        generation_count: generationCount,
        // created_at and updated_at are auto-generated
      };

      console.log('💾 Mapping fields for database insert:', {
        frontend_originalImageUrl: 'original_cloudinary_url',
        frontend_artStyle: 'cartoon_style',
        frontend_characterDescription: 'character_description'
      });

      const { data: savedCartoon, error: dbError } = await adminSupabase
        .from('cartoon_images')
        .insert(dbInsertData)
        .select('id, created_at')
        .single();

      if (dbError) {
        console.error('❌ Database save error:', dbError);
        
        // Rollback Cloudinary upload
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

      // Return clean response matching frontend expectations
      return NextResponse.json({
        id: savedCartoon.id,
        success: true,
        message: 'Cartoon image saved permanently',
        savedAt: savedCartoon.created_at,
        permanentUrl: permanentCloudinaryUrl,
        cloudinaryPublicId,
        style: artStyle, // Return frontend field name
      });

    } catch (processingError: any) {
      console.error('❌ Image processing error:', processingError);
      
      // Cleanup if needed
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