export interface AnalysisResult {
  title: string;
  sellingPoints: string[];
  bottomInfo: string;
  textColor: string;
}

export const analyzeProductImage = async (base64Image: string): Promise<AnalysisResult> => {
  const res = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image })
  });
  if (!res.ok) throw new Error('Analysis failed');
  return await res.json();
};

export const generateEcommerceImage = async (
  base64Image: string,
  title: string,
  description: string,
  style: string,
  aspectRatio: string,
  quality: string,
  perspective: string
): Promise<string> => {
  // In a real implementation, we would move this generation logic to the server too
  // For now, if we want to keep using the client-side Gemini (as existing), 
  // we should be aware it's not following best practices but I'll keep it simple 
  // and handle generate in the backend if I had a robust way to do it.
  
  // Let's proxy this too for safety.
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      image: base64Image,
      stylePrompt: style,
      aspectRatio,
      quality,
      perspectivePrompt: perspective
    })
  });
  
  // NOTE: If the server returns a URL or base64, we'd use that.
  // Currently server.ts just says "ok". I should update server.ts to handle generation.
  // Actually, I'll update server.ts to do the full generation.
  
  const result = await res.json();
  if (result.image) return result.image;
  
  // Fallback to locally if server task above is mocked
  throw new Error('Generation not fully implemented on server yet');
};
