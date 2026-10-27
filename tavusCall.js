// Live AI voice / video calls from the chatbot on webkik.co.in, powered by Tavus (tavus.io).
//
// The browser never sees the Tavus key. This file:
//   1. finds (or creates once) the "Webkik AI" PAL on Tavus and starts a conversation with it,
//      with the Webkik facts sent as conversational context,
//   2. hands the browser only the conversation link, which it opens in an iframe,
//   3. ends the conversation when the visitor hangs up, so no minutes are wasted,
//   4. emails the call transcript to Webkik when Tavus sends it (that is how call leads arrive).
//
// Env: TAVUS_API_KEY (required), TAVUS_FACE_ID, TAVUS_PAL_ID, AI_CALL_MAX_SECONDS,
//      AI_CALL_PER_IP_PER_DAY, AI_CALL_ORIGINS (comma-separated), PUBLIC_URL.

const crypto = require('crypto');

const TAVUS = 'https://tavusapi.com/v2';
const PAL_NAME = 'Webkik AI';
const FACE_ID = process.env.TAVUS_FACE_ID || 'rc9cff32ceba'; // Tavus stock face "Anna"
const MAX_SECONDS = Math.max(60, Math.min(1800, Number(process.env.AI_CALL_MAX_SECONDS) || 300));
const PER_IP_PER_DAY = Math.max(1, Number(process.env.AI_CALL_PER_IP_PER_DAY) || 6);
const ORIGINS = (process.env.AI_CALL_ORIGINS || 'https://webkik.co.in,https://www.webkik.co.in,http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Best effort only: Vercel may run several instances and restart them. Keep a spending limit on
// the Tavus account as the real cap.
const callsByIp = new Map(); // ip -> { day, count }
const today = () => new Date().toISOString().slice(0, 10);
const bump = (map, ip, limit) => {
  const d = today();
  const e = map.get(ip);
  const count = e && e.day === d ? e.count : 0;
  if (count >= limit) return false;
  map.set(ip, { day: d, count: count + 1 });
  if (map.size > 5000) map.clear();
  return true;
};
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
const allowedOrigin = (req) => ORIGINS.includes(String(req.headers.origin || ''));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Webhook calls carry this key, so only Tavus (which got it from us) can trigger transcript emails.
const hookKey = () => crypto.createHash('sha256').update(`webkik-hook:${process.env.TAVUS_API_KEY}`).digest('hex').slice(0, 32);

const tavus = async (path, method = 'GET', body) => {
  const r = await fetch(`${TAVUS}${path}`, {
    method,
    headers: { 'x-api-key': process.env.TAVUS_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Tavus ${method} ${path} ${r.status}: ${data.error || data.message || ''}`);
  return data;
};

const PAL_PROMPT = `You are Webkik AI, the friendly female AI assistant of Webkik Services (webkik.co.in), a digital agency in New Delhi, India. You are on a live call with a visitor of the Webkik website.
- Speak naturally in 1 to 3 short sentences, then let the caller talk. No lists, no markdown, no emojis.
- Language: Hinglish by default (the natural mix of Hindi and English Indians use on calls). If the caller speaks only English, reply in simple Indian English; if only Hindi, reply in Hindi. In Hindi use feminine forms ("main bata sakti hoon").
- Understand what they need (type of business, what they want built or improved, timeline, budget if they share it).
- When they want a quote, a callback or to work with Webkik, ask for their name and phone or WhatsApp number, and repeat them back once. Tell them the Webkik team will call them back soon.
- To book a consultation or chat on WhatsApp, tell them to tap the "Book a call" or "WhatsApp" button below the call.
- Never invent prices or facts. If you do not know something, say the team will confirm.
- You are an AI assistant, not a human. If asked, say so honestly. If they say bye, say a short goodbye.
- In video calls you may see the caller's camera. Use it only when it helps (they show a website, design or product). Never comment on the caller's looks or guess who they are.`;

// Sent with every conversation, so these facts can change without touching the PAL on Tavus.
const WEBKIK_FACTS = `ABOUT WEBKIK
- Founded in 2015 by Shubham Khurana (Founder and Director). 30+ projects delivered for clients in India, USA, UAE, Australia and UK.
- Office: WZ-52, Second Floor, Near Pillar No-432, Tagore Garden, New Delhi 110027.
- Phone and WhatsApp: +91 98686 98698. Email: hello@webkik.co.in.
- Hours: Monday to Friday 9:30 am to 6:30 pm, Saturday 10 am to 3 pm.

SERVICES
- Website design and development: React, Next.js, Node.js, WordPress, Shopify. Landing pages and e-commerce stores.
- UI/UX design for websites and apps: research, wireframes, prototypes, design systems.
- Mobile apps: native iOS and Android, and cross-platform with React Native and Flutter.
- AI solutions: AI chatbots (support, lead generation, WhatsApp), AI agents that automate business work, AI-powered websites, AI video and illustrations.
- SEO: technical SEO, on-page SEO, local SEO, and AEO/GEO (showing up in AI answers).
- Performance marketing: Google Ads and Meta Ads, focused on leads, ROAS and profit.
- Social media marketing: Instagram, LinkedIn and YouTube content and strategy.
- Branding and logo design, creative and motion graphics.
- Portfolio includes websites for interior design and architecture firms (Essentia Environments, Renascent Consultants), restaurants, jewellery and fashion stores, clinics and more.
- Clients get full ownership of source code and design files after final payment. A standard business website usually takes 2 to 4 weeks.

PRICING
- Webkik has no fixed public prices: cost depends on scope. Never invent a price. Offer a callback with a quote, or a free consultation call.`;

const GREETING = 'Hi! Main Webkik ki AI assistant hoon. Aapke business ke liye kya banana chahte hain?';

let palId = process.env.TAVUS_PAL_ID || null;
async function getPalId() {
  if (palId) return palId;
  const list = await tavus('/pals?limit=100&pal_type=user');
  const found = (list.data || []).find((p) => (p.pal_name || p.persona_name) === PAL_NAME);
  if (found) return (palId = found.pal_id || found.persona_id);
  const made = await tavus('/pals', 'POST', {
    pal_name: PAL_NAME,
    pipeline_mode: 'full',
    system_prompt: PAL_PROMPT,
    default_face_id: FACE_ID,
  });
  return (palId = made.pal_id || made.persona_id);
}

const publicUrl = (req) => process.env.PUBLIC_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

module.exports = function tavusCall(app, transporter) {
  // GET /api/ai-call/status -> { voice, video, maxSeconds } (the chatbot shows call buttons for these)
  app.get('/api/ai-call/status', (req, res) => {
    const on = !!process.env.TAVUS_API_KEY;
    res.json({ voice: on, video: on, maxSeconds: MAX_SECONDS });
  });

  // POST /api/ai-call/start { mode: voice|video, consent: true } -> { conversationId, url, maxSeconds }
  app.post('/api/ai-call/start', async (req, res) => {
    try {
      if (!process.env.TAVUS_API_KEY) return res.status(503).json({ msg: 'AI calls are not available right now.' });
      if (!allowedOrigin(req)) return res.status(403).json({ msg: 'Not allowed.' });
      if (req.body?.consent !== true) return res.status(428).json({ msg: 'Please accept the call notice to continue.' });
      if (!bump(callsByIp, ipOf(req), PER_IP_PER_DAY)) {
        return res.status(429).json({ msg: 'You have reached today\'s AI call limit. Please continue in the chat or WhatsApp us.' });
      }
      const mode = req.body.mode === 'video' ? 'video' : 'voice';
      const body = {
        pal_id: await getPalId(),
        face_id: FACE_ID,
        audio_only: mode === 'voice',
        conversation_name: `Webkik website ${mode} call`,
        conversational_context: WEBKIK_FACTS,
        custom_greeting: GREETING,
        callback_url: `${publicUrl(req)}/api/ai-call/tavus-webhook?k=${hookKey()}&mode=${mode}`,
        properties: {
          max_call_duration: MAX_SECONDS,
          participant_left_timeout: 10,
          participant_absent_timeout: 90,
          languages: ['hi', 'en'],
        },
      };
      let convo;
      try {
        convo = await tavus('/conversations', 'POST', body);
      } catch (err) {
        // Retry once with Tavus' default language settings if it rejected ours.
        if (!/ 400:/.test(err.message)) throw err;
        console.error('Tavus start retry:', err.message);
        delete body.properties.languages;
        convo = await tavus('/conversations', 'POST', body);
      }
      res.json({ conversationId: convo.conversation_id, url: convo.conversation_url, maxSeconds: MAX_SECONDS });
    } catch (err) {
      console.error('AI call start error:', err.message);
      const busy = /concurrent/i.test(err.message);
      res.status(502).json({ msg: busy ? 'All our AI lines are busy. Please try again in a minute.' : 'The AI call could not start right now. Please try the chat instead.' });
    }
  });

  // POST /api/ai-call/end { conversationId } -- the visitor hung up
  app.post('/api/ai-call/end', async (req, res) => {
    try {
      const id = String(req.body?.conversationId || '');
      if (!allowedOrigin(req) || !/^[a-z0-9]{6,40}$/i.test(id)) return res.status(400).json({ msg: 'Bad request.' });
      await tavus(`/conversations/${id}/end`, 'POST');
      res.json({ ok: true });
    } catch (err) {
      console.error('AI call end error:', err.message);
      res.json({ ok: false }); // Tavus also ends it on its own after participant_left_timeout
    }
  });

  // POST /api/ai-call/tavus-webhook?k=... -- Tavus sends call events here; we email the transcript.
  app.post('/api/ai-call/tavus-webhook', async (req, res) => {
    if (!process.env.TAVUS_API_KEY || req.query.k !== hookKey()) return res.status(403).json({ msg: 'Not allowed.' });
    const ev = req.body || {};
    if (ev.event_type !== 'application.transcription_ready') return res.json({ ok: true });
    const turns = (ev.properties?.transcript || []).filter((t) => t.role === 'user' || t.role === 'assistant');
    if (!turns.some((t) => t.role === 'user')) return res.json({ ok: true }); // nobody spoke: no email
    const mode = req.query.mode === 'video' ? 'video' : 'voice';
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.CONTACT_RECEIVER,
        subject: `📞 AI ${mode} call transcript from webkik.co.in`,
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#ea0b60;color:#fff;padding:20px;border-radius:10px 10px 0 0"><h2 style="margin:0">AI ${mode} call transcript</h2></div>
          <div style="background:#fff;padding:16px">${turns
            .map((t) => `<p style="margin:0 0 10px"><b style="color:${t.role === 'user' ? '#ea0b60' : '#555'}">${t.role === 'user' ? 'Visitor' : 'Webkik AI'}:</b> ${esc(t.content || '')}</p>`)
            .join('')}</div>
          <p style="color:#888;font-size:12px">Conversation ${esc(ev.conversation_id || '')}. If the visitor shared a name and number, call them back soon.</p></div>`,
      });
    } catch (err) {
      console.error('AI call transcript email error:', err.message);
    }
    // Answer only after the email: Vercel may stop the function once the response is sent.
    res.json({ ok: true });
  });
};
