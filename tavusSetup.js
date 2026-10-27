// One-time (re-runnable) Tavus setup for the Webkik call assistant:
//   node tavusSetup.js            (reads TAVUS_API_KEY from .env or the environment)
// It creates or updates the "Webkik AI" PAL, its tools (calendar booking, lead, WhatsApp) and a
// knowledge base crawled from webkik.co.in, then prints the PAL id to put in TAVUS_PAL_ID on Vercel.
// Running it again updates the prompt and tools in place, so edit PAL_PROMPT here and re-run.

require('dotenv').config();
const crypto = require('crypto');

const TAVUS = 'https://tavusapi.com/v2';
const PAL_NAME = 'Webkik AI';
const FACE_ID = process.env.TAVUS_FACE_ID || 'r4dc9377a68e'; // Tavus stock face "Priya - Office"
const DOC_TAG = 'webkik-website';
const BACKEND_URL = process.env.PUBLIC_URL || 'https://webkik-backend-api.vercel.app';

// Tool calls to our backend carry this key, so nobody else can trigger lead emails.
const hookKey = () => crypto.createHash('sha256').update(`webkik-hook:${process.env.TAVUS_API_KEY}`).digest('hex').slice(0, 32);

const tavus = async (path, method = 'GET', body) => {
  const r = await fetch(`${TAVUS}${path}`, {
    method,
    headers: { 'x-api-key': process.env.TAVUS_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 304) throw new Error(`Tavus ${method} ${path} ${r.status}: ${JSON.stringify(data)}`); // 304: nothing changed
  return data;
};

const PAL_PROMPT = `You are Priya, the friendly AI assistant of Webkik Services (webkik.co.in), a digital agency in New Delhi founded in 2015 by Shubham Khurana. You are on a live voice or video call with a visitor of the Webkik website. Everything you say is spoken aloud.

HOW TO TALK
- Speak naturally in 1 to 3 short sentences, then let the caller talk. No lists, no markdown, no emojis, no links read aloud.
- Language: Hinglish by default (the natural mix of Hindi and English Indians use on calls). If the caller speaks only English, reply in simple Indian English; if only Hindi, reply in Hindi. You are female, so in Hindi use feminine forms ("main bata sakti hoon", "main help karti hoon").
- Be warm, confident and helpful, like a good sales consultant. Ask one question at a time.

WHAT TO DO
- Answer anything about Webkik from the knowledge you are given: what Webkik does, services, process, team and founder, portfolio, technologies, timelines, FAQ, address and hours. Never invent facts or prices; if unsure, say the team will confirm.
- Discovery: understand their business, what they want built or improved, their goal, timeline and budget if they share it. Suggest the right Webkik service and mention a relevant past project.
- BOOKING: when they want a meeting, consultation, demo or to talk to the team, ask their name and email, then call book_meeting. A booking calendar opens on their screen; tell them to pick a date and time there and confirm. When they finish, Calendly emails them the invite.
- LEADS: when they want a quote or a callback, ask their name and phone or WhatsApp number (and what they need), repeat the number back once, then call save_lead. Tell them the Webkik team will call them soon.
- WHATSAPP: if they prefer WhatsApp, call open_whatsapp with a one-line summary; a WhatsApp button appears on their screen.
- Pricing: Webkik has no fixed prices, it depends on scope. Offer a quote callback (save_lead) or a free consultation (book_meeting).

RULES
- You are an AI assistant, not a human. If asked, say so honestly.
- In video calls you may see the caller. Use what you see only when it helps (a website, design or product they show). Never comment on looks or guess who someone is.
- If they say bye, say a short warm goodbye.`;

const TOOLS = [
  {
    name: 'book_meeting',
    description: 'Open the Webkik consultation booking calendar (Calendly) on the caller\'s screen, pre-filled with their name and email, so they pick a slot. Use when the caller wants a meeting, consultation, demo or to talk to the team.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Caller\'s name' },
        email: { type: 'string', description: 'Caller\'s email, if given' },
        topic: { type: 'string', description: 'What they want to discuss, in one line' },
      },
      required: ['name'],
    },
    on_call: 'generate_filler',
    on_resolve: 'generate_response',
    delivery: { app_message: true },
  },
  {
    name: 'save_lead',
    description: 'Send the caller\'s details to the Webkik team so they call back with a quote. Use after the caller has confirmed their name and phone number.',
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
    on_call: 'generate_filler',
    on_resolve: 'generate_response',
    delivery: { api: { url: `${BACKEND_URL}/api/ai-call/tool/save_lead?k=${hookKey()}`, method: 'POST', timeout: 20 } },
  },
  {
    name: 'open_whatsapp',
    description: 'Show a button on the caller\'s screen that opens WhatsApp chat with Webkik, with their requirement already written in.',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string', description: 'One line: what the caller needs' } },
      required: ['summary'],
    },
    on_call: 'generate_filler',
    on_resolve: 'generate_response',
    delivery: { app_message: true },
  },
];

async function main() {
  if (!process.env.TAVUS_API_KEY) throw new Error('Set TAVUS_API_KEY first.');

  // 1. Tools: create, or update the ones that already exist.
  const existing = (await tavus('/tools?limit=100')).data || [];
  const toolIds = [];
  for (const t of TOOLS) {
    const found = existing.find((e) => e.name === t.name);
    const tool = found ? await tavus(`/tools/${found.tool_id}`, 'PATCH', t) : await tavus('/tools', 'POST', t);
    toolIds.push(tool.tool_id || found.tool_id);
    console.log(`${found ? 'updated' : 'created'} tool ${t.name}`);
  }

  // 2. Knowledge base: crawl webkik.co.in once.
  const docs = (await tavus('/documents?limit=100')).data || [];
  if (!docs.some((d) => (d.tags || []).includes(DOC_TAG))) {
    const doc = await tavus('/documents', 'POST', {
      document_name: 'webkik.co.in website',
      document_url: 'https://webkik.co.in/',
      tags: [DOC_TAG],
      crawl: { depth: 2, max_pages: 60 },
    });
    console.log(`knowledge base crawl started: ${doc.document_id} (${doc.status})`);
  } else {
    console.log('knowledge base already there');
  }

  // 3. The PAL: create, or update its prompt and face.
  const pals = (await tavus('/pals?limit=100&pal_type=user')).data || [];
  let pal = pals.find((p) => (p.pal_name || p.persona_name) === PAL_NAME);
  if (pal) {
    const palId = pal.pal_id || pal.persona_id;
    await tavus(`/pals/${palId}?force=true`, 'PATCH', [
      { op: 'replace', path: '/system_prompt', value: PAL_PROMPT },
      { op: 'replace', path: '/default_face_id', value: FACE_ID },
    ]);
    pal = { pal_id: palId };
    console.log('updated PAL');
  } else {
    pal = await tavus('/pals', 'POST', {
      pal_name: PAL_NAME,
      pipeline_mode: 'full',
      system_prompt: PAL_PROMPT,
      default_face_id: FACE_ID,
      document_tags: [DOC_TAG],
    });
    console.log('created PAL');
  }
  const palId = pal.pal_id || pal.persona_id;

  // 4. Attach the tools (idempotent).
  await tavus(`/pals/${palId}/tools`, 'POST', { tool_ids: toolIds });
  console.log(`attached ${toolIds.length} tools`);
  console.log(`\nTAVUS_PAL_ID=${palId}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
