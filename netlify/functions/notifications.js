// netlify/functions/notifications.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Initialize Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Handle POST requests (notification creation)
  if (event.httpMethod === 'POST') {
    try {
      const { type, title, message, priority = 'medium', ...otherData } = JSON.parse(event.body);

      // Validate required fields
      if (!title || !message) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Title and message are required' }),
        };
      }

      // Store notification
      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          title,
          body: message,
          type: type || 'general',
          priority,
          metadata: otherData,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: error.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};
