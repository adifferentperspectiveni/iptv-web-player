const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

const clean = (url) => url.replace(/\/+$/, '');

// 1. Authenticate with provider
app.post('/api/login', async (req, res) => {
  const { server, username, password } = req.body;
  try {
    const resp = await fetch(`${clean(server)}/player_api.php?username=${username}&password=${password}`);
    const data = await resp.json();
    if (data?.user_info?.auth === 1) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials or expired account' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: 'Cannot connect to provider: ' + e.message });
  }
});

// 2. Fetch categories
app.post('/api/categories', async (req, res) => {
  const { server, username, password } = req.body;
  try {
    const resp = await fetch(`${clean(server)}/player_api.php?username=${username}&password=${password}&action=get_live_categories`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// 3. Fetch channels in category
app.post('/api/streams', async (req, res) => {
  const { server, username, password, category_id } = req.body;
  try {
    const resp = await fetch(`${clean(server)}/player_api.php?username=${username}&password=${password}&action=get_live_streams&category_id=${category_id}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// 4. Video & Manifest Proxy (Fixes CORS and Mixed-Content)
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('No URL specified');

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const contentType = response.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Rewrite .m3u8 files so all inner segment URLs route back through this proxy
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
      const text = await response.text();
      const baseUrl = new URL(targetUrl);

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const resolved = new URL(trimmed, baseUrl).href;
        return `/api/proxy?url=${encodeURIComponent(resolved)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    // Stream binary video segments (.ts chunks)
    const arrayBuf = await response.arrayBuffer();
    res.setHeader('Content-Type', contentType || 'video/MP2T');
    return res.send(Buffer.from(arrayBuf));
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});

// Serve frontend directly
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});