const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const HISTORY_PATH = path.join(__dirname, '../../sessions/ghl-email-history.json');
const MAX_HISTORY  = 50;

// ─── History helpers ──────────────────────────────────────────────────────────

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return []; }
}

function writeHistory(entries) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(entries, null, 2));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Claude tool for structured email output ──────────────────────────────────

const WRITE_SEQUENCE_TOOL = {
  name: 'write_email_sequence',
  description: 'Output a complete email sequence. Call this once with all emails in the sequence.',
  input_schema: {
    type: 'object',
    properties: {
      sequenceTitle: {
        type: 'string',
        description: 'A short descriptive name for this email sequence.',
      },
      sequence: {
        type: 'array',
        description: 'The emails in the sequence, in send order.',
        items: {
          type: 'object',
          properties: {
            emailNumber: { type: 'integer', description: 'Position in the sequence, starting at 1.' },
            subject:     { type: 'string', description: 'Email subject line.' },
            previewText: { type: 'string', description: 'Short preview text shown in inbox below the subject (50-90 characters).' },
            delayDays:   { type: 'integer', description: 'Days after sequence start to send. First email is 0.' },
            htmlBody:    { type: 'string', description: 'Full HTML email body with inline styles for email client compatibility. Clean, professional design.' },
          },
          required: ['emailNumber', 'subject', 'previewText', 'delayDays', 'htmlBody'],
        },
      },
    },
    required: ['sequenceTitle', 'sequence'],
  },
};

function buildEmailSystem(context) {
  const contextSection = context
    ? `\n\nBusiness context:\n${context}`
    : '';

  return `You are an expert email copywriter for Smart Syndicator, a SaaS platform for real estate syndicators.

Smart Syndicator helps real estate professionals raise capital, manage investor relationships, track deals, and run professional syndication operations. The audience is real estate syndicators and capital raisers -- typically experienced investors looking to scale their operations and raise money from accredited investors.

WRITING RULES -- follow at all times:
- Use American English spelling only (analyze, color, favor, center, etc.)
- Never use em dashes. Use commas, colons, or double hyphens (--) instead.
- Be direct and confident -- no fluff or filler
- Write conversational but professional copy that builds trust
- Focus on specific outcomes and value
- Include a clear call to action in each email

HTML EMAIL GUIDELINES:
- Write clean HTML with inline CSS for email client compatibility
- Use a simple single-column layout, max-width 600px
- Font: Arial or Georgia, 16px body, 24px headings
- Colors: #0A0A0A for headings, #3A3A3A for body text, #5A7A65 for CTA buttons
- CTA buttons: padding 12px 28px, border-radius 4px, background #5A7A65, color #ffffff
- Add 24px padding on the container
- No complex layouts -- keep it clean and readable

When given a request, call write_email_sequence once with all emails in the sequence.${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/ghl/email-studio/write
router.post('/ghl/email-studio/write', async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const resp = await anthropic.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  4096,
      system:      buildEmailSystem(context || null),
      tools:       [WRITE_SEQUENCE_TOOL],
      tool_choice: { type: 'tool', name: 'write_email_sequence' },
      messages:    [{ role: 'user', content: prompt }],
    });

    const toolBlock = resp.content.find(b => b.type === 'tool_use' && b.name === 'write_email_sequence');
    if (!toolBlock) return res.status(500).json({ error: 'No email sequence was generated.' });

    const sequence      = toolBlock.input.sequence;
    const sequenceTitle = toolBlock.input.sequenceTitle || 'Email Sequence';

    const entry = {
      id:        generateId(),
      timestamp: new Date().toISOString(),
      prompt,
      title:     sequenceTitle,
      sequence:  sequence.map(e => ({ ...e, id: generateId() })),
    };

    const history = readHistory();
    history.unshift(entry);
    writeHistory(history.slice(0, MAX_HISTORY));

    res.json(entry);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/ghl/email-studio/history
router.get('/ghl/email-studio/history', (req, res) => {
  res.json(readHistory());
});

// DELETE /api/ghl/email-studio/history/:id
router.delete('/ghl/email-studio/history/:id', (req, res) => {
  const history = readHistory();
  const filtered = history.filter(e => e.id !== req.params.id);
  if (filtered.length === history.length) return res.status(404).json({ error: 'Entry not found' });
  writeHistory(filtered);
  res.json({ success: true });
});

// POST /api/ghl/email-studio/push
// Pushes a single email as a GHL email template
router.post('/ghl/email-studio/push', async (req, res) => {
  const { name, subject, htmlBody } = req.body;
  if (!name || !htmlBody) return res.status(400).json({ error: 'name and htmlBody are required' });

  const apiKey    = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey) return res.status(400).json({ error: 'GHL_API_KEY not configured' });

  const url = `${GHL_BASE}/emails/builder`;

  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization:   `Bearer ${apiKey}`,
          Version:         GHL_VERSION,
          'Content-Type':  'application/json',
          Accept:          'application/json',
        },
        body: JSON.stringify({ locationId, name, html: htmlBody }),
      });

      const ct   = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };

      if (r.status < 300) {
        return res.json({ success: true, message: `Template "${name}" saved to GHL.`, data });
      }
      return res.status(r.status).json({ success: false, error: `GHL returned ${r.status}`, data });
    } catch (err) {
      if (i === 2) return res.status(502).json({ error: `Push failed: ${err.message}` });
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
});

module.exports = router;
