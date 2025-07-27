// netlify/functions/subscribe.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // 1. First check environment variables
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }

  // 2. Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 3. Validate request
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }

  let sub;
  try {
    sub = JSON.parse(event.body);
    if (!sub.endpoint || !sub.keys) {
      throw new Error('Invalid subscription format');
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid subscription data' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }

  // 4. Store subscription
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        endpoint: sub.endpoint,
        keys: sub.keys,
        created_at: new Date().toISOString(),
        // Add user_id if available from your auth context
        // user_id: event.headers['x-user-id'] 
      }, {
        onConflict: 'endpoint' // Update if endpoint exists
      });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
};
