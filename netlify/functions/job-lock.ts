import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Simple lock mechanism to prevent multiple edge functions from processing the same jobs
// This is a serverless function that manages a lock in the database

interface LockRequest {
  processingId: string;
  action: 'acquire' | 'release';
}

const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}') as LockRequest;
    
    if (!body.processingId || !body.action) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Lock table name
    const lockTable = 'job_processing_locks';
    
    // Check if table exists, create if not
    const { error: tableCheckError } = await supabase
      .from(lockTable)
      .select('id')
      .limit(1);
    
    if (tableCheckError && tableCheckError.code === '42P01') { // Table doesn't exist
      // Create lock table
      await supabase.rpc('create_job_lock_table');
    }
    
    // Handle lock action
    if (body.action === 'acquire') {
      // Check if lock exists
      const { data: existingLock, error: lockCheckError } = await supabase
        .from(lockTable)
        .select('*')
        .eq('id', 'job_processing_lock')
        .single();
      
      if (lockCheckError && lockCheckError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new Error(`Lock check failed: ${lockCheckError.message}`);
      }
      
      // If lock exists and is not expired
      if (existingLock) {
        const lockExpiry = new Date(existingLock.expires_at);
        
        if (lockExpiry > new Date()) {
          // Lock is still valid
          return {
            statusCode: 200,
            body: JSON.stringify({
              locked: true,
              owner: existingLock.owner,
              expiresAt: existingLock.expires_at,
            }),
          };
        }
      }
      
      // Create or update lock
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + 60); // 1 minute lock
      
      const { error: lockError } = await supabase
        .from(lockTable)
        .upsert({
          id: 'job_processing_lock',
          owner: body.processingId,
          acquired_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });
      
      if (lockError) {
        throw new Error(`Failed to acquire lock: ${lockError.message}`);
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          locked: false,
          acquired: true,
          owner: body.processingId,
          expiresAt: expiresAt.toISOString(),
        }),
      };
    } else if (body.action === 'release') {
      // Check if lock is owned by this process
      const { data: existingLock, error: lockCheckError } = await supabase
        .from(lockTable)
        .select('*')
        .eq('id', 'job_processing_lock')
        .single();
      
      if (lockCheckError && lockCheckError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new Error(`Lock check failed: ${lockCheckError.message}`);
      }
      
      // Only release if this process owns the lock
      if (existingLock && existingLock.owner === body.processingId) {
        const { error: releaseError } = await supabase
          .from(lockTable)
          .delete()
          .eq('id', 'job_processing_lock');
        
        if (releaseError) {
          throw new Error(`Failed to release lock: ${releaseError.message}`);
        }
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            released: true,
            owner: body.processingId,
          }),
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          released: false,
          reason: 'Lock not owned by this process',
          owner: existingLock?.owner,
        }),
      };
    }
    
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid action' }),
    };
  } catch (error) {
    console.error('Lock function error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};

export { handler };