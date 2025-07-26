// supabase/functions/send-onesignal-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  app_id: string;
  contents: { [key: string]: string };
  headings?: { [key: string]: string };
  include_external_user_ids?: string[];
  include_player_ids?: string[];
  included_segments?: string[];
  url?: string;
  data?: any;
  priority?: number;
  web_url?: string;
  chrome_web_icon?: string;
  chrome_web_badge?: string;
  buttons?: Array<{
    id: string;
    text: string;
    icon?: string;
    url?: string;
  }>;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { record, test_mode = false } = await req.json()
    
    console.log('OneSignal notification request:', { record, test_mode })

    // Get environment variables
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      throw new Error('OneSignal configuration missing')
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Prepare notification data
    const title = record.title || 'MCM Alert'
    const message = record.message || record.body || 'New notification'
    const priority = record.priority || 'medium'
    const actionUrl = record.action_url
    
    // Build OneSignal notification payload
    const notificationData: NotificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      chrome_web_icon: `${Deno.env.get('VITE_APP_URL') || 'https://your-domain.netlify.app'}/mcm-logo-192.png`,
      chrome_web_badge: `${Deno.env.get('VITE_APP_URL') || 'https://your-domain.netlify.app'}/mcm-logo-192.png`,
      data: {
        notification_id: record.id,
        type: record.type,
        priority: priority,
        action_url: actionUrl,
        timestamp: record.timestamp || record.created_at
      }
    }

    // Set priority level
    if (priority === 'high' || priority === 'urgent') {
      notificationData.priority = 10
    } else if (priority === 'medium') {
      notificationData.priority = 5
    } else {
      notificationData.priority = 1
    }

    // Add action URL if provided
    if (actionUrl) {
      notificationData.web_url = actionUrl
      notificationData.url = actionUrl
      notificationData.buttons = [
        {
          id: 'view_alert',
          text: 'View Alert',
          url: actionUrl
        },
        {
          id: 'dismiss',
          text: 'Dismiss'
        }
      ]
    }

    // Determine target audience
    if (record.user_id) {
      // Send to specific user
      notificationData.include_external_user_ids = [record.user_id]
    } else {
      // Send to all subscribed users
      notificationData.included_segments = ['All']
    }

    // Send notification via OneSignal API
    console.log('Sending OneSignal notification:', notificationData)

    const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(notificationData)
    })

    const oneSignalResult = await oneSignalResponse.json()

    if (!oneSignalResponse.ok) {
      console.error('OneSignal API error:', oneSignalResult)
      throw new Error(`OneSignal API error: ${oneSignalResult.errors?.join(', ') || 'Unknown error'}`)
    }

    console.log('OneSignal notification sent successfully:', oneSignalResult)

    // Update notification record with OneSignal ID
    if (record.id && oneSignalResult.id) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ 
          metadata: { 
            ...record.metadata, 
            onesignal_id: oneSignalResult.id,
            onesignal_sent_at: new Date().toISOString()
          }
        })
        .eq('id', record.id)

      if (updateError) {
        console.error('Error updating notification with OneSignal ID:', updateError)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        onesignal_id: oneSignalResult.id,
        recipients: oneSignalResult.recipients 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error sending OneSignal notification:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
