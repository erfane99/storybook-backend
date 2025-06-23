/** @type {import('next').NextConfig} */

/**
 * Get allowed origins from environment variables
 * Industry best practice: Never hardcode URLs in configuration
 */
function getAllowedOrigins() {
  const corsOrigins = process.env.CORS_ORIGINS;
  const frontendUrl = process.env.FRONTEND_URL;
  
  // Parse CORS_ORIGINS if available (comma-separated list)
  if (corsOrigins) {
    return corsOrigins.split(',').map(origin => origin.trim());
  }
  
  // Fallback to FRONTEND_URL if CORS_ORIGINS not set
  if (frontendUrl) {
    return [frontendUrl];
  }
  
  // Development fallback
  return ['http://localhost:3000'];
}

/**
 * Create CORS headers for multiple origins
 * Supports both single and multiple domain configurations
 */
function createCorsHeaders() {
  const allowedOrigins = getAllowedOrigins();
  
  // For production with single origin, use direct value
  if (allowedOrigins.length === 1) {
    return [
      {
        key: 'Access-Control-Allow-Origin',
        value: allowedOrigins[0],
      },
      {
        key: 'Access-Control-Allow-Methods',
        value: 'GET, POST, PUT, DELETE, OPTIONS',
      },
      {
        key: 'Access-Control-Allow-Headers',
        value: 'Content-Type, Authorization, X-Requested-With, Cache-Control',
      },
      {
        key: 'Access-Control-Allow-Credentials',
        value: 'true',
      },
      {
        key: 'Access-Control-Max-Age',
        value: '86400',
      },
    ];
  }
  
  // For development with multiple origins, use wildcard (less secure but functional)
  // Note: In production, you should handle this with dynamic CORS middleware
  return [
    {
      key: 'Access-Control-Allow-Origin',
      value: allowedOrigins[0], // Primary origin
    },
    {
      key: 'Access-Control-Allow-Methods',
      value: 'GET, POST, PUT, DELETE, OPTIONS',
    },
    {
      key: 'Access-Control-Allow-Headers',
      value: 'Content-Type, Authorization, X-Requested-With, Cache-Control',
    },
    {
      key: 'Access-Control-Allow-Credentials',
      value: 'true',
    },
    {
      key: 'Access-Control-Max-Age',
      value: '86400',
    },
    {
      key: 'Vary',
      value: 'Origin',
    },
  ];
}

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { 
    unoptimized: true,
    domains: ['res.cloudinary.com'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react'],
  },
  poweredByHeader: false,
  compress: true,
  
  // Configure CORS headers using environment variables
  async headers() {
    const corsHeaders = createCorsHeaders();
    
    return [
      {
        // Apply CORS headers to all API routes
        source: '/api/:path*',
        headers: corsHeaders,
      },
      {
        // Apply CORS headers to root API endpoint
        source: '/api',
        headers: corsHeaders,
      },
    ];
  },
  
  // Environment variables validation (optional but recommended)
  env: {
    CUSTOM_FRONTEND_URL: process.env.FRONTEND_URL,
    CUSTOM_CORS_ORIGINS: process.env.CORS_ORIGINS,
  },
};

module.exports = nextConfig;