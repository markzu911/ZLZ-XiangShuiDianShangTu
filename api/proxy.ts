import type { VercelRequest, VercelResponse } from '@vercel/node';

const SAAS_BASE_URL = "http://aibigtree.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url || '';
  
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // A. Gemini API Proxy
    if (path.startsWith('/api/gemini')) {
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
      }

      // GET /api/gemini/models
      if (path === '/api/gemini/models') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const geminiRes = await fetch(url);
        const data = await geminiRes.json();
        return res.status(geminiRes.status).json(data);
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
      }

      // const { model, payload } = req.body; // Ignore frontend model if we want to force it
      const { payload } = req.body;
      
      // Force model name from ENV or default to 3.1 Pro Preview
      const forcedModel = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
      const modelName = forcedModel.startsWith('models/') ? forcedModel : `models/${forcedModel}`;
      
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await geminiRes.json();
      return res.status(geminiRes.status).json(data);
    }

    // B. SaaS Platform Proxy (/api/tool/*, /api/upload/*)
    if (path.startsWith('/api/tool') || path.startsWith('/api/upload')) {
      const targetUrl = `${SAAS_BASE_URL}${path}`;
      
      const saasHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (req.headers.authorization) {
        saasHeaders['Authorization'] = req.headers.authorization as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: saasHeaders,
      };

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method!) && req.body) {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      const saasRes = await fetch(targetUrl, fetchOptions);
      
      const contentType = saasRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await saasRes.json();
        return res.status(saasRes.status).json(data);
      } else {
        const text = await saasRes.text();
        // If it's HTML, we should wrap it in a JSON if we expect JSON, but here we'll be faithful
        if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
           return res.status(saasRes.status).json({ 
             error: "SaaS platform returned HTML instead of JSON", 
             status: saasRes.status,
             snippet: text.substring(0, 100)
           });
        }
        return res.status(saasRes.status).send(text);
      }
    }

    // C. Default 404
    return res.status(404).json({ error: "Path Not Found", path });

  } catch (error: any) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
