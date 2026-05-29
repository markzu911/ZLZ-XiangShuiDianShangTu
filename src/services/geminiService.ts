export interface AnalysisResult {
  title: string;
  sellingPoints: string[];
  bottomInfo: string;
  textColor: string;
  bottleDescription: string;
}

export const analyzeProductImage = async (base64Image: string): Promise<AnalysisResult> => {
  const base64Data = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
  
  const prompt = `
    Analyze this perfume bottle image and provide:
    1. A short, attractive title (in Chinese).
    2. 1-3 key selling points (in Chinese).
    3. A short bottom info line (in Chinese).
    4. A suitable dark/luxury text color (Hex code, like #1A1A1A or #2C2420).
    5. A highly precise, extremely detailed visual description of the perfume bottle in English (as the "bottleDescription" field) for a high-end generative model to reconstruct it with 100% precision. Be exceptionally descriptive about:
       - The exact color(s) of the perfume liquid, specifically noting any gradients, shifts, or transparency (e.g., "gradient shifting from warm orange-amber/tea-brown at the top to a deep dark brownish-black or black near the bottom").
       - The thickness of the glass, shapes, and curves of the glass body.
       - The styling, transparency, materials, and sparkling facets of the cap.
       - The details of any paper labels, text, and borders.
    Return strictly as JSON: { "title": "...", "sellingPoints": ["...", "..."], "bottomInfo": "...", "textColor": "...", "bottleDescription": "..." }
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
      bottomInfo: parsed.bottomInfo || "探索感官新境界",
      textColor: parsed.textColor || "#1A1A1A",
      bottleDescription: parsed.bottleDescription || "A luxury perfume bottle with transparent thick glass and custom liquid gradients."
    };

  } catch (error) {
    console.error("Analysis service error:", error);
    // Return safe default values
    return {
      title: "香水设计专家",
      sellingPoints: ["精选原材料", "法式制香工艺"],
      bottomInfo: "探索感官新境界",
      textColor: "#2C2420",
      bottleDescription: "A luxury perfume bottle with transparent thick glass, a crystal styled cap, and elegant gold or amber gradient liquid."
    };
  }
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
  const base64Data = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
  
  const finalPrompt = `
    Generate a high-end, professional commercial product photography image for the perfume in the provided photo.
    
    CRITICAL PRODUCT FAITHFULNESS MANDATE (EXTREMELY IMPORTANT):
    1. KEEP THE ORIGINAL PRODUCT BOTTLE EXACTLY UNCHANGED in its shape, texture, material transparency, brand labels, cap design, and MOST IMPORTANTLY, liquid colors.
    2. THE ORIGINAL LIQUID COLOR MUST BE ABSOLUTELY PRESERVED: If the original has a rich gradient transition (e.g. warm golden/amber coffee-brown at the top changing to absolute deep espresso-black at the bottom), you MUST retain this exact rich, dark amber-to-black gradient liquid color. Do NOT make the liquid pale, standard transparent yellow, or any other green/teal shade.
    3. The bottle features: ${description}
    4. Only craft the high-fashion, high-concept photography environment, backdrop, and creative materials (such as crystals, water splashes, lighting, drapery) specified below, while placing this EXACT unchanged, identical dark-liquid bottle in the scene.
    
    Product Style Theme: ${style}
    Photography Perspective: ${perspective}
    Aspect Ratio: ${aspectRatio}
    Quality Level: ${quality}

    Place this exact same bottle seamlessly in the scene with cinematic, realistic, and luxurious lighting reflecting beautifully on the thick glass of the bottle.
    Return the generated image as binary data (inlineData).
  `;

  const payload = {
    contents: [{
      parts: [
        { inlineData: { data: base64Data, mimeType: "image/png" } },
        { text: finalPrompt }
      ]
    }]
  };

  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: 'gemini-3-pro-image-preview',
        payload 
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Generation failed: ${res.status} ${errorText}`);
    }

    const data = await res.json();
    
    // Extract inlineData image from Gemini output
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inlineData?.data || p.inline_data?.data);
    
    if (imagePart) {
      const imageData = imagePart.inlineData?.data || imagePart.inline_data?.data;
      const mimeType = imagePart.inlineData?.mimeType || imagePart.inline_data?.mime_type || 'image/png';
      return `data:${mimeType};base64,${imageData}`;
    }

    console.warn("gemini-3-pro-image-preview did not return image data, falling back to original");
    return base64Image;

  } catch (error: any) {
    console.error("Image generation service error:", error);
    throw error;
  }
};
