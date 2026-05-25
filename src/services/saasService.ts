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

export const saasService = {
  // 1. Launch
  launch: async (userId: string, toolId: string): Promise<SaasInitData> => {
    const res = await fetch('/api/tool/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, toolId })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Launch failed');
    return result.data;
  },

  // 2. Verify
  verify: async (userId: string, toolId: string): Promise<any> => {
    const res = await fetch('/api/tool/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, toolId })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Verification failed');
    return result.data;
  },

  // 3. Full save flow (Consume -> Direct Token -> Upload -> Commit)
  saveResultImage: async (
    userId: string,
    toolId: string,
    imageBuffer: Blob, // Using Blob/File for upload
    fileName: string = 'result.png'
  ): Promise<SaveImageResponse> => {
    // A. Consume
    const consumeRes = await fetch('/api/tool/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, toolId })
    });
    const consume = await consumeRes.json();
    if (!consume.success) throw new Error(consume.message || 'Consumption failed');

    // B. Get Direct Token
    const tokenRes = await fetch('/api/upload/direct-token', {
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
    const token = await tokenRes.json();
    if (!token.success) throw new Error(token.error || 'Failed to get upload token');

    // C. PUT to OSS (or mock)
    const uploadRes = await fetch(token.uploadUrl, {
      method: token.method || 'PUT',
      headers: token.headers,
      body: imageBuffer
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    // D. Commit
    const commitRes = await fetch('/api/upload/commit', {
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
    const commit = await commitRes.json();
    if (!commit.success || !commit.savedToRecords) {
      throw new Error(commit.error || 'Commit failed');
    }

    return commit.image;
  },

  // 4. Get List
  getImages: async (userId: string, toolId?: string, role: number = 1): Promise<any[]> => {
    const res = await fetch(`/api/upload/image?userId=${userId}&role=${role}${toolId ? `&toolId=${toolId}` : ''}`);
    const result = await res.json();
    return result.data || [];
  },

  // 5. Delete
  deleteImage: async (id: string, userId: string, role: number = 1): Promise<void> => {
    const res = await fetch('/api/upload/image', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userId, role })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Delete failed');
  }
};
