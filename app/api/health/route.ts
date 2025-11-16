import { NextResponse } from 'next/server';
import { testSupabaseConnection, testAllDatabaseTables } from '@/lib/supabase/connection-test';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const anonTest = await testSupabaseConnection(false);
    const serviceRoleTest = await testSupabaseConnection(true);
    const tablesTest = await testAllDatabaseTables();

    const isHealthy = anonTest.success && serviceRoleTest.success && tablesTest.success;

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'storybook-backend',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: isHealthy,
        anon_key: {
          status: anonTest.success ? 'connected' : 'failed',
          latency_ms: anonTest.latencyMs,
          message: anonTest.message,
          error: anonTest.error
        },
        service_role: {
          status: serviceRoleTest.success ? 'connected' : 'failed',
          latency_ms: serviceRoleTest.latencyMs,
          message: serviceRoleTest.message,
          error: serviceRoleTest.error
        },
        tables: {
          status: tablesTest.success ? 'accessible' : 'failed',
          latency_ms: tablesTest.latencyMs,
          accessible_tables: tablesTest.tables || [],
          message: tablesTest.message,
          error: tablesTest.error
        }
      }
    }, {
      status: isHealthy ? 200 : 503,
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    }, {
      status: 500,
    });
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}