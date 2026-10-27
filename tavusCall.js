// Live AI voice / video calls from the chatbot on webkik.co.in, powered by Tavus (tavus.io).
//
// The browser never sees the Tavus key. This file:
//   1. starts a conversation with the "Webkik AI" PAL (made by tavusSetup.js), sending everything
//      in webkikKnowledge.js as conversational context,
//   2. hands the browser only the conversation link, which it joins with Daily,
//   3. ends the conversation when the visitor hangs up, so no minutes are wasted,
//   4. emails Webkik a lead when the AI calls save_lead, and the transcript after every call.
//
// Env: TAVUS_API_KEY (required), TAVUS_FACE_ID, TAVUS_PAL_ID, AI_CALL_MAX_SECONDS,
//      AI_CALL_PER_IP_PER_DAY, AI_CALL_ORIGINS (comma-separated), PUBLIC_URL.

const crypto = require('crypto');
const WEBKIK_FACTS = require('./webkikKnowledge');

const TAVUS = 'https://tavusapi.com/v2';
const PAL_NAME = 'Webkik AI';
const FACE_ID = process.env.TAVUS_FACE_ID || 'r4dc9377a68e'; // Tavus stock face "Priya - Office"
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

const GREETING = 'Hi! Main Priya hoon, Webkik ki AI assistant. Bataiye, aapke business ke liye kya banana chahte hain?';
const leadsByIp = new Map();
const clean = (v, max) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

let palId = process.env.TAVUS_PAL_ID || null;
async function getPalId() {
  if (palId) return palId;
  const list = await tavus('/pals?limit=100&pal_type=user');
  const found = (list.data || []).find((p) => (p.pal_name || p.persona_name) === PAL_NAME);
  if (!found) throw new Error('No "Webkik AI" PAL on Tavus: run node tavusSetup.js');
  return (palId = found.pal_id || found.persona_id);
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

  // POST /api/ai-call/tool/save_lead?k=... -- Tavus calls this when the AI runs save_lead during a call.
  app.post('/api/ai-call/tool/save_lead', async (req, res) => {
    if (!process.env.TAVUS_API_KEY || req.query.k !== hookKey()) return res.status(403).json({ msg: 'Not allowed.' });
    const b = req.body || {};
    const lead = {
      name: clean(b.name, 80),
      phone: clean(b.phone, 30),
      email: clean(b.email, 120),
      company: clean(b.company, 120),
      requirement: clean(b.requirement, 1000),
      preferred_time: clean(b.preferred_time, 120),
    };
    if (!lead.name || !lead.phone) return res.json({ ok: false, error: 'Name and phone number are needed. Ask the caller for them.' });
    if (!bump(leadsByIp, lead.phone, 3)) return res.json({ ok: true, note: 'These details were already sent to the team.' });
    try {
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
        subject: `📞 New Lead from AI call: ${lead.name}${lead.company ? ` from ${lead.company}` : ''}`,
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#ea0b60;color:#fff;padding:20px;border-radius:10px 10px 0 0"><h2 style="margin:0">Lead from the AI call</h2></div>
          <table style="width:100%;border-collapse:collapse;background:#fff">${rows
            .map(([k, v]) => `<tr><td style="padding:10px;border-bottom:1px solid #eee;color:#666;width:160px">${k}</td><td style="padding:10px;border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`)
            .join('')}</table>
          <p style="color:#888;font-size:12px">Noted by Webkik AI during a live call on webkik.co.in. Call them back soon.</p></div>`,
      });
      res.json({ ok: true, sent_to_webkik_team: true });
    } catch (err) {
      console.error('AI call lead error:', err.message);
      res.json({ ok: false, error: 'Could not send right now. Offer WhatsApp instead with open_whatsapp.' });
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
