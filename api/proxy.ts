import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const SAAS_BASE_URL = "http://aibigtree.com";

// Mock Database (In-memory for demo, should be Firestore/DB in prod)
// Note: In serverless, this resets when the function cold-starts.
const db = {
  users: [
    { id: 'user_123', name: '张三', enterprise: 'Perfume Co.', integral: 100, role: 1 }
  ],
  tools: [
    { id: 'tool_perfume', name: '香水 AI 全案设计', integral: 10, status: 'active' }
  ],
  userImages: [] as any[],
  pendingUploads: new Map<string, any>()
};

export default async function handler(req: any, res: any) {
  // 1. CORS Handling
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    console.log(`Proxy received path: ${path} (Method: ${req.method})`);

    // --- SaaS Mocks ---
    if (path === "/api/tool/launch" && req.method === "POST") {
      const { userId, toolId } = req.body;
      const user = db.users.find(u => u.id === userId) || db.users[0];
      const tool = db.tools.find(t => t.id === toolId) || db.tools[0];
      return res.status(200).json({ success: true, data: { user, tool } });
    }

    if (path === "/api/tool/verify" && req.method === "POST") {
      const { userId, toolId } = req.body;
      const user = db.users.find(u => u.id === userId) || db.users[0];
      const tool = db.tools.find(t => t.id === toolId) || db.tools[0];
      if (user.integral < tool.integral) {
        return res.status(200).json({ success: false, message: `积分不足` });
      }
      return res.status(200).json({ success: true, data: { currentIntegral: user.integral, requiredIntegral: tool.integral } });
    }

    if (path === "/api/tool/consume" && req.method === "POST") {
      const { userId, toolId } = req.body;
      const user = db.users.find(u => u.id === userId) || db.users[0];
      const tool = db.tools.find(t => t.id === toolId) || db.tools[0];
      if (user.integral < tool.integral) {
        return res.status(200).json({ success: false, message: "积分不足" });
      }
      user.integral -= tool.integral;
      db.pendingUploads.set(`${userId}_${toolId}`, { expiresAt: Date.now() + 5 * 60 * 1000 });
      return res.status(200).json({ success: true, message: "积分扣除成功", data: { currentIntegral: user.integral, consumedIntegral: tool.integral, toolId } });
    }

    if (path === "/api/upload/direct-token" && req.method === "POST") {
      const { userId, toolId, fileName } = req.body;
      const objectKey = `uploads/${userId}_${Date.now()}_${fileName}`;
      return res.status(200).json({
        success: true,
        uploadUrl: `/api/upload/mock-put?key=${encodeURIComponent(objectKey)}`,
        method: "POST",
        objectKey: objectKey,
        headers: {}
      });
    }

    if (path === "/api/upload/mock-put" && req.method === "POST") {
      // Small workaround for Vercel body limits/raw data if needed, but for mock just say OK
      return res.status(200).send("OK");
    }

    if (path === "/api/upload/commit" && req.method === "POST") {
      const { userId, objectKey } = req.body;
      const newImage = { id: `img_${Date.now()}`, url: `https://via.placeholder.com/400?text=Mock+Upload+${objectKey}`, fileName: objectKey, createdAt: Date.now() };
      db.userImages.unshift(newImage);
      return res.status(200).json({ success: true, savedToRecords: true, image: newImage });
    }

    if (path === "/api/upload/image" && req.method === "GET") {
      return res.status(200).json({ success: true, data: db.userImages });
    }

    if (path === "/api/upload/image" && req.method === "DELETE") {
      const { id } = req.body;
      db.userImages = db.userImages.filter(img => img.id !== id);
      return res.status(200).json({ success: true, message: "Deleted" });
    }

    // 2. SaaS Forwarding (/api/tool/*, /api/upload/*) fallback
    if (path.startsWith('/api/tool') || path.startsWith('/api/upload')) {
      const targetUrl = `${SAAS_BASE_URL}${path}${url.search}`;
      console.log(`Proxying SaaS request to: ${targetUrl}`);
      
      const saasRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' ? JSON.stringify(req.body) : undefined,
      });

      const data = await saasRes.text();
      res.status(saasRes.status);
      
      const contentType = saasRes.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      
      return res.send(data);
    }

    // 3. Gemini AI Handling
    if (path.startsWith('/api/ai')) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Missing GEMINI_API_KEY on server");

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Analyze Logic
      if (path === '/api/ai/analyze') {
        const { image } = req.body;
        if (!image) throw new Error("Missing image in request body");
        const base64Data = image.split(",")[1] || image;

        const prompt = `
          Analyze this perfume bottle image and provide commercial copy.
          Return ONLY a JSON object with this structure:
          { 
            "title": "A short catchy title (Traditional Chinese)", 
            "sellingPoints": ["Point 1 (Traditional Chinese)", "Point 2", "Point 3"], 
            "bottomInfo": "A short luxury tag line (Traditional Chinese)", 
            "textColor": "A dark luxury hex color code" 
          }
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: "image/png" } },
              { text: prompt }
            ]
          },
          config: {
            responseMimeType: "application/json"
          }
        });

        const text = response.text;
        const jsonMatch = text?.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Invalid AI response format");
        }
        return res.status(200).json(JSON.parse(jsonMatch[0]));
      }

      // Generate Logic
      if (path === '/api/ai/generate') {
         const { image, stylePrompt, aspectRatio, quality, perspectivePrompt } = req.body;
         const base64Data = image.split(",")[1] || image;
         
         const finalPrompt = `
          High-end commercial product photography background.
          Product: Maintain references bottle shape and material.
          Perspective: ${perspectivePrompt}.
          Style: ${stylePrompt}.
          Lighting: Luxurious, professional studio lighting.
          Exclude: No text, no logos, no graphics.
        `;

         const response = await ai.models.generateContent({
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
         throw new Error("No image generated by model");
      }
    }

    console.log(`Route not found: ${path}`);
    return res.status(404).json({ error: `Route not found in proxy: ${path}` });
  } catch (error: any) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

