import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  error?: string;
  tables?: string[];
}

export async function testSupabaseConnection(
  useServiceRole: boolean = false
): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = useServiceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        success: false,
        message: 'Missing Supabase environment variables',
        error: 'NEXT_PUBLIC_SUPABASE_URL or key not configured'
      };
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data, error } = await supabase
      .from('storybook_entries')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - startTime;

    if (error) {
      return {
        success: false,
        message: 'Database query failed',
        latencyMs,
        error: error.message
      };
    }

    return {
      success: true,
      message: `Connected successfully using ${useServiceRole ? 'service role' : 'anon'} key`,
      latencyMs
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: 'Connection test failed',
      latencyMs,
      error: error?.message || 'Unknown error'
    };
  }
}

export async function testAllDatabaseTables(): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        success: false,
        message: 'Missing Supabase environment variables',
        error: 'Service role credentials not configured'
      };
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    const tablesToTest = [
      'storybook_entries',
      'storybook_jobs',
      'auto_story_jobs',
      'cartoonize_jobs',
      'scene_generation_jobs',
      'image_generation_jobs',
      'user_ratings',
      'success_patterns'
    ];

    const accessibleTables: string[] = [];
    const errors: string[] = [];

    for (const table of tablesToTest) {
      try {
        const { error } = await supabase
          .from(table)
          .select('id')
          .limit(1);

        if (error) {
          errors.push(`${table}: ${error.message}`);
        } else {
          accessibleTables.push(table);
        }
      } catch (err: any) {
        errors.push(`${table}: ${err.message}`);
      }
    }

    const latencyMs = Date.now() - startTime;

    if (accessibleTables.length === 0) {
      return {
        success: false,
        message: 'No tables accessible',
        latencyMs,
        error: errors.join(', ')
      };
    }

    return {
      success: true,
      message: `Successfully connected to ${accessibleTables.length}/${tablesToTest.length} tables`,
      latencyMs,
      tables: accessibleTables,
      error: errors.length > 0 ? errors.join(', ') : undefined
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: 'Table accessibility test failed',
      latencyMs,
      error: error?.message || 'Unknown error'
    };
  }
}
