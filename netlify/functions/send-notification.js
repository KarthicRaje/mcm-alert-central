import { Handler } from '@netlify/functions'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:notifications@yourdomain.com'
} = process.env

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { user_id, title, message, data } = JSON.parse(event.body!)
    
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user_id)

    const results = await Promise.allSettled(
      subscriptions!.map((sub) =>
        webpush.sendNotification(
          sub,
          JSON.stringify({
            title,
            body: message,
            data,
            icon: '/mcm-logo-192.png',
            timestamp: Date.now()
          })
        )
      )
    )

    const successful = results.filter(r => r.status === 'fulfilled').length

    return {
      statusCode: 200,
      body: JSON.stringify({
        sent: successful,
        total: subscriptions!.length
      })
    }
  } catch (error) {
    console.error('Notification error:', error)
    return { statusCode: 500, body: 'Internal Server Error' }
  }
}

export { handler }
