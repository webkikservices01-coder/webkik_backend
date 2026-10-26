// Live AI voice / video calls from the chatbot on webkik.co.in.
//
// Audio goes straight between the visitor's browser and OpenAI Realtime over WebRTC. This file only:
//   1. writes the assistant's instructions (Webkik facts + call rules) on the server, so nobody can
//      use our OpenAI key with their own prompt,
//   2. hands out a short-lived client secret (the API key itself never reaches the browser),
//   3. emails Webkik a lead when the AI notes one during the call.
//
// Env: OPENAI_API_KEY (required), AI_CALL_MODEL, AI_VIDEO_CALL_MODEL, AI_CALL_VOICE,
//      AI_CALL_MAX_SECONDS, AI_CALL_PER_IP_PER_DAY, AI_CALL_ORIGINS (comma-separated).

const MODELS = {
  voice: process.env.AI_CALL_MODEL || 'gpt-realtime-mini',
  video: process.env.AI_VIDEO_CALL_MODEL || 'gpt-realtime', // takes camera pictures too
};
const VOICE = process.env.AI_CALL_VOICE || 'marin'; // female voice; the Hindi rules below match it
const MAX_SECONDS = Math.max(60, Math.min(1800, Number(process.env.AI_CALL_MAX_SECONDS) || 300));
const PER_IP_PER_DAY = Math.max(1, Number(process.env.AI_CALL_PER_IP_PER_DAY) || 6);
const ORIGINS = (process.env.AI_CALL_ORIGINS || 'https://webkik.co.in,https://www.webkik.co.in,http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Best effort only: Vercel may run several instances and restart them. Set a monthly budget in the
// OpenAI dashboard as the real spending cap.
const callsByIp = new Map(); // ip -> { day, count }
const leadsByIp = new Map();
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
const clean = (v, max) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

const WEBKIK = `You are Webkik AI, the voice assistant of Webkik Services (webkik.co.in), a digital agency in New Delhi, India.

ABOUT WEBKIK
- Founded in 2015 by Shubham Khurana (Founder and Director). 30+ projects delivered for clients in India, USA, UAE, Australia and UK.
- Office: WZ-52, Second Floor, Near Pillar No-432, Tagore Garden, New Delhi 110027.
- Phone and WhatsApp: +91 98686 98698. Email: hello@webkik.co.in.
- Hours: Monday to Friday 9:30 am to 6:30 pm, Saturday 10 am to 3 pm.

SERVICES (each has a page on the website)
- Website design and development: React, Next.js, Node.js, WordPress, Shopify. Landing pages and e-commerce stores.
- UI/UX design for websites and apps: research, wireframes, prototypes, design systems.
- Mobile apps: native iOS and Android, and cross-platform with React Native and Flutter.
- AI solutions: AI chatbots (support, lead generation, WhatsApp), AI agents that automate business work, AI-powered websites, AI video and illustrations.
- SEO: technical SEO, on-page SEO, local SEO, and AEO/GEO (showing up in AI answers).
- Performance marketing: Google Ads and Meta Ads, focused on leads, ROAS and profit.
- Social media marketing: Instagram, LinkedIn and YouTube content and strategy.
- Branding and logo design, creative and motion graphics.
- Clients get full ownership of source code and design files after final payment. A standard business website usually takes 2 to 4 weeks.

PRICING
- Webkik does not have fixed public prices: cost depends on scope. Never invent a price. Offer to note their requirement so the team sends a quote, or to book a free consultation call.`;

function instructions(mode) {
  const video = mode === 'video';
  return `${WEBKIK}

=== LIVE ${video ? 'VIDEO' : 'VOICE'} CALL RULES ===
- You are on a live ${video ? 'video' : 'phone'} call with a visitor of the Webkik website. Everything you say is spoken aloud.
- Start the call yourself with a short, warm hello, for example: "Hi! Main Webkik ki AI assistant hoon. Aapke business ke liye kya banana chahte hain?"
- Speak naturally in 1 to 3 short sentences, then let the caller talk. No lists, no markdown, no emojis. Stop as soon as the caller starts speaking.
- Language: Hinglish by default (the natural mix of Hindi and English Indians use on calls). If the caller speaks only English, reply in simple Indian English; if only Hindi, reply in Hindi. Say numbers the Indian way.
- You speak with a female voice, so in Hindi use feminine forms ("main bata sakti hoon", "main aapki help karti hoon").
- Never read out web links or long numbers digit by digit unless asked.
- Understand what they need (type of business, what they want built or improved, timeline, budget if they share it), then help them take the next step.
- LEADS: when the caller wants a quote, a callback or to work with Webkik, ask for their name and phone or WhatsApp number (email is optional), confirm them back once, then call save_lead. Say the Webkik team will contact them soon.
- MEETINGS: when they want to talk to the team or book a consultation, call book_meeting. A calendar opens on their screen; tell them to pick a time there.
- WHATSAPP: when they want details or to chat on WhatsApp, call open_whatsapp with a one-line summary of what they need. A WhatsApp button appears on their screen.
- If you do not know something, say the team will confirm, and offer save_lead or book_meeting.${video ? `
- VIDEO: you sometimes receive a still picture from the caller's camera. Use it only when it helps (for example they show you a website, a design, a product or a document). Do not describe or comment on the caller's looks, and never guess who a person is, their age, religion, caste or health.` : ''}
- You are an AI assistant, not a human. If asked, say so honestly. If they say bye, say a short goodbye.`;
}

const TOOLS = [
  {
    type: 'function',
    name: 'save_lead',
    description: 'Send the caller\'s details to the Webkik team so they call back with a quote. Use after the caller has confirmed their name and number.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string', description: 'Phone or WhatsApp number' },
        email: { type: 'string' },
        company: { type: 'string' },
        requirement: { type: 'string', description: 'What they need, in one or two sentences' },
        preferred_time: { type: 'string', description: 'When they prefer a callback, if said' },
      },
      required: ['name', 'phone', 'requirement'],
    },
  },
  {
    type: 'function',
    name: 'book_meeting',
    description: 'Open the Webkik booking calendar (Calendly) on the caller\'s screen so they pick a consultation slot.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, email: { type: 'string' } },
    },
  },
  {
    type: 'function',
    name: 'open_whatsapp',
    description: 'Show a button that opens WhatsApp with Webkik, with a message about what the caller needs already written in.',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string', description: 'One line: what the caller needs' } },
      required: ['summary'],
    },
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = function aiCall(app, transporter) {
  // GET /api/ai-call/status -> { voice, video, maxSeconds } (the chatbot shows call buttons for these)
  app.get('/api/ai-call/status', (req, res) => {
    const on = !!process.env.OPENAI_API_KEY;
    res.json({ voice: on, video: on, maxSeconds: MAX_SECONDS });
  });

  // POST /api/ai-call/start { mode: voice|video, consent: true }
  app.post('/api/ai-call/start', async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) return res.status(503).json({ msg: 'AI calls are not available right now.' });
      if (!allowedOrigin(req)) return res.status(403).json({ msg: 'Not allowed.' });
      if (req.body?.consent !== true) return res.status(428).json({ msg: 'Please accept the call notice to continue.' });
      if (!bump(callsByIp, ipOf(req), PER_IP_PER_DAY)) {
        return res.status(429).json({ msg: 'You have reached today\'s AI call limit. Please continue in the chat or WhatsApp us.' });
      }
      const mode = req.body.mode === 'video' ? 'video' : 'voice';
      const model = MODELS[mode];

      const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_after: { anchor: 'created_at', seconds: 120 }, // only to open the call
          session: {
            type: 'realtime',
            model,
            instructions: instructions(mode),
            audio: {
              input: {
                // Phones and laptops on speaker: filter room noise and the AI's own echo.
                noise_reduction: { type: 'far_field' },
                turn_detection: { type: 'server_vad', threshold: 0.7, prefix_padding_ms: 300, silence_duration_ms: 650, create_response: true, interrupt_response: true },
              },
              output: { voice: VOICE },
            },
            tools: TOOLS,
            tool_choice: 'auto',
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.value) {
        console.error('AI call start failed:', r.status, data.error?.message);
        return res.status(502).json({ msg: 'The AI call could not start right now. Please try the chat instead.' });
      }
      res.json({ clientSecret: data.value, model, maxSeconds: MAX_SECONDS });
    } catch (err) {
      console.error('AI call start error:', err.message);
      res.status(500).json({ msg: 'The AI call could not start right now. Please try again.' });
    }
  });

  // POST /api/ai-call/lead { mode, name, phone, email, company, requirement, preferred_time }
  // Run by the browser when the call AI calls save_lead.
  app.post('/api/ai-call/lead', async (req, res) => {
    try {
      if (!allowedOrigin(req)) return res.status(403).json({ msg: 'Not allowed.' });
      if (!bump(leadsByIp, ipOf(req), 5)) return res.status(429).json({ msg: 'Details already sent.' });
      const b = req.body || {};
      const lead = {
        name: clean(b.name, 80),
        phone: clean(b.phone, 30),
        email: clean(b.email, 120),
        company: clean(b.company, 120),
        requirement: clean(b.requirement, 1000),
        preferred_time: clean(b.preferred_time, 120),
      };
      if (!lead.name || !lead.phone) return res.status(400).json({ msg: 'Name and phone are needed.' });
      const mode = b.mode === 'video' ? 'video' : 'voice';
      const rows = [
        ['Name', lead.name],
        ['Phone / WhatsApp', lead.phone],
        ['Email', lead.email],
        ['Company', lead.company],
        ['Requirement', lead.requirement],
        ['Preferred time', lead.preferred_time],
      ].filter(([, v]) => v);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.CONTACT_RECEIVER,
        replyTo: lead.email || undefined,
        subject: `📞 New Lead from AI ${mode} call: ${lead.name}${lead.company ? ` from ${lead.company}` : ''}`,
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#ea0b60;color:#fff;padding:20px;border-radius:10px 10px 0 0"><h2 style="margin:0">Lead from the AI ${mode} call</h2></div>
          <table style="width:100%;border-collapse:collapse;background:#fff">${rows
            .map(([k, v]) => `<tr><td style="padding:10px;border-bottom:1px solid #eee;color:#666;width:160px">${k}</td><td style="padding:10px;border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`)
            .join('')}</table>
          <p style="color:#888;font-size:12px">Noted by Webkik AI during a live call on webkik.co.in. Call them back soon.</p></div>`,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('AI call lead error:', err.message);
      res.status(500).json({ msg: 'Could not send the details.' });
    }
  });
};
