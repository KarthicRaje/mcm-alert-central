// netlify/functions/send-notification.js
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// Environment configuration
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:notifications@yourdomain.com',
  NODE_ENV = 'production'
} = process.env;

// Validate required environment variables
const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

// Configure web push
webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Initialize Supabase client with enhanced configuration
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    headers: {
      'X-Client-Info': 'netlify-notification-service/1.0'
    }
  }
});

// Notification sender with retry logic
async function sendNotification(subscription, payload, retries = 3) {
  try {
    await webpush.sendNotification(subscription, payload);
    console.log(`Notification sent successfully to ${subscription.endpoint}`);
    return true;
  } catch (error) {
    console.error(`Failed to send notification to ${subscription.endpoint}:`, error);
    
    // Handle specific error cases
    if (error.statusCode === 410 || error.body?.includes('unsubscribed')) {
      console.log(`Removing expired subscription: ${subscription.endpoint}`);
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', subscription.endpoint);
      return false;
    }

    // Retry for other errors
    if (retries > 0) {
      console.log(`Retrying (${retries} attempts remaining)...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
      return sendNotification(subscription, payload, retries - 1);
    }

    return false;
  }
}

exports.handler = async (event) => {
  // Basic request validation
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  try {
    const { user_id, title, body, url, data } = JSON.parse(event.body || '{}');
    
    // Validate required fields
    if (!user_id || !title) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: user_id and title are required' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Get user's subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user_id);

    if (error) throw error;

    // Prepare notification payload
    const payload = JSON.stringify({
      title,
      body,
      url,
      data,
      icon: '/mcm-logo-192.png',
      badge: '/mcm-logo-192.png',
      timestamp: Date.now()
    });

    // Send notifications in parallel with error handling
    const results = await Promise.allSettled(
      subscriptions.map(sub => sendNotification(sub, payload))
    );

    // Analyze results
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.length - successful;

    if (NODE_ENV === 'development') {
      console.log(`Notification batch results: ${successful} succeeded, ${failed} failed`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        sent: successful,
        failed,
        total: subscriptions.length
      }),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error) {
    console.error('Error processing notification request:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        details: NODE_ENV === 'development' ? error.message : undefined
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};
