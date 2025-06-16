const express = require('express');
const cron = require('node-cron');

// Health check server
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'job-worker',
    timestamp: new Date().toISOString() 
  });
});

app.listen(PORT, () => {
  console.log(`🏥 Worker health server running on port ${PORT}`);
});

console.log('🚀 Job Worker Service Starting...');
console.log('✅ Worker service ready');

// TODO: Add job processing logic here
// We'll add this in the next step
