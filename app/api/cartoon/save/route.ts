import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
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

    // JWT Authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ Missing or invalid Authorization header');
      return NextResponse.json(
        { error: 'Authentication required. Please provide a valid Bearer token.' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.error('❌ Empty Bearer token');
      return NextResponse.json(
        { error: 'Authentication token is required' },
        { status: 401 }
      );
    }

    // Initialize Supabase clients
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate JWT token and get user
    const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ JWT validation failed:', authError?.message || 'Invalid token');
      return NextResponse.json(
        { error: 'Invalid or expired authentication token' },
        { status: 401 }
      );
    }

    console.log(`✅ User authenticated: ${user.id}`);

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
      characterDescription: !!characterDescription
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

    console.log(`🎨 Saving cartoon image for user ${user.id} - Style: ${artStyle}`);

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
      const folderPath = `storybook/cartoons/${user.id}`;
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
            tags: [`user-${user.id}`, `style-${artStyle}`, 'cartoon', 'permanent']
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
        user_id: user.id,
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