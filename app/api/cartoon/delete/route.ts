import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';
import cloudinary from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

// ===== CLOUDINARY CLEANUP UTILITIES =====

/**
 * Extract Cloudinary public ID from a URL
 * URL format: https://res.cloudinary.com/{cloud}/image/upload/{transformations}/v{version}/{public_id}.{format}
 */
function extractPublicIdFromUrl(url: string): string | null {
  if (!url || !url.includes('cloudinary.com')) {
    return null;
  }

  try {
    const cleanUrl = url.split('?')[0];
    const uploadIndex = cleanUrl.indexOf('/upload/');
    if (uploadIndex === -1) return null;

    let pathAfterUpload = cleanUrl.substring(uploadIndex + 8);

    // Remove transformations and version segments
    let previousPath = '';
    while (pathAfterUpload !== previousPath) {
      previousPath = pathAfterUpload;
      
      // Remove comma-separated transformations
      const commaMatch = pathAfterUpload.match(/^[^/]*,[^/]*\//);
      if (commaMatch) {
        pathAfterUpload = pathAfterUpload.substring(commaMatch[0].length);
        continue;
      }

      // Remove version segment
      const versionMatch = pathAfterUpload.match(/^v\d+\//);
      if (versionMatch) {
        pathAfterUpload = pathAfterUpload.substring(versionMatch[0].length);
        continue;
      }

      // Remove single transformation
      const singleMatch = pathAfterUpload.match(/^[a-z]_[^/]+\//);
      if (singleMatch) {
        pathAfterUpload = pathAfterUpload.substring(singleMatch[0].length);
        continue;
      }
    }

    // Remove file extension
    const lastDotIndex = pathAfterUpload.lastIndexOf('.');
    if (lastDotIndex > 0) {
      pathAfterUpload = pathAfterUpload.substring(0, lastDotIndex);
    }

    return pathAfterUpload || null;
  } catch {
    return null;
  }
}

/**
 * Delete a single image from Cloudinary (fire-and-forget)
 */
async function deleteCloudinaryImage(publicId: string): Promise<boolean> {
  try {
    console.log(`🗑️ Deleting Cloudinary image: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId, {
      type: 'upload',
      resource_type: 'image',
    });
    const success = result.result === 'ok' || result.result === 'not found';
    console.log(`${success ? '✅' : '❌'} Cloudinary delete result for ${publicId}: ${result.result}`);
    return success;
  } catch (error: any) {
    console.warn(`⚠️ Cloudinary deletion error for ${publicId}:`, error.message);
    return false;
  }
}

// ===== MAIN DELETE HANDLER =====

export async function DELETE(request: Request) {
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

    // Get cartoon ID from URL params
    const cartoonId = new URL(request.url).searchParams.get('id');
    if (!cartoonId) {
      return NextResponse.json(
        { error: 'Missing cartoon ID' },
        { status: 400 }
      );
    }

    console.log(`✅ User authenticated for cartoon deletion: ${userId}, cartoon: ${cartoonId}`);

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== STEP 1: Fetch cartoon to get image URLs and verify ownership BEFORE deletion =====
    const { data: cartoon, error: fetchError } = await adminSupabase
      .from('cartoon_images')
      .select('id, user_id, original_cloudinary_url, cartoonized_cloudinary_url, cartoonized_cloudinary_public_id')
      .eq('id', cartoonId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !cartoon) {
      console.error('❌ Cartoon not found or access denied:', fetchError);
      return NextResponse.json(
        { error: 'Cartoon not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    // ===== STEP 2: Extract Cloudinary public IDs =====
    const publicIdsToDelete: string[] = [];

    // Add cartoonized image public ID (stored directly in database)
    if (cartoon.cartoonized_cloudinary_public_id) {
      publicIdsToDelete.push(cartoon.cartoonized_cloudinary_public_id);
    }

    // Extract original image public ID if it's on Cloudinary
    if (cartoon.original_cloudinary_url && cartoon.original_cloudinary_url.includes('cloudinary.com')) {
      const originalPublicId = extractPublicIdFromUrl(cartoon.original_cloudinary_url);
      if (originalPublicId) {
        publicIdsToDelete.push(originalPublicId);
      }
    }

    console.log(`📦 Found ${publicIdsToDelete.length} Cloudinary images to clean up`);

    // ===== STEP 3: Delete from database FIRST (so user gets immediate response) =====
    const { error: deleteError } = await adminSupabase
      .from('cartoon_images')
      .delete()
      .eq('id', cartoonId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('❌ Supabase delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete cartoon' },
        { status: 500 }
      );
    }

    console.log(`✅ Deleted cartoon ${cartoonId} from database`);

    // ===== STEP 4: Clean up Cloudinary images (async, fire-and-forget) =====
    // Don't block the response waiting for Cloudinary
    if (publicIdsToDelete.length > 0) {
      Promise.all(publicIdsToDelete.map(publicId => deleteCloudinaryImage(publicId)))
        .then(results => {
          const successCount = results.filter(Boolean).length;
          console.log(`✅ Cloudinary cleanup complete: ${successCount}/${publicIdsToDelete.length} deleted`);
        })
        .catch(error => {
          console.error('⚠️ Cloudinary cleanup failed (non-blocking):', error);
        });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Cartoon deleted successfully',
      imagesQueued: publicIdsToDelete.length
    });

  } catch (error: any) {
    console.error('❌ Delete cartoon error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to delete cartoon',
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

