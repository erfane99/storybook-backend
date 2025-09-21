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

    // ✅ FIX: Smart validation - warn but don't block if description is short
    const MIN_DESCRIPTION_LENGTH = 10; // Very minimal requirement for NOT NULL constraint
    const QUALITY_DESCRIPTION_LENGTH = 50; // Recommended for quality
    
    if (!characterDescription || characterDescription.trim().length === 0) {
      console.error('❌ Character description is completely missing');
      return NextResponse.json({ 
        error: 'Character description is required (database constraint)',
        details: {
          provided: false,
          length: 0,
          minimumRequired: MIN_DESCRIPTION_LENGTH
        }
      }, { status: 400 });
    }
    
    if (characterDescription.trim().length < MIN_DESCRIPTION_LENGTH) {
      console.error('❌ Character description too short:', characterDescription.length);
      return NextResponse.json({ 
        error: `Character description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
        details: {
          provided: true,
          length: characterDescription.length,
          minimumRequired: MIN_DESCRIPTION_LENGTH
        }
      }, { status: 400 });
    }
    
    // Quality warning (log but don't block)
    if (characterDescription.trim().length < QUALITY_DESCRIPTION_LENGTH) {
      console.warn(`⚠️ Character description is short (${characterDescription.length} chars). Recommended: ${QUALITY_DESCRIPTION_LENGTH}+ for best quality.`);
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

   // Step 2: Upload to Cloudinary with retry logic
      const folderPath = `storybook/cartoons/${userId}`;
      const timestamp = new Date().toISOString().replace(/[:\s.]/g, '-');
      const publicId = `${folderPath}/cartoon-${artStyle}-${timestamp}`;

      console.log('📤 Uploading to Cloudinary...');
      
      // ✅ FIX: Enhanced upload with retry logic and better error handling
      const MAX_UPLOAD_RETRIES = 3;
      const UPLOAD_TIMEOUT = 30000; // 30 seconds per attempt
      let uploadResult: any = null;
      let lastUploadError: any = null;
      
      for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
        try {
          // Add retry delay for subsequent attempts
          if (attempt > 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
            console.log(`⏳ Retry attempt ${attempt}/${MAX_UPLOAD_RETRIES} after ${delay}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Create upload promise with timeout
          const uploadPromise = new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
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
                tags: [`user-${userId}`, `style-${artStyle}`, 'cartoon', 'permanent'],
                timeout: UPLOAD_TIMEOUT,
                // ✅ NEW: Add chunk size for better reliability on slow connections
                chunk_size: 6000000, // 6MB chunks
              },
              (error, result) => {
                if (error) {
                  console.error(`❌ Cloudinary upload error (attempt ${attempt}):`, {
                    error: error.message || error,
                    http_code: error.http_code,
                    name: error.name,
                    attempt
                  });
                  reject(error);
                } else if (!result) {
                  const emptyError = new Error('Cloudinary returned empty result');
                  console.error(`❌ Cloudinary empty result (attempt ${attempt})`);
                  reject(emptyError);
                } else {
                  console.log(`✅ Cloudinary upload successful (attempt ${attempt})`);
                  resolve(result);
                }
              }
            );
            
            // ✅ NEW: Handle stream errors
            uploadStream.on('error', (streamError) => {
              console.error(`❌ Upload stream error (attempt ${attempt}):`, streamError);
              reject(streamError);
            });
            
            // Write buffer to stream
            uploadStream.end(imageBuffer);
          });
          
          // Add timeout wrapper
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Upload timeout after ${UPLOAD_TIMEOUT}ms`));
            }, UPLOAD_TIMEOUT);
          });
          
          // Race between upload and timeout
          uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
          
          // Success - break out of retry loop
          break;
          
        } catch (uploadError: any) {
          lastUploadError = uploadError;
          
          // Log detailed error information
          console.error(`❌ Upload attempt ${attempt} failed:`, {
            message: uploadError.message,
            name: uploadError.name,
            http_code: uploadError.http_code,
            attempt,
            willRetry: attempt < MAX_UPLOAD_RETRIES
          });
          
          // Check if error is retryable
          const isRetryable = 
            uploadError.message?.includes('timeout') ||
            uploadError.message?.includes('ETIMEDOUT') ||
            uploadError.message?.includes('ESOCKETTIMEDOUT') ||
            uploadError.message?.includes('ECONNRESET') ||
            uploadError.message?.includes('ENOTFOUND') ||
            uploadError.message?.includes('EAI_AGAIN') ||
            uploadError.http_code === 420 || // Rate limit
            uploadError.http_code === 500 || // Server error
            uploadError.http_code === 502 || // Bad gateway
            uploadError.http_code === 503 || // Service unavailable
            uploadError.http_code === 504;   // Gateway timeout
          
          if (!isRetryable) {
            console.error('❌ Non-retryable Cloudinary error - stopping retries');
            throw uploadError;
          }
          
          if (attempt === MAX_UPLOAD_RETRIES) {
            // Final attempt failed
            console.error('❌ All Cloudinary upload attempts failed');
            throw new Error(`Failed to upload to Cloudinary after ${MAX_UPLOAD_RETRIES} attempts: ${uploadError.message || 'Unknown error'}`);
          }
        }
      }
      
      // Validate upload result
      if (!uploadResult || !uploadResult.secure_url || !uploadResult.public_id) {
        throw new Error('Invalid Cloudinary upload result - missing required fields');
      }
      
      permanentCloudinaryUrl = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;

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