// netlify/functions/subscribe.js
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

exports.handler = async (event) => {
  const sub = JSON.parse(event.body);
  // Store sub in Supabase table (subscriptions)
  const { data, error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    keys: sub.keys,
    // User identification here, e.g. user_id: ... if possible
  });
  if (error) {
    return { statusCode: 500, body: JSON.stringify(error) };
  }
  return { statusCode: 200, body: JSON.stringify(data) };
};
