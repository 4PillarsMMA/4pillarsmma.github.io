// netlify/functions/charge.js
//
// This function runs on Netlify's servers — never in the browser.
// It receives the Yoco token from the frontend, calls Yoco's API
// with the SECRET key (stored safely in Netlify env vars), and
// confirms whether the payment went through.
//
// Netlify deploys this automatically when you push to GitHub.

const YOCO_CHARGES_URL = 'https://online.yoco.com/v1/charges/';

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Parse the request body sent by the frontend
  let token, amountInCents, items;
  try {
    ({ token, amountInCents, items } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Basic validation
  if (!token || typeof token !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing payment token' }) };
  }
  if (!amountInCents || typeof amountInCents !== 'number' || amountInCents < 100) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount' }) };
  }

  // Secret key lives in Netlify environment variables — never in code
  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey || secretKey.startsWith('sk_live_YOUR')) {
    console.error('YOCO_SECRET_KEY environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Payment system not configured' }) };
  }

  // Call Yoco's charges API
  let yocoResponse;
  try {
    yocoResponse = await fetch(YOCO_CHARGES_URL, {
      method: 'POST',
      headers: {
        'X-Auth-Token': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        amountInCents,
        currency: 'ZAR',
      }),
    });
  } catch (networkErr) {
    console.error('Network error reaching Yoco:', networkErr);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not reach payment provider' }) };
  }

  const charge = await yocoResponse.json();

  // Yoco returns status "successful" on a good charge
  if (!yocoResponse.ok || charge.status !== 'successful') {
    console.error('Yoco charge failed:', charge);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: charge.message || 'Payment was declined' }),
    };
  }

  // Log the order server-side (visible in Netlify function logs)
  const orderLines = (items || []).map(i => `  ${i.name} x${i.qty} = R${i.price * i.qty}`).join('\n');
  console.log(`✅ Order paid — Charge ID: ${charge.id}\n${orderLines}\n  Total: R${amountInCents / 100}`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, chargeId: charge.id }),
  };
};
