import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { 
      type, 
      booking, 
      user, 
      property, 
      adminEmail, 
      adminName, 
      adminPhone,
      denialReason 
    } = await req.json()

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }

    let subject = ''
    let htmlContent = ''
    let toEmail = ''

    const formatDate = (dateString: string, includeTime: boolean = false) => {
      const formattedDate = new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      if (includeTime) {
        return formattedDate
      }

      return formattedDate
    }

    const formatCheckIn = (dateString: string) => {
      return `${formatDate(dateString)} at 3:00 PM`
    }

    const formatCheckOut = (dateString: string) => {
      const checkoutDate = new Date(dateString)
      checkoutDate.setDate(checkoutDate.getDate() + 1)
      return `${formatDate(checkoutDate.toISOString())} at 11:00 AM`
    }

    const paymentInfo = `
      <div style="background-color: #dbeafe; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="color: #1e40af; margin: 0 0 12px 0; font-size: 16px;">Payment Information</h3>
        <div style="color: #1e40af; font-size: 14px; line-height: 1.5;">
          <div><strong>Venmo:</strong> @davidmollison</div>
          <div><strong>PayPal:</strong> davidmollison1@gmail.com</div>
          <p style="font-size: 12px; margin: 8px 0 0 0; color: #1d4ed8;">
            Please make the payment before your booking can be approved. Include your booking dates in the payment note.
          </p>
          <p style="font-size: 12px; margin: 4px 0 0 0; color: #1d4ed8;">
            Please reach out by phone to talk about your booking.
          </p>
        </div>
      </div>
    `

    if (type === 'booking_request') {
      // Email to admin about new booking request
      subject = `New Booking Request - ${property.title}`
      toEmail = adminEmail
      
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1f2937;">New Booking Request</h2>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Booking Details</h3>
            <p><strong>Property:</strong> ${property.title}</p>
            <p><strong>Guest:</strong> ${user.full_name || 'Unknown'}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Phone:</strong> ${user.phone_number || 'Not provided'}</p>
            <p><strong>Check-in:</strong> ${formatCheckIn(booking.start_date)}</p>
            <p><strong>Check-out:</strong> ${formatCheckOut(booking.end_date)}</p>
            <p><strong>Guests:</strong> ${booking.guest_count}</p>
            <p><strong>Total Price:</strong> $${booking.total_price}</p>
            ${booking.special_requests ? `<p><strong>Special Requests:</strong> ${booking.special_requests}</p>` : ''}
          </div>
          
          <p>Please review this booking request in your admin dashboard.</p>
        </div>
      `
    } else if (type === 'booking_confirmed') {
      // Email to guest about booking confirmation
      subject = `Booking Confirmed - ${property.title}`
      toEmail = user.email
      
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669;">🎉 Your Booking is Confirmed!</h2>
          
          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #065f46; margin-top: 0;">Booking Details</h3>
            <p><strong>Property:</strong> ${property.title}</p>
            <p><strong>Check-in:</strong> ${formatCheckIn(booking.start_date)}</p>
            <p><strong>Check-out:</strong> ${formatCheckOut(booking.end_date)}</p>
            <p><strong>Guests:</strong> ${booking.guest_count}</p>
            <p><strong>Total Price:</strong> $${booking.total_price}</p>
            ${booking.special_requests ? `<p><strong>Special Requests:</strong> ${booking.special_requests}</p>` : ''}
          </div>

          ${paymentInfo}
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Contact Information</h3>
            <p><strong>Property Manager:</strong> ${adminName}</p>
            <p><strong>Email:</strong> ${adminEmail}</p>
            ${adminPhone ? `<p><strong>Phone:</strong> ${adminPhone}</p>` : ''}
          </div>
          
          <p>We're excited to host you! If you have any questions, please don't hesitate to reach out.</p>
          
          <p style="margin-top: 20px; font-style: italic; color: #6b7280;">
            Looking forward to welcoming you to our surf house paradise! 🏄‍♂️🌊
          </p>
        </div>
      `
    } else if (type === 'booking_denied') {
      // Email to guest about booking denial
      subject = `Booking Update - ${property.title}`
      toEmail = user.email
      
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Booking Update</h2>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #991b1b; margin-top: 0;">Booking Details</h3>
            <p><strong>Property:</strong> ${property.title}</p>
            <p><strong>Check-in:</strong> ${formatCheckIn(booking.start_date)}</p>
            <p><strong>Check-out:</strong> ${formatCheckOut(booking.end_date)}</p>
            <p><strong>Guests:</strong> ${booking.guest_count}</p>
            <p><strong>Total Price:</strong> $${booking.total_price}</p>
          </div>
          
          <p>Unfortunately, we're unable to accommodate your booking request for the selected dates.</p>
          
          ${denialReason ? `
            <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0;"><strong>Reason:</strong> ${denialReason}</p>
            </div>
          ` : ''}
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Contact Information</h3>
            <p><strong>Property Manager:</strong> ${adminName}</p>
            <p><strong>Email:</strong> ${adminEmail}</p>
            ${adminPhone ? `<p><strong>Phone:</strong> ${adminPhone}</p>` : ''}
          </div>
          
          <p>Please feel free to contact us about alternative dates or if you have any questions.</p>
        </div>
      `
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'SurfHouseBaja <bookings@updates.mollisondavid.com>',
        to: [toEmail],
        subject: subject,
        html: htmlContent,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to send email: ${error}`)
    }

    const data = await res.json()
    
    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error sending email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})