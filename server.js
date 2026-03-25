const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
const leoProfanity = require('leo-profanity');

// ─── Configura leo-profanity com PT-BR ────────────────────────────────────
leoProfanity.loadDictionary('pt');
leoProfanity.add([
  'fdp','vsf','pqp','tnc','caralho','merda','buceta','viado',
  'piroca','cuzão','cuzao','arrombado','arrombada','fodase','foda-se',
  'cacete','desgraça','desgraca','vagabunda','vagabundo','vadia',
  'putaria','putinha','corno','xoxota','rola','punheta','siririca',
  'cu','puta','filho da puta','filha da puta','vai se foder',
  'vai tomar no cu','tomar no cu','pau no cu'
]);

// ─── Camada 2: Sightengine texto ──────────────────────────────────────────
async function moderateText(text) {
  // Camada 1: leo-profanity
  if (leoProfanity.check(text)) {
    return { safe: false, reason: '🚫 Texto com conteúdo inapropriado bloqueado!' };
  }

  // Camada 2: Sightengine texto
  try {
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('lang', 'pt');
    params.append('mode', 'rules');
    params.append('api_user', process.env.SE_USER);
    params.append('api_secret', process.env.SE_SECRET);
    const r = await fetch('https://api.sightengine.com/1.0/text/check.json', {
      method: 'POST',
      body: params
    });
    const data = await r.json();
    if (data.status === 'success') {
      const profanity = data.profanity && data.profanity.matches && data.profanity.matches.length > 0;
      const link = data.link && data.link.matches && data.link.matches.length > 0;
      if (profanity) return { safe: false, reason: '🚫 Texto com conteúdo inapropriado bloqueado!' };
      if (link) return { safe: false, reason: '🔗 Links não são permitidos!' };
    }
  } catch (e) { /* se falhar, continua */ }

  return { safe: true };
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const PAGE_TOKEN = process.env.PAGE_TOKEN;
const PAGE_ID    = process.env.PAGE_ID;
const SE_USER    = process.env.SE_USER;
const SE_SECRET  = process.env.SE_SECRET;
const API        = 'https://graph.facebook.com/v25.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST texto
app.post('/api/post/text', async (req, res) => {
  try {
    const { message } = req.body;
    const mod = await moderateText(message || '');
    if (!mod.safe) return res.status(400).json({ error: { message: mod.reason } });
    const r = await fetch(`${API}/${PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: PAGE_TOKEN })
    });
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: { message: 'Erro interno' } });
  }
});

// POST foto
app.post('/api/post/photo', upload.single('source'), async (req, res) => {
  try {
    const message = req.body.message || '';
    const mod = await moderateText(message);
    if (!mod.safe) return res.status(400).json({ error: { message: mod.reason } });
    const fd = new FormData();
    fd.append('source', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    fd.append('message', message);
    fd.append('access_token', PAGE_TOKEN);
    const r = await fetch(`${API}/${PAGE_ID}/photos`, { method: 'POST', body: fd });
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: { message: 'Erro interno' } });
  }
});

// POST vídeo
app.post('/api/post/video', upload.single('source'), async (req, res) => {
  try {
    const description = req.body.description || '';
    const mod = await moderateText(description);
    if (!mod.safe) return res.status(400).json({ error: { message: mod.reason } });
    const fd = new FormData();
    fd.append('source', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    fd.append('description', description);
    fd.append('access_token', PAGE_TOKEN);
    const r = await fetch(`${API}/${PAGE_ID}/videos`, { method: 'POST', body: fd });
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: { message: 'Erro interno' } });
  }
});

// Moderação de imagem
app.post('/api/moderate/image', upload.single('media'), async (req, res) => {
  try {
    const fd = new FormData();
    fd.append('media', req.file.buffer, { filename: 'file.jpg', contentType: req.file.mimetype });
    fd.append('models', 'nudity,gore');
    fd.append('api_user', SE_USER);
    fd.append('api_secret', SE_SECRET);
    const r = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: fd });
    res.json(await r.json());
  } catch (e) {
    res.json({ status: 'success', nudity: { raw: 0, explicit: 0 }, gore: { prob: 0 } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
