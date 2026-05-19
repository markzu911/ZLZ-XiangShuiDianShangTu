import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // Vercel Pro 允许更长，免费版上限为 10s-30s
};

const SAAS_BASE_URL = "http://aibigtree.com";

export default async function handler(req: any, res: any) {
  // 1. 处理 CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    console.log(`Proxy received path: ${path} (Method: ${req.method})`);

    // 2. 处理 SaaS 转发 (/api/tool/*, /api/upload/*)
    if (path.includes('/api/tool') || path.includes('/api/upload')) {
      const targetUrl = `${SAAS_BASE_URL}${path}${url.search}`;
      console.log(`Proxying SaaS request to: ${targetUrl}`);
      
      const saasRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          // Pass through authorization if present
          ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' ? JSON.stringify(req.body) : undefined,
      });

      // SaaS sometimes returns text or other types, but JSON is standard here
      const contentType = saasRes.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await saasRes.json();
        return res.status(saasRes.status).json(data);
      } else {
        const text = await saasRes.text();
        return res.status(saasRes.status).send(text);
      }
    }

    // 3. 处理 Gemini AI 请求 (/api/ai/*, /api/gemini)
    if (path.includes('/api/ai') || path === '/api/gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Missing GEMINI_API_KEY on server");

      const genAI = new GoogleGenAI({ apiKey });

      // 分析请求 (兼容 /api/gemini 或 /api/ai/analyze)
      if (path.includes('/api/ai/analyze') || path === '/api/gemini') {
        const { image } = req.body;
        const base64Data = image.split(",")[1] || image;

        const prompt = `
          Analyze this perfume bottle image and provide:
          1. A short, attractive title (in Chinese).
          2. 1-3 key selling points (in Chinese).
          3. A short bottom info line (in Chinese).
          4. A suitable dark/luxury text color (Hex code).
          Return strictly as JSON: { "title": "...", "sellingPoints": ["...", "..."], "bottomInfo": "...", "textColor": "..." }
        `;

        const response = await genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: "image/png" } },
              { text: prompt }
            ]
          }
        });

        const text = response.text;
        const jsonMatch = text?.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return res.status(500).json({ error: "Invalid AI response", raw: text });
        }
        return res.status(200).json(JSON.parse(jsonMatch[0]));
      }

      // 生成请求
      if (path.includes('/api/ai/generate')) {
         const { image, stylePrompt, aspectRatio, quality, perspectivePrompt } = req.body;
         const base64Data = image.split(",")[1] || image;
         
         const finalPrompt = `
          Create a high-end commercial product photography background for the product in the provided image.
          - Product: Maintain EXACT shape/material of the reference bottle.
          - Perspective: ${perspectivePrompt}.
          - Style: ${stylePrompt}.
          - Background: Consistent studio setup, high-end bokeh, luxurious lighting.
          - REPEAT: Absolute focus on the product. No extra digital text or graphics.
          - Quality: Professional catalog photography.
        `;

         const response = await genAI.models.generateContent({
           model: 'gemini-3.1-flash-image-preview',
           contents: {
             parts: [
               { inlineData: { data: base64Data, mimeType: "image/png" } },
               { text: finalPrompt }
             ]
           },
           config: {
             imageConfig: {
               aspectRatio: (aspectRatio || "1:1") as any,
               imageSize: (quality || "1K") as any
             }
           }
         });

         for (const part of response.candidates?.[0]?.content?.parts || []) {
           if (part.inlineData) {
             return res.status(200).json({ 
               success: true, 
               image: `data:image/png;base64,${part.inlineData.data}` 
             });
           }
         }
         return res.status(500).json({ error: "No image generated by Gemini" });
      }
    }

    console.log(`No match for path: ${path}`);
    return res.status(404).json({ error: `Route not found in proxy: ${path}` });
  } catch (error: any) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
