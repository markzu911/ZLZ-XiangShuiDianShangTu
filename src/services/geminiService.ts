export interface AnalysisResult {
  title: string;
  sellingPoints: string[];
  bottomInfo: string;
  textColor: string;
}

export const analyzeProductImage = async (base64Image: string): Promise<AnalysisResult> => {
  const base64Data = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
  
  const prompt = `
    Analyze this perfume bottle image and provide:
    1. A short, attractive title (in Chinese).
    2. 1-3 key selling points (in Chinese).
    3. A short bottom info line (in Chinese).
    4. A suitable dark/luxury text color (Hex code, like #1A1A1A or #2C2420).
    Return strictly as JSON: { "title": "...", "sellingPoints": ["...", "..."], "bottomInfo": "...", "textColor": "..." }
  `;

  const payload = {
    contents: [{
      parts: [
        { inlineData: { data: base64Data, mimeType: "image/png" } },
        { text: prompt }
      ]
    }]
  };

  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: 'gemini-3.1-pro-preview',
        payload 
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Analysis failed: ${res.status} ${errorText}`);
    }

    const data = await res.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Clean JSON response from potential markdown backticks
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response as JSON");
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: parsed.title || "Untitled Fragrance",
      sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints : ["Elegant Design", "Pure Essence"],
      bottomInfo: parsed.bottomInfo || "Exquisite Experience",
      textColor: parsed.textColor || "#1A1A1A"
    };

  } catch (error) {
    console.error("Analysis service error:", error);
    // Return safe default values
    return {
      title: "香水设计专家",
      sellingPoints: ["精选原材料", "法式制香工艺"],
      bottomInfo: "探索感官新境界",
      textColor: "#2C2420"
    };
  }
};

export const generateEcommerceImage = async (
  base64Image: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  description: string,
  style: string,
  aspectRatio: string,
  quality: string,
  perspective: string
): Promise<string> => {
  // If we don't have a reliable image generation model available via Gemini REST API,
  // we return an error or placeholder.
  
  // Real implementers would use a model like 'imagen-3' or similar if available via this API,
  // or a different service like Midjourney/DALL-E.
  
  console.log("Image generation called with:", { style, aspectRatio, quality, perspective });
  
  // For this project, we'll return an error if we can't truly generate, 
  // ensuring we don't try to parse a non-existent JSON response later.
  throw new Error("Image generation service is currently being upgraded. Please use existing backgrounds for now.");
};
