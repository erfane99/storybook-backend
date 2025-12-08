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
 * Extract all Cloudinary public IDs from storybook pages
 */
function extractPublicIdsFromPages(pages: any[]): string[] {
  const publicIds: string[] = [];

  if (!pages || !Array.isArray(pages)) return publicIds;

  for (const page of pages) {
    if (!page.scenes || !Array.isArray(page.scenes)) continue;

    for (const scene of page.scenes) {
      const imageUrl = scene.generatedImage || scene.imageUrl || scene.image_url;
      if (imageUrl) {
        const publicId = extractPublicIdFromUrl(imageUrl);
        if (publicId) publicIds.push(publicId);
      }
    }
  }

  return [...new Set(publicIds)];
}

/**
 * Delete images from Cloudinary (fire-and-forget, don't block deletion)
 */
async function cleanupCloudinaryImages(publicIds: string[]): Promise<{ success: number; failed: number }> {
  if (publicIds.length === 0) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;
  const batchSize = 10;

  console.log(`🗑️ Cleaning up ${publicIds.length} Cloudinary images...`);

  for (let i = 0; i < publicIds.length; i += batchSize) {
    const batch = publicIds.slice(i, i + batchSize);
    
    try {
      const result = await cloudinary.api.delete_resources(batch, {
        type: 'upload',
        resource_type: 'image',
      });

      for (const publicId of batch) {
        if (result.deleted[publicId] === 'deleted' || result.deleted[publicId] === 'not_found') {
          success++;
        } else {
          failed++;
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ Cloudinary batch deletion error:`, error.message);
      failed += batch.length;
    }

    // Small delay between batches
    if (i + batchSize < publicIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Cloudinary cleanup: ${success} deleted, ${failed} failed`);
  return { success, failed };
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

    // Get storybook ID from URL params
    const storybookId = new URL(request.url).searchParams.get('id');
    if (!storybookId) {
      return NextResponse.json(
        { error: 'Missing storybook ID' },
        { status: 400 }
      );
    }

    console.log(`✅ User authenticated for storybook deletion: ${userId}, storybook: ${storybookId}`);

    // Initialize admin Supabase client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== STEP 1: Fetch storybook to get image URLs BEFORE deletion =====
    const { data: storybook, error: fetchError } = await adminSupabase
      .from('storybook_entries')
      .select('id, user_id, pages')
      .eq('id', storybookId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !storybook) {
      console.error('❌ Storybook not found or access denied:', fetchError);
      return NextResponse.json(
        { error: 'Storybook not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    // ===== STEP 2: Extract Cloudinary public IDs from pages =====
    const publicIds = extractPublicIdsFromPages(storybook.pages || []);
    console.log(`📦 Found ${publicIds.length} Cloudinary images to clean up`);

    // ===== STEP 3: Delete from database FIRST (so user gets immediate response) =====
    const { error: deleteError } = await adminSupabase
      .from('storybook_entries')
      .delete()
      .eq('id', storybookId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('❌ Supabase delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete storybook' },
        { status: 500 }
      );
    }

    console.log(`✅ Deleted storybook ${storybookId} from database`);

    // ===== STEP 4: Clean up Cloudinary images (async, don't wait) =====
    // Fire-and-forget: Don't block the response waiting for Cloudinary
    if (publicIds.length > 0) {
      cleanupCloudinaryImages(publicIds).catch(error => {
        console.error('⚠️ Cloudinary cleanup failed (non-blocking):', error);
      });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Storybook deleted successfully',
      imagesQueued: publicIds.length
    });

  } catch (error: any) {
    console.error('❌ Delete storybook error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      { 
        error: error.message || 'Failed to delete storybook',
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