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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Supabase configuration missing' }),
      };
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Lock table name - use a simple approach with a single row
    const lockTable = 'background_jobs';
    
    // Handle lock action
    if (body.action === 'acquire') {
      // For simplicity, we'll use a comment in the background_jobs table
      // In a real implementation, you might want a dedicated locks table
      
      // Check if any jobs are currently being processed by another instance
      const { data: processingJobs, error: lockCheckError } = await supabase
        .from(lockTable)
        .select('id')
        .eq('status', 'processing')
        .limit(1);
      
      if (lockCheckError) {
        throw new Error(`Lock check failed: ${lockCheckError.message}`);
      }
      
      // Simple lock mechanism - if there are processing jobs, consider it locked
      if (processingJobs && processingJobs.length > 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            locked: true,
            owner: 'another-process',
            reason: 'Jobs are currently being processed',
          }),
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          locked: false,
          acquired: true,
          owner: body.processingId,
        }),
      };
    } else if (body.action === 'release') {
      // For the simple implementation, we don't need to do anything special
      // The lock is automatically released when jobs complete
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          released: true,
          owner: body.processingId,
        }),
      };
    }
    
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid action' }),
    };
  } catch (error: any) {
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