import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

// Types for authentication results
export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

export interface AuthValidationResult {
  user: AuthUser | null;
  error: string | null;
}

/**
 * Validates JWT token from Authorization header for cross-origin requests
 * Complements existing cookie-based auth without replacing it
 * Uses service role key for proper JWT validation
 */
export async function validateAuthToken(request: Request): Promise<AuthValidationResult> {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables for JWT validation');
      return {
        user: null,
        error: 'Authentication service configuration error'
      };
    }

    // Extract Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return {
        user: null,
        error: 'Missing authorization header'
      };
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return {
        user: null,
        error: 'Invalid authorization header format. Expected: Bearer <token>'
      };
    }

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return {
        user: null,
        error: 'Missing JWT token in authorization header'
      };
    }

    // Create Supabase client with service role key for JWT validation
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Validate JWT token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError) {
      console.warn('⚠️ JWT validation failed:', authError.message);
      return {
        user: null,
        error: 'Invalid or expired authentication token'
      };
    }

    if (!user) {
      return {
        user: null,
        error: 'Authentication token does not contain valid user information'
      };
    }

    // Return validated user with consistent typing
    const validatedUser: AuthUser = {
      id: user.id,
      email: user.email || undefined,
      phone: user.phone || undefined,
      user_metadata: user.user_metadata || {},
      app_metadata: user.app_metadata || {}
    };

    console.log(`✅ JWT validation successful for user: ${user.id}`);
    
    return {
      user: validatedUser,
      error: null
    };

  } catch (error: any) {
    console.error('❌ JWT validation error:', {
      message: error.message,
      stack: error.stack
    });

    return {
      user: null,
      error: 'Authentication validation failed'
    };
  }
}

/**
 * Extracts user ID from validated auth result with proper error handling
 * Follows error handling patterns from helpers.ts
 */
export function extractUserId(authResult: AuthValidationResult): { userId: string | null; error: string | null } {
  if (authResult.error) {
    return {
      userId: null,
      error: authResult.error
    };
  }

  if (!authResult.user?.id) {
    return {
      userId: null,
      error: 'User ID not found in authentication token'
    };
  }

  return {
    userId: authResult.user.id,
    error: null
  };
}

/**
 * Validates if user has required permissions for operation
 * Can be extended for role-based access control
 */
export function validateUserPermissions(user: AuthUser, requiredPermissions?: string[]): boolean {
  // Basic validation - user must exist
  if (!user?.id) {
    return false;
  }

  // If no specific permissions required, authenticated user is sufficient
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  // Check user metadata for permissions (can be extended)
  const userPermissions = user.app_metadata?.permissions || [];
  
  return requiredPermissions.every(permission => 
    userPermissions.includes(permission)
  );
}

/**
 * Creates standardized authentication error response
 * Follows error response patterns from existing API routes
 */
export function createAuthErrorResponse(error: string, status: number = 401) {
  return {
    error,
    timestamp: new Date().toISOString(),
    authenticationRequired: true
  };
}

/**
 * Gets allowed frontend origins from environment variables
 * Industry best practice: Never hardcode URLs in source code
 */
function getAllowedOrigins(): string[] {
  const corsOrigins = process.env.CORS_ORIGINS;
  const frontendUrl = process.env.FRONTEND_URL;
  
  // Parse CORS_ORIGINS if available
  if (corsOrigins) {
    return corsOrigins.split(',').map(origin => origin.trim());
  }
  
  // Fallback to FRONTEND_URL if CORS_ORIGINS not set
  if (frontendUrl) {
    return [frontendUrl, 'http://localhost:3000', 'http://localhost:3001'];
  }
  
  // Development fallback
  return ['http://localhost:3000', 'http://localhost:3001'];
}

/**
 * Utility to check if request is cross-origin based on headers
 * Helps determine whether to use JWT or cookie-based auth
 * Now uses environment variables instead of hardcoded URLs
 */
export function isCrossOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  
  // If no origin header, likely same-origin
  if (!origin) {
    return false;
  }

  // Check if origin matches expected frontend domains from environment
  const allowedOrigins = getAllowedOrigins();

  return !allowedOrigins.includes(origin);
}

/**
 * Hybrid authentication function that chooses between JWT and cookie auth
 * Based on request characteristics
 */
export async function validateHybridAuth(request: Request): Promise<AuthValidationResult> {
  // Check for Authorization header first (JWT auth)
  const authHeader = request.headers.get('authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    // Use JWT validation for requests with Bearer token
    return await validateAuthToken(request);
  }

  // For requests without Bearer token, could fall back to cookie auth
  // This would require importing and using createServerSupabaseClient
  // For now, return error to encourage JWT usage for API calls
  return {
    user: null,
    error: 'Authentication required. Please provide a valid Bearer token.'
  };
}