import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!token || !supabaseUrl || !supabaseAnonKey || !resendApiKey || !fromEmail) {
    return Response.json({ error: 'Email function is not configured.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.email) {
    return Response.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { code } = await request.json().catch(() => ({}));
  if (!/^\d{4}$/.test(code)) {
    return Response.json({ error: 'Code must contain exactly four digits.' }, { status: 400 });
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [user.email],
      subject: 'Your SecureChat Pro decrypt code',
      html: `
        <div style="background:#f0fdf4;padding:32px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:520px;margin:auto;background:#fff;border:1px solid #bbf7d0;border-radius:18px;padding:28px">
            <h1 style="color:#059669;margin-top:0">SecureChat Pro</h1>
            <p>Your four-digit code for opening encrypted messages is:</p>
            <div style="font-size:34px;letter-spacing:12px;font-weight:bold;color:#047857;background:#ecfdf5;padding:18px;text-align:center;border-radius:12px">${code}</div>
            <p style="color:#64748b;font-size:13px">Keep this code private. Use it only inside SecureChat Pro.</p>
          </div>
        </div>
      `,
    }),
  });

  if (!resendResponse.ok) {
    return Response.json({ error: 'Could not send the decrypt code email.' }, { status: 502 });
  }

  return Response.json({ sent: true });
});