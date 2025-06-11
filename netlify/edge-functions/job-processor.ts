import { Context } from '@netlify/edge-functions';

// Edge function for automatic job processing
export default async (request: Request, context: Context) => {
  try {
    console.log('🔄 Edge function triggered for job processing');
    
    // Get site URL from context
    const siteUrl = context.site?.url || 'http://localhost:3001';
    
    // Create a unique ID for this processing run
    const processingId = `edge_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Check if another edge function is already processing
    // This prevents multiple edge functions from processing the same jobs
    const lockResponse = await fetch(`${siteUrl}/.netlify/functions/job-lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        processingId,
        action: 'acquire',
      }),
    });
    
    if (!lockResponse.ok) {
      const lockData = await lockResponse.json();
      
      if (lockData.locked) {
        console.log(`⏳ Another process is already running: ${lockData.owner}`);
        return new Response(JSON.stringify({
          status: 'skipped',
          reason: 'Another process is already running',
          owner: lockData.owner,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
    }
    
    // Perform health check first
    console.log('🏥 Performing health check');
    const healthResponse = await fetch(`${siteUrl}/api/jobs/health`, {
      headers: {
        'User-Agent': 'netlify-edge-function',
      },
    });
    
    if (!healthResponse.ok) {
      console.log('❌ Health check failed');
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Health check failed',
        statusCode: healthResponse.status,
      }), {
        status: 200, // Return 200 to prevent retries
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    const healthData = await healthResponse.json();
    
    if (healthData.status !== 'healthy') {
      console.log(`⚠️ System health is ${healthData.status}`);
      
      // Continue only if queue depth is high
      if (healthData.queueDepth <= 5) {
        return new Response(JSON.stringify({
          status: 'skipped',
          reason: `System health is ${healthData.status}`,
          queueDepth: healthData.queueDepth,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      
      console.log('🚨 Queue depth is high, continuing despite health warning');
    }
    
    // Process jobs
    console.log('🔄 Processing jobs');
    const processResponse = await fetch(`${siteUrl}/api/jobs/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'netlify-edge-function',
        'X-Processing-ID': processingId,
      },
      body: JSON.stringify({
        maxJobs: 5,
        forceProcessing: healthData.status !== 'healthy',
      }),
    });
    
    if (!processResponse.ok) {
      console.log('❌ Job processing failed');
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Job processing failed',
        statusCode: processResponse.status,
      }), {
        status: 200, // Return 200 to prevent retries
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    const processData = await processResponse.json();
    
    // Release lock
    await fetch(`${siteUrl}/.netlify/functions/job-lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        processingId,
        action: 'release',
      }),
    });
    
    console.log(`✅ Processed ${processData.processed} jobs`);
    
    // Return success response
    return new Response(JSON.stringify({
      status: 'success',
      processed: processData.processed,
      errors: processData.errors,
      skipped: processData.skipped,
      timestamp: new Date().toISOString(),
      processingId,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('❌ Edge function error:', error);
    
    return new Response(JSON.stringify({
      status: 'error',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    }), {
      status: 200, // Return 200 to prevent retries
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};

// Configure edge function
export const config = {
  path: '/api/edge/process-jobs',
  cache: 'manual',
};