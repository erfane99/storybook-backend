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
 * Security configuration constants
 */
const SECURITY_CONFIG = {
  MAX_TOKEN_LENGTH: 2048, // Reasonable JWT token size limit
  MIN_TOKEN_LENGTH: 100,  // Minimum valid JWT token size
  TOKEN_PARTS_COUNT: 3,   // JWT should have 3 parts (header.payload.signature)
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute window for rate limiting
  MAX_REQUESTS_PER_WINDOW: 100, // Max requests per window per IP
} as const;

/**
 * In-memory rate limiting store
 * In production, consider using Redis or similar distributed cache
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Sanitizes error messages to prevent information disclosure
 * Removes sensitive details while maintaining debugging capability
 * 
 * @param error - The error object to sanitize
 * @param isDevelopment - Whether we're in development mode
 * @returns Sanitized error message safe for client consumption
 */
function sanitizeErrorMessage(error: any, isDevelopment: boolean = false): string {
  // Generic error message for production
  const genericMessage = 'Authentication validation failed';
  
  // In development, provide more details but still sanitize
  if (isDevelopment && process.env.NODE_ENV === 'development') {
    if (error?.message) {
      // Remove any potential token data from error messages
      return error.message
        .replace(/Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+/g, 'Bearer [REDACTED]')
        .replace(/eyJ[A-Za-z0-9\-_=]+/g, '[JWT_REDACTED]')
        .replace(/sk-[A-Za-z0-9\-_]+/g, '[API_KEY_REDACTED]');
    }
  }
  
  return genericMessage;
}

/**
 * Sanitizes log output to prevent token leakage
 * Removes sensitive information from logs while preserving debugging info
 * 
 * @param data - The data to sanitize for logging
 * @returns Sanitized data safe for logging
 */
function sanitizeLogData(data: any): any {
  if (typeof data === 'string') {
    return data
      .replace(/Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+/g, 'Bearer [REDACTED]')
      .replace(/eyJ[A-Za-z0-9\-_=]+/g, '[JWT_REDACTED]')
      .replace(/sk-[A-Za-z0-9\-_]+/g, '[API_KEY_REDACTED]');
  }
  
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth') || key.toLowerCase().includes('key')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = sanitizeLogData(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeLogData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Implements basic rate limiting for JWT validation requests
 * Prevents brute force attacks on the authentication endpoint
 * 
 * @param identifier - Unique identifier for rate limiting (IP address)
 * @returns true if request is allowed, false if rate limited
 */
function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const windowStart = now - SECURITY_CONFIG.RATE_LIMIT_WINDOW;
  
  // Clean up expired entries
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
  
  const current = rateLimitStore.get(identifier);
  
  if (!current) {
    // First request in window
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + SECURITY_CONFIG.RATE_LIMIT_WINDOW
    });
    return true;
  }
  
  if (current.resetTime < now) {
    // Window expired, reset
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + SECURITY_CONFIG.RATE_LIMIT_WINDOW
    });
    return true;
  }
  
  if (current.count >= SECURITY_CONFIG.MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limited
  }
  
  // Increment counter
  current.count++;
  return true;
}

/**
 * Validates JWT token format and basic structure before making external calls
 * Prevents unnecessary API calls with malformed tokens
 * 
 * @param token - The JWT token to validate
 * @returns Object with validation result and error message if invalid
 */
function validateTokenFormat(token: string): { isValid: boolean; error?: string } {
  // Check token length bounds
  if (token.length < SECURITY_CONFIG.MIN_TOKEN_LENGTH) {
    return { isValid: false, error: 'Token format invalid' };
  }
  
  if (token.length > SECURITY_CONFIG.MAX_TOKEN_LENGTH) {
    return { isValid: false, error: 'Token format invalid' };
  }
  
  // Check JWT structure (should have 3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== SECURITY_CONFIG.TOKEN_PARTS_COUNT) {
    return { isValid: false, error: 'Token format invalid' };
  }
  
  // Validate each part is base64url encoded
  const base64UrlPattern = /^[A-Za-z0-9\-_]+$/;
  for (const part of parts) {
    if (!part || !base64UrlPattern.test(part)) {
      return { isValid: false, error: 'Token format invalid' };
    }
  }
  
  // Basic payload validation (decode and check structure)
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    // Check for required JWT claims
    if (!payload.exp || !payload.iat || !payload.sub) {
      return { isValid: false, error: 'Token format invalid' };
    }
    
    // Check if token is expired (with 30 second buffer for clock skew)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < (now - 30)) {
      return { isValid: false, error: 'Token has expired' };
    }
    
    // Check if token is issued in the future (with 30 second buffer)
    if (payload.iat > (now + 30)) {
      return { isValid: false, error: 'Token format invalid' };
    }
    
  } catch (decodeError) {
    return { isValid: false, error: 'Token format invalid' };
  }
  
  return { isValid: true };
}

