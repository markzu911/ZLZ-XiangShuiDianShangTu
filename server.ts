import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mock Database (In-memory for demo, should be Firestore/DB in prod)
const db = {
  users: [
    { id: 'user_123', name: '张三', enterprise: 'Perfume Co.', integral: 100, role: 1 },
    { id: 'c7f150ac-af4b-4acb-a5a5-8a4f49b67921', name: 'Demo User', enterprise: 'Test Inc.', integral: 500, role: 1 }
  ],
  tools: [
    { id: 'tool_perfume', name: '香水 AI 全案设计', integral: 10, status: 'active' },
    { id: 'ae7f45dc-4abf-4e43-a47a-414aa6426c32', name: '香水设计专家', integral: 10, status: 'active' }
  ],
  userImages: [] as any[],
  pendingUploads: new Map<string, any>()
};

// --- Health Check ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// --- Gemini API Routes ---

// --- Gemini API Proxy Route (Unified) ---
app.get("/api/gemini/models", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/gemini", async (req, res) => {
  const { payload } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

  try {
    const forcedModel = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
    const modelName = forcedModel.startsWith('models/') ? forcedModel : `models/${forcedModel}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Remove old unused routes
// app.post("/api/ai/analyze", ...) -> Cleaned up
// app.post("/api/ai/generate", ...) -> Cleaned up

// --- SaaS Integration APIs ---

app.post("/api/tool/launch", (req, res) => {
  const { userId, toolId } = req.body;
  console.log(`[SaaS Launch] userId: ${userId}, toolId: ${toolId}`);
  
  const user = db.users.find(u => u.id === userId) || db.users.find(u => u.id === 'c7f150ac-af4b-4acb-a5a5-8a4f49b67921') || db.users[0];
  const tool = db.tools.find(t => t.id === toolId) || db.tools.find(t => t.id === 'ae7f45dc-4abf-4e43-a47a-414aa6426c32') || db.tools[0];

  res.json({
    success: true,
    data: { user, tool }
  });
});

app.post("/api/tool/verify", (req, res) => {
  const { userId, toolId } = req.body;
  const user = db.users.find(u => u.id === userId) || db.users[0];
  const tool = db.tools.find(t => t.id === toolId) || db.tools[0];

  if (user.integral < tool.integral) {
    return res.status(200).json({
      success: false,
      message: `积分不足，还差 ${tool.integral - user.integral} 积分`
    });
  }

  res.json({
    success: true,
    data: {
      currentIntegral: user.integral,
      requiredIntegral: tool.integral
    }
  });
});

app.post("/api/tool/consume", (req, res) => {
  const { userId, toolId } = req.body;
  const user = db.users.find(u => u.id === userId) || db.users[0];
  const tool = db.tools.find(t => t.id === toolId) || db.tools[0];

  if (user.integral < tool.integral) {
    return res.status(200).json({
      success: false,
      message: "积分扣除失败: 积分不足"
    });
  }

  user.integral -= tool.integral;
  
  // Create short-duration flag for result image upload
  db.pendingUploads.set(`${userId || user.id}_${toolId || tool.id}`, {
    timestamp: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 mins
  });

  res.json({
    success: true,
    message: "积分扣除成功",
    data: {
      currentIntegral: user.integral,
      consumedIntegral: tool.integral,
      toolId: toolId || tool.id
    }
  });
});

app.post("/api/upload/direct-token", (req, res) => {
  const { userId, toolId, fileName } = req.body;
  
  const objectKey = `uploads/${userId}_${Date.now()}_${fileName}`;
  
  res.json({
    success: true,
    uploadUrl: `/api/upload/mock-put?key=${encodeURIComponent(objectKey)}`,
    method: "POST",
    objectKey: objectKey,
    headers: {}
  });
});

app.post("/api/upload/mock-put", express.raw({ type: () => true, limit: '50mb' }), (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).send("Missing key");

  const base64Data = req.body.toString('base64');
  let mimeType = req.headers['content-type'] || 'image/png';
  
  (db as any)[`temp_${key}`] = `data:${mimeType};base64,${base64Data}`;
  res.status(200).send("OK");
});

app.post("/api/upload/commit", (req, res) => {
  const { userId, toolId, objectKey } = req.body;
  
  const tempImage = (db as any)[`temp_${objectKey}`];
  if (!tempImage) {
    return res.status(400).json({ success: false, error: "Image not uploaded" });
  }

  const newImage = {
    id: `img_${Date.now()}`,
    url: tempImage,
    fileName: objectKey.split('/').pop() || 'image.png',
    createdAt: Date.now(),
    toolId: toolId // Record which tool generated this
  };

  db.userImages.unshift(newImage);

  res.json({
    success: true,
    savedToRecords: true,
    image: newImage
  });
});

app.get("/api/upload/image", (req, res) => {
  const { userId, toolId } = req.query;
  let filtered = db.userImages;
  
  if (toolId) {
    filtered = filtered.filter(img => img.toolId === toolId);
  }
  
  res.json({
    success: true,
    data: filtered
  });
});

app.delete("/api/upload/image", (req, res) => {
  const { id } = req.body;
  db.userImages = db.userImages.filter(img => img.id !== id);
  res.json({ success: true, message: "Deleted" });
});

// SPA Fallback
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
