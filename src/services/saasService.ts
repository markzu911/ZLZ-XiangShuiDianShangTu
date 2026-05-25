export interface SaasUser {
  id: string;
  name: string;
  enterprise: string;
  integral: number;
  role: number;
}

export interface SaasTool {
  id: string;
  name: string;
  integral: number;
  status: string;
}

export interface SaasInitData {
  user: SaasUser;
  tool: SaasTool;
}

export interface SaveImageResponse {
  recordId: string;
  url: string;
  fileName: string;
  fileSize: number;
}

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
      throw new Error(`API returned HTML instead of JSON. Check the rewrite rule for ${url}. (Status: ${res.status})`);
    }
    throw new Error(`Expected JSON but got ${contentType}. Response: ${text.substring(0, 100)}`);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const saasService = {
  // 1. Launch
  launch: async (userId: string, toolId: string): Promise<SaasInitData> => {
    const data = await requestJson('/api/tool/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, toolId })
    });
    if (!data.success) throw new Error(data.message || 'Launch failed');
    return data.data;
  },

  // 2. Verify
  verify: async (userId: string, toolId: string): Promise<any> => {
    const data = await requestJson('/api/tool/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, toolId })
    });
    if (!data.success) throw new Error(data.message || 'Verification failed');
    return data.data;
  },

  // 3. Full save flow (Consume -> Direct Token -> Upload -> Commit)
  saveResultImage: async (
    userId: string,
    toolId: string,
    imageBuffer: Blob, // Using Blob/File for upload
    fileName: string = 'result.png'
  ): Promise<SaveImageResponse> => {
    // A. Consume
    const consume = await requestJson('/api/tool/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, toolId })
    });
    if (!consume.success) throw new Error(consume.message || 'Consumption failed');

    // B. Get Direct Token
    const token = await requestJson('/api/upload/direct-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        toolId,
        source: 'result',
        mimeType: imageBuffer.type,
        fileName,
        fileSize: imageBuffer.size
      })
    });
    if (!token.success) throw new Error(token.error || 'Failed to get upload token');

    // C. PUT to OSS (or mock)
    // Note: Upload usually doesn't return JSON, it might be 200 OK
    const uploadRes = await fetch(token.uploadUrl, {
      method: token.method || 'PUT',
      headers: token.headers,
      body: imageBuffer
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    // D. Commit
    const commit = await requestJson('/api/upload/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        toolId,
        source: 'result',
        objectKey: token.objectKey,
        fileSize: imageBuffer.size
      })
    });
    if (!commit.success || !commit.savedToRecords) {
      throw new Error(commit.error || 'Commit failed');
    }

    return commit.image;
  },

  // 4. Get List
  getImages: async (userId: string, toolId?: string, role: number = 1): Promise<any[]> => {
    const data = await requestJson(`/api/upload/image?userId=${userId}&role=${role}${toolId ? `&toolId=${toolId}` : ''}`);
    return data.data || [];
  },

  // 5. Delete
  deleteImage: async (id: string, userId: string, role: number = 1): Promise<void> => {
    const data = await requestJson('/api/upload/image', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userId, role })
    });
    if (!data.success) throw new Error(data.message || 'Delete failed');
  }
};