/**
 * Extracts client IP address for rate limiting
 * Handles various proxy configurations and headers
 * 
 * @param request - The incoming request object
 * @returns Client IP address or fallback identifier
 */
function getClientIdentifier(request: Request): string {
  // Try various headers that might contain the real IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp.trim();
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  
  // Fallback to a generic identifier
  return 'unknown';
}

/**
 * Validates JWT token from Authorization header for cross-origin requests
 * Implements comprehensive security measures including rate limiting,
 * token format validation, and sanitized error handling
 * 
 * @param request - The incoming HTTP request
 * @returns Promise resolving to authentication result with user data or error
 * 
 * @security
 * - Implements rate limiting to prevent brute force attacks
 * - Validates token format before making external API calls
 * - Sanitizes all log output to prevent token leakage
 * - Returns generic error messages to prevent information disclosure
 * - Uses service role key for proper JWT validation
 */
export async function validateAuthToken(request: Request): Promise<AuthValidationResult> {
  try {
    // Rate limiting check
    const clientId = getClientIdentifier(request);
    if (!checkRateLimit(clientId)) {
      console.warn('⚠️ Rate limit exceeded for authentication request');
      return {
        user: null,
        error: 'Too many authentication requests. Please try again later.'
      };
    }

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

    // Extract and validate Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return {
        user: null,
        error: 'Authentication required'
      };
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return {
        user: null,
        error: 'Invalid authentication format'
      };
    }

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return {
        user: null,
        error: 'Authentication token required'
      };
    }

    // Validate token format and structure
    const formatValidation = validateTokenFormat(token);
    if (!formatValidation.isValid) {
      console.warn('⚠️ Invalid token format received');
      return {
        user: null,
        error: formatValidation.error || 'Invalid authentication token'
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
      // Log sanitized error for debugging
      console.warn('⚠️ JWT validation failed:', sanitizeLogData({
        message: authError.message,
        status: authError.status
      }));
      
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
    // Log sanitized error for debugging
    console.error('❌ JWT validation error:', sanitizeLogData({
      message: error?.message || 'Unknown error',
      type: error?.constructor?.name || 'Unknown'
    }));

    return {
      user: null,
      error: sanitizeErrorMessage(error, process.env.NODE_ENV === 'development')
    };
  }
}

/**
 * Extracts user ID from validated auth result with proper error handling
 * Provides type-safe access to user ID with comprehensive validation
 * 
 * @param authResult - Result from validateAuthToken function
 * @returns Object containing user ID or error message
 * 
 * @security
 * - Validates auth result structure to prevent injection attacks
 * - Returns generic error messages to prevent information disclosure
 * - Implements proper type checking for user ID extraction
 */
export function extractUserId(authResult: AuthValidationResult): { userId: string | null; error: string | null } {
  // Validate input parameter
  if (!authResult || typeof authResult !== 'object') {
    return {
      userId: null,
      error: 'Invalid authentication result'
    };
  }

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

  // Validate user ID format (should be UUID)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(authResult.user.id)) {
    console.warn('⚠️ Invalid user ID format detected');
    return {
      userId: null,
      error: 'Invalid user identifier format'
    };
  }

  return {
    userId: authResult.user.id,
    error: null
  };
}

/**
 * Validates if user has required permissions for operation
 * Implements role-based access control with security best practices
 * 
 * @param user - Authenticated user object
 * @param requiredPermissions - Array of required permission strings
 * @returns Boolean indicating if user has required permissions
 * 
 * @security
 * - Validates user object structure to prevent injection attacks
 * - Implements fail-safe defaults (deny access if validation fails)
 * - Sanitizes permission checking to prevent privilege escalation
 */
export function validateUserPermissions(user: AuthUser, requiredPermissions?: string[]): boolean {
  // Validate input parameters
  if (!user || typeof user !== 'object' || !user.id) {
    return false;
  }

  // If no specific permissions required, authenticated user is sufficient
  if (!requiredPermissions || !Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
    return true;
  }

  // Validate permissions array contains only strings
  if (!requiredPermissions.every(perm => typeof perm === 'string' && perm.length > 0)) {
    console.warn('⚠️ Invalid permissions array provided');
    return false;
  }

  // Check user metadata for permissions (can be extended)
  const userPermissions = user.app_metadata?.permissions || [];
  
  // Validate user permissions is an array
  if (!Array.isArray(userPermissions)) {
    return false;
  }
  
  // Check if user has all required permissions
  return requiredPermissions.every(permission => 
    userPermissions.includes(permission)
  );
}

/**
 * Creates standardized authentication error response
 * Provides consistent error format across all authentication endpoints
 * 
 * @param error - Error message to include in response
 * @param status - HTTP status code (defaults to 401)
 * @returns Standardized error response object
 * 
 * @security
 * - Sanitizes error messages to prevent information disclosure
 * - Includes timestamp for audit logging
 * - Provides consistent error structure for client handling
 */
export function createAuthErrorResponse(error: string, status: number = 401) {
  // Validate input parameters
  if (typeof error !== 'string' || error.length === 0) {
    error = 'Authentication failed';
  }

  if (typeof status !== 'number' || status < 400 || status > 599) {
    status = 401;
  }

  return {
    error: sanitizeErrorMessage(error),
    timestamp: new Date().toISOString(),
    authenticationRequired: true,
    status
  };
}

/**
 * Gets allowed frontend origins from environment variables
 * Industry best practice: Never hardcode URLs in source code
 * 
 * @returns Array of allowed origin URLs
 * 
 * @security
 * - Validates environment variable format
 * - Provides secure fallbacks for development
 * - Prevents unauthorized origin access
 */
function getAllowedOrigins(): string[] {
  const corsOrigins = process.env.CORS_ORIGINS;
  const frontendUrl = process.env.FRONTEND_URL;
  
  // Parse CORS_ORIGINS if available
  if (corsOrigins && typeof corsOrigins === 'string') {
    const origins = corsOrigins.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);
    if (origins.length > 0) {
      return origins;
    }
  }
  
  // Fallback to FRONTEND_URL if CORS_ORIGINS not set
  if (frontendUrl && typeof frontendUrl === 'string' && frontendUrl.length > 0) {
    return [frontendUrl, 'http://localhost:3000', 'http://localhost:3001'];
  }
  
  // Development fallback
  return ['http://localhost:3000', 'http://localhost:3001'];
}

/**
 * Utility to check if request is cross-origin based on headers
 * Helps determine whether to use JWT or cookie-based auth
 * Now uses environment variables instead of hardcoded URLs
 * 
 * @param request - The incoming HTTP request
 * @returns Boolean indicating if request is cross-origin
 * 
 * @security
 * - Validates origin header format
 * - Uses environment-based origin validation
 * - Prevents unauthorized cross-origin access
 */
export function isCrossOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  
  // If no origin header, likely same-origin
  if (!origin) {
    return false;
  }

  // Validate origin format
  try {
    new URL(origin);
  } catch {
    // Invalid origin format
    return true;
  }

  // Check if origin matches expected frontend domains from environment
  const allowedOrigins = getAllowedOrigins();

  return !allowedOrigins.includes(origin);
}

/**
 * Hybrid authentication function that chooses between JWT and cookie auth
 * Based on request characteristics and security requirements
 * 
 * @param request - The incoming HTTP request
 * @returns Promise resolving to authentication result
 * 
 * @security
 * - Implements secure authentication method selection
 * - Provides fallback authentication strategies
 * - Maintains security boundaries between auth methods
 */
export async function validateHybridAuth(request: Request): Promise<AuthValidationResult> {
  // Check for Authorization header first (JWT auth)
  const authHeader = request.headers.get('authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    // Use JWT validation for requests with Bearer token
    return await validateAuthToken(request);
  }

  // For requests without Bearer token, require explicit JWT authentication
  // This encourages secure authentication practices for API calls
  return {
    user: null,
    error: 'Authentication required. Please provide a valid Bearer token.'
  };
}