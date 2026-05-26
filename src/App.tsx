import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Sparkles, 
  Download, 
  History as HistoryIcon, 
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Maximize2,
  X,
  ChevronLeft,
  ArrowLeft
} from 'lucide-react';

import { analyzeProductImage, generateEcommerceImage, AnalysisResult } from './services/geminiService';
import { saasService, SaasUser, SaasTool } from './services/saasService';

// Types
interface HistoryItem {
  id: string;
  originalImage: string;
  backgroundImages: string[];
  title: string;
  sellingPoints: string[];
  bottomInfo: string;
  textColor: string;
  timestamp: number;
}
const STYLES = [
  { id: 'crystal', name: '蓝绿碎晶', prompt: 'Commercial still-life photography of a perfume bottle. The environment is composed of sharp, multi-faceted emerald and teal crystals scattered on a reflective dark surface. Cinematic lighting with deep shadows and vibrant blue/green caustic light patterns. The background is a soft-focus deep green forest atmosphere with brilliant round bokeh. High contrast, luxury aesthetic, ultra-sharp details on the bottle glass and crystal edges.' },
  { id: 'mystery', name: '神秘氛围', prompt: 'mysterious dark atmosphere, moody lighting, subtle smoke, cinematic lighting, luxury product photography, dramatic shadows' },
  { id: 'water', name: '金蓝水波', prompt: 'Surreal dynamic luxury photography. A product bottle surrounded by a crown of shimmering golden and deep blue liquid splashes. The liquid has a viscous, metallic quality with sharp crystalline reflections. Background is a dark blue ocean wave texture with brilliant amber and golden bokeh. High-speed photography style, ultra-sharp highlights, cinematic lighting, premium cosmetics aesthetic.' },
  { id: 'silk', name: '裸色丝绸', prompt: 'resting on soft nude pink silk fabric folds, elegant drapery, warm soft lighting, luxurious feel, soft shadows' },
];

const PERSPECTIVES = [
  { id: 'upright', name: '直立斜45°', prompt: 'The product stands upright. High-angle shot from a 45-degree top-left oblique perspective. Studio lighting.' },
  { id: 'tilted', name: '倾斜45°', prompt: 'The product is tilted at a 45-degree angle towards the camera. Frontal eye-level shot. Professional studio setup.' },
  { id: 'flatlay', name: '俯拍平躺', prompt: 'Bird\'s eye view top-down flat lay. The product is lying flat on the surface horizontally. Minimalist composition.' },
];

const RATIOS = ['1:1', '3:4', '4:3', '16:9'];
const QUALITIES = ['1K', '2K', '4K'];

export default function App() {
  // SaaS State
  const [user, setUser] = useState<SaasUser | null>(null);
  const [tool, setTool] = useState<SaasTool | null>(null);
  const [userId, setUserId] = useState<string>('user_123'); // Default for demo
  const [toolId, setToolId] = useState<string>('tool_perfume'); // Default for demo

  // State
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult>({ 
    title: '', 
    sellingPoints: [], 
    bottomInfo: '',
    textColor: '#000000'
  });
  const [backgroundImages, setBackgroundImages] = useState<string[]>([]);
  const [activeBgIndex, setActiveBgIndex] = useState(0);
  const [style, setStyle] = useState(STYLES[0].id);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [perspective, setPerspective] = useState(PERSPECTIVES[0].id);
  const [quality, setQuality] = useState('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasReceivedSaasInit = useRef(false);

  // SaaS Init
  useEffect(() => {
    const initSaaS = async (uid: string, tid: string) => {
      try {
        console.log("[SaaS] Initializing...", { uid, tid });
        const data = await saasService.launch(uid, tid);
        console.log("[SaaS] Launch Success:", data);
        setUser(data.user);
        setTool(data.tool);
      } catch (err) {
        console.error("[SaaS] Launch failed:", err);
        // Only fallback to Demo User if we haven't received a real init from parent
        if (!hasReceivedSaasInit.current) {
          setUser({ id: userId, name: "Demo User", enterprise: "Demo Co.", integral: 100, role: 1 });
          setTool({ id: toolId, name: "香水设计专家", integral: 10, status: "active" });
        }
      }
    };

    // Listen for SaaS Message
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SAAS_INIT') {
        const { userId: uid, toolId: tid } = event.data;
        console.log("[SaaS] SAAS_INIT received from parent:", { uid, tid });
        hasReceivedSaasInit.current = true;
        if (uid) setUserId(uid);
        if (tid) setToolId(tid);
        initSaaS(uid || userId, tid || toolId);
      }
    };

    window.addEventListener('message', handleMessage);
    
    const isIframe = window.self !== window.top;
    let fallbackTimeout: any = null;

    if (!isIframe) {
      // Standalone dev environment
      console.log("[SaaS] Standalone mode, auto-launching");
      initSaaS(userId, toolId);
    } else {
      // Iframe environment
      fallbackTimeout = setTimeout(() => {
        if (!hasReceivedSaasInit.current) {
          const isLocal = window.location.hostname === 'localhost';
          if (isLocal) {
            console.log("[SaaS] Iframe fallback initiated (local dev)");
            initSaaS(userId, toolId);
          } else {
            console.log("[SaaS] Iframe fallback skipped (production environment waiting for parent)");
          }
        }
      }, 3000);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
    };
  }, []);

  // Handle image upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError("文件太大，请上传小于10MB的图片");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setOriginalImage(event.target?.result as string);
        setError(null);
        setAnalysis({ 
          title: '', 
          sellingPoints: [], 
          bottomInfo: '',
          textColor: '#000000'
        });
        setBackgroundImages([]);
        setActiveBgIndex(0);
        setCurrentStep(1);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 2 -> 3: Generate
  const handleGenerate = async () => {
    if (!originalImage || !user || !tool) return;
    setIsGenerating(true);
    setIsFallbackMode(false);
    setError(null);
    setActiveBgIndex(0);
    
    try {
      // SaaS Verify
      await saasService.verify(userId, toolId);

      const promptStyle = STYLES.find(s => s.id === style)?.prompt || '';
      
      // 1. Analyze the product first
      const analysisResult = await analyzeProductImage(originalImage);
      setAnalysis(analysisResult);

      // 2. Generate 1 perspective
      const selectedP = PERSPECTIVES.find(p => p.id === perspective) || PERSPECTIVES[0];
      const bg = await generateEcommerceImage(
        originalImage,
        '',
        '',
        promptStyle,
        aspectRatio,
        quality,
        selectedP.prompt
      );
      
      if (bg === originalImage) {
        setIsFallbackMode(true);
      }
      
      const bgImages = [bg];
      
      // SaaS Save (Consume -> Upload -> Commit) for the image
      try {
        // Convert dataURL to Blob
        const res = await fetch(bg);
        const blob = await res.blob();
        await saasService.saveResultImage(userId, toolId, blob, `perfume_${Date.now()}.png`);
        
        // Refresh balance info after consumption
        saasService.launch(userId, toolId).then(data => setUser(data.user)).catch(e => console.error(e));
      } catch (saveErr) {
        console.error("SaaS save failed for image:", saveErr);
      }

      setBackgroundImages(bgImages);
      setCurrentStep(2);

      // Add to session history
      const id = Date.now().toString();
      const newItem: HistoryItem = {
        id,
        originalImage,
        backgroundImages: bgImages,
        title: analysisResult.title,
        sellingPoints: analysisResult.sellingPoints,
        bottomInfo: analysisResult.bottomInfo,
        textColor: analysisResult.textColor,
        timestamp: Date.now(),
      };
      setHistory(prev => [newItem, ...prev.slice(0, 19)]);
      setActiveHistoryId(id);
    } catch (err: any) {
      setError("生成失败：" + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Utility: Add text to image using canvas for final download
  const generateFinalComposite = async (bgSrc: string): Promise<string> => {
    if (!bgSrc) return '';
    
    // Ensure fonts are loaded before drawing to canvas
    try {
      await document.fonts.load('900 12px "Inter"');
      await document.fonts.load('bold 12px "Outfit"');
      await document.fonts.load('500 12px "Outfit"');
    } catch (e) {
      console.warn("Fonts might not be fully loaded for canvas:", e);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);

        // Layout constants (matching the LAYOUT proportions)
        const w = canvas.width;
        const h = canvas.height;
        const base = w; // Use width as base for CQI equivalent sizing
        
        ctx.fillStyle = analysis.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Apply shadow to all text (mimic drop-shadow-sm)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = base * 0.005;
        ctx.shadowOffsetY = base * 0.002;

        // 1. Title: Proportional top center
        const titleSize = Math.floor(base * 0.035);
        ctx.font = `900 ${titleSize}px "Inter", sans-serif`;
        const titleLines = (analysis.title || '').split('\n');
        const titleLineHeight = titleSize * 1.1;
        titleLines.forEach((line, i) => {
          ctx.fillText(line, w / 2, h * 0.115 + (i * titleLineHeight));
        });

        // 2. Selling Points: Proportional mid section
        const itemSize = Math.floor(base * 0.025);
        ctx.font = `700 ${itemSize}px "Outfit", sans-serif`;
        ctx.textBaseline = 'middle';
        
        const drawItem = (text: string, xAnchor: number, yAnchorOrigin: number, align: CanvasTextAlign) => {
          const lines = (text || '').split('\n');
          const lineHeight = itemSize * 1.15;
          const totalTextHeight = lines.length * lineHeight;
          
          ctx.save();
          ctx.textAlign = align;
          
          const dotRadius = base * 0.004; // 0.4cqi
          const gap = base * 0.01; // 1cqi
          
          // Dot Position
          const dotX = align === 'right' ? xAnchor - dotRadius : xAnchor + dotRadius;
          const textX = align === 'right' ? xAnchor - (dotRadius * 2) - gap : xAnchor + (dotRadius * 2) + gap;

          // Draw Dot
          ctx.beginPath();
          ctx.arc(dotX, yAnchorOrigin, dotRadius, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw Lines centered vertically around yAnchorOrigin
          const startY = yAnchorOrigin - (totalTextHeight / 2) + (lineHeight / 2);
          lines.forEach((line, i) => {
            ctx.fillText(line, textX, startY + (i * lineHeight));
          });
          ctx.restore();
        };

        const points = analysis.sellingPoints;
        const midY = h * 0.5;
        const leftAnchor = w * 0.3; 
        const rightAnchor = w * 0.7; 
        const vertSpread = h * 0.08; 

        if (points.length === 1) {
          drawItem(points[0], leftAnchor, midY, 'right');
        } else if (points.length === 2) {
          drawItem(points[0], leftAnchor, midY, 'right');
          drawItem(points[1], rightAnchor, midY, 'left');
        } else if (points.length === 3) {
          drawItem(points[0], leftAnchor, midY, 'right');
          drawItem(points[1], rightAnchor, midY - vertSpread, 'left');
          drawItem(points[2], rightAnchor, midY + vertSpread, 'left');
        }

        // 3. Bottom Info: Proportional bottom center
        const bottomSize = Math.floor(base * 0.018);
        ctx.font = `500 ${bottomSize}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const bottomLines = (analysis.bottomInfo || '').split('\n');
        const bottomLineHeight = bottomSize * 1.1;
        bottomLines.forEach((line, i) => {
          ctx.fillText(line, w / 2, h * 0.92 + (i * bottomLineHeight));
        });

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = bgSrc;
    });
  };

  const handleDownload = async () => {
    const final = await generateFinalComposite(backgroundImages[activeBgIndex]);
    if (final) {
      downloadImage(final, `perfume-view-${activeBgIndex + 1}-${Date.now()}.png`);
    }
  };

  // Sync analysis changes to history item if active
  useEffect(() => {
    if (activeHistoryId) {
      setHistory(prev => prev.map(item => {
        if (item.id === activeHistoryId) {
          return {
            ...item,
            title: analysis.title,
            sellingPoints: analysis.sellingPoints,
            bottomInfo: analysis.bottomInfo,
            textColor: analysis.textColor
          };
        }
        return item;
      }));
    }
  }, [analysis, activeHistoryId]);

  const downloadImage = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = filename;
    link.click();
  };

  return (
    <div className="flex w-full min-h-screen lg:h-screen lg:overflow-hidden bg-white text-gray-900 font-sans overflow-x-hidden">
      {/* Hidden Global File Input */}
      <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-white min-h-screen lg:min-h-0 lg:h-screen lg:overflow-hidden relative">
        {/* Global Header */}
        <header className="h-14 md:h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-black shadow-sm flex-shrink-0">
               {tool?.name?.[0] || 'A'}
             </div>
             <div className="hidden sm:block">
               <h1 className="text-sm font-bold text-gray-900">{tool?.name || 'AI香水设计'}</h1>
               <p className="text-[10px] text-gray-400 font-medium">智能生成工具</p>
             </div>
          </div>

          {user && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50/80 border border-orange-100 rounded-full flex-shrink-0">
              <Sparkles size={14} className="text-orange-500" />
              <span className="text-xs font-bold text-orange-700">积分: {user.integral}</span>
            </div>
          )}
        </header>

        {/* Step Navigation Sub-Header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-8 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-8 h-12 max-w-[1200px] mx-auto">
            <button 
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-2 h-full border-b-2 transition-all whitespace-nowrap text-xs font-bold ${currentStep === 1 ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 1 ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>1</div>
              产品拍摄与风格
            </button>
            <button 
              onClick={() => setCurrentStep(2)}
              className={`flex items-center gap-2 h-full border-b-2 transition-all whitespace-nowrap text-xs font-bold ${currentStep === 2 ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 2 ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>2</div>
              排版调整与导出作品
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8 flex flex-col lg:min-h-0 lg:overflow-hidden bg-white">
          <div className="flex-1 flex flex-row gap-6 h-full w-full max-w-[1500px] mx-auto lg:overflow-hidden">
            <AnimatePresence mode="wait">
              {currentStep === 1 ? (
                    <motion.div 
                      key="step-1"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex-1 flex flex-row gap-6 h-full w-full"
                    >
                      {/* Column 1: Upload (Left) */}
                      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
                        <div className="h-8 flex items-center px-1">
                          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">01 / Products</span>
                        </div>
                        <div className="flex-1 bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col overflow-hidden relative">
                          <div className="flex-1 w-full bg-gray-50/10 relative overflow-hidden flex items-center justify-center p-6 md:p-10">
                            {originalImage ? (
                              <div 
                                className="relative max-h-full max-w-full rounded-[24px] overflow-hidden shadow-[0_20px_60px_rgb(0,0,0,0.15)] flex items-center justify-center cursor-pointer group transition-all"
                                onClick={() => setIsFullScreen(true)}
                              >
                                <img src={originalImage} alt="Source" className="block max-w-full max-h-[70vh] w-auto h-auto object-contain" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                              </div>
                            ) : (
                              <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full aspect-[3/4] max-w-[400px] border-2 border-dashed border-gray-100 rounded-[28px] hover:border-black hover:bg-white transition-all flex flex-col items-center justify-center gap-6 cursor-pointer bg-white/50 shadow-sm"
                              >
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                  <Upload className="text-black w-6 h-6" />
                                </div>
                                <div className="text-center">
                                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter">载入原始影像</h3>
                                  <p className="text-[10px] text-gray-400 mt-1 font-medium italic">Supports PNG, JPG @ Studio Shots</p>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="h-16 border-t border-gray-50 flex items-center px-10 bg-white justify-between shrink-0">
                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-[0.2em]">Material Input Stage</span>
                            {originalImage && (
                              <button onClick={() => fileInputRef.current?.click()} className="text-[11px] font-black text-black flex items-center gap-2 hover:opacity-50 transition-all">
                                <Upload size={16} /> 更换素材
                              </button>
                            )}
                          </div>
                        </div>
                        {error && <p className="text-[9px] text-red-500 font-bold text-center px-4">{error}</p>}
                      </div>

                      {/* Column 2: Configuration (Middle) */}
                      <div className="w-full md:w-[320px] lg:w-[380px] flex-none flex flex-col gap-4 h-full">
                        <div className="h-8 flex items-center px-1">
                          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">02 / Art Style</span>
                        </div>
                        <div className="flex-1 bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 lg:p-8 flex flex-col gap-8 overflow-y-auto no-scrollbar">
                          <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">画面风格</label>
                            <div className="grid grid-cols-2 gap-3">
                              {STYLES.map(s => (
                                <button 
                                  key={s.id}
                                  onClick={() => setStyle(s.id)}
                                  className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 ${
                                    style === s.id ? 'bg-black text-white border-black shadow-xl scale-[1.02]' : 'bg-gray-50 text-gray-400 border-transparent hover:border-gray-200'
                                  }`}
                                >
                                  <span className="text-[11px] font-bold">{s.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">拍摄视角</label>
                              <div className="grid grid-cols-3 gap-2">
                                {PERSPECTIVES.map(p => (
                                  <button onClick={() => setPerspective(p.id)} key={p.id} className={`py-2 px-1 rounded-xl text-[10px] font-bold border transition-all ${perspective === p.id ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50'}`}>{p.name}</button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">渲染比例</label>
                              <div className="grid grid-cols-4 gap-2">
                                {RATIOS.map(r => (
                                  <button onClick={() => setAspectRatio(r)} key={r} className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${aspectRatio === r ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50'}`}>{r}</button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-auto pt-6 border-t border-gray-50">
                            <button 
                              disabled={!originalImage || isGenerating}
                              onClick={handleGenerate}
                              className="w-full h-14 bg-black text-white rounded-[24px] font-black text-[12px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 shadow-2xl shadow-black/10"
                            >
                              {isGenerating ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles size={16} />}
                              生成高清成图
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="step-2"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="flex-1 flex flex-col md:flex-row gap-6 h-full"
                    >
                      {/* Column 1: Preview (Left) */}
                      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
                        <div className="h-8 flex items-center justify-between px-2">
                          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">03 / Preview Result</span>
                          <div className="flex gap-1.5">
                            {backgroundImages.map((_, i) => (
                              <button key={i} onClick={() => setActiveBgIndex(i)} className={`w-2 h-2 rounded-full transition-all ${activeBgIndex === i ? 'bg-black w-5' : 'bg-gray-200'}`} />
                            ))}
                          </div>
                        </div>
                        <div className="flex-1 bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col overflow-hidden relative">
                          <div className="flex-1 w-full bg-gray-50/10 relative overflow-hidden flex items-center justify-center p-6 md:p-10">
                            {(() => {
                              const previewSrc = backgroundImages[activeBgIndex] || originalImage;
                              return (
                                <div 
                                  className="relative max-h-full max-w-full rounded-[24px] overflow-hidden shadow-[0_20px_60px_rgb(0,0,0,0.15)] flex items-center justify-center cursor-zoom-in group transition-all"
                                  onClick={() => (previewSrc ? setIsFullScreen(true) : null)}
                                >
                                  {previewSrc ? (
                                    <>
                                      <img src={previewSrc} alt="Preview" className="block max-w-full max-h-[70vh] w-auto h-auto object-contain" />
                                      <div style={{ containerType: 'size' }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="absolute inset-0 flex flex-col" style={{ color: analysis.textColor }}>
                                          {/* Title - Top Center */}
                                          <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '11.5%', fontSize: '3.5cqi', width: '80%' }}>
                                            <motion.h2 
                                              layoutId="prev-title"
                                              className="font-black uppercase tracking-tight whitespace-pre-line leading-tight drop-shadow-sm"
                                            >
                                              {analysis.title}
                                            </motion.h2>
                                          </div>
    
                                          {/* Callout Blocks - Left */}
                                          <div className="absolute flex flex-col gap-[3cqi] items-end" style={{ left: '30%', top: '50%', transform: 'translate(-100%, -50%)', width: '30%' }}>
                                            {analysis.sellingPoints.length >= 1 && (
                                              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] drop-shadow-sm">
                                                <span className="font-bold font-rounded whitespace-pre-line text-right leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[0]}</span>
                                                <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                              </motion.div>
                                            )}
                                          </div>
                                          
                                          {/* Callout Blocks - Right */}
                                          <div className="absolute flex flex-col gap-[3cqi] items-start" style={{ left: '70%', top: '50%', transform: 'translate(0, -50%)', width: '30%' }}>
                                            {analysis.sellingPoints.length === 2 && (
                                              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] drop-shadow-sm">
                                                <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                                <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                                              </motion.div>
                                            )}
                                            {analysis.sellingPoints.length === 3 && (
                                              <>
                                                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] -translate-y-[4cqi] drop-shadow-sm">
                                                  <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                                  <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                                                </motion.div>
                                                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] translate-y-[4cqi] drop-shadow-sm">
                                                  <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                                  <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[2]}</span>
                                                </motion.div>
                                              </>
                                            )}
                                          </div>
    
                                          {/* Bottom Info */}
                                          <div className="absolute left-1/2 -translate-x-1/2 text-center w-[80%]" style={{ top: '92%', fontSize: '1.8cqi' }}>
                                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-medium font-rounded whitespace-pre-line leading-tight drop-shadow-sm">
                                              {analysis.bottomInfo}
                                            </motion.p>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center text-gray-300 gap-4 p-20">
                                      <div className="w-16 h-16 rounded-full border-4 border-dashed border-gray-100 flex items-center justify-center">
                                        <ImageIcon size={32} />
                                      </div>
                                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">Wait for Input</p>
                                    </div>
                                  )}
                                  <div className="absolute top-6 right-6 p-2.5 bg-black/5 hover:bg-black/10 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                                    <Maximize2 size={18} />
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                          <div className="h-16 border-t border-gray-50 flex items-center px-10 bg-white justify-between shrink-0">
                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-[0.2em]">High Definition Preview</span>
                            <div className="flex items-center gap-8">
                              <button onClick={handleDownload} className="text-[11px] font-black text-black flex items-center gap-2 hover:opacity-50 transition-all">
                                <Download size={16} /> 保存排版画面
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>


                      {/* Column 2: Editing Section (Middle) */}
                      <div className="w-full md:w-[320px] lg:w-[380px] flex-none flex flex-col gap-3 h-full">
                        <div className="h-8 flex items-center px-1">
                          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">04 / Text Tuning</span>
                        </div>
                        <div className="flex-1 bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 md:p-8 flex flex-col gap-8 overflow-y-auto no-scrollbar">
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">排版大标题</label>
                              <textarea 
                                value={analysis.title}
                                onChange={e => setAnalysis({...analysis, title: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-transparent rounded-[24px] text-xs font-black focus:bg-white focus:border-gray-200 outline-none transition-all resize-none h-28"
                                placeholder="..."
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">核心卖点点缀</label>
                              <div className="space-y-2.5">
                                {analysis.sellingPoints.map((sp, i) => (
                                  <input 
                                    key={i}
                                    value={sp}
                                    onChange={e => {
                                      const next = [...analysis.sellingPoints];
                                      next[i] = e.target.value;
                                      setAnalysis({...analysis, sellingPoints: next});
                                    }}
                                    className="w-full p-3.5 bg-gray-50 border border-transparent rounded-[16px] text-xs font-bold focus:bg-white focus:border-gray-200 outline-none transition-all"
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">基础详情语</label>
                              <input 
                                value={analysis.bottomInfo}
                                onChange={e => setAnalysis({...analysis, bottomInfo: e.target.value})}
                                className="w-full p-3.5 bg-gray-50 border border-transparent rounded-[16px] text-[11px] font-medium focus:bg-white focus:border-gray-200 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">文字调色盘</label>
                              <div className="flex gap-2">
                                <input 
                                  type="color" 
                                  value={analysis.textColor}
                                  onChange={e => setAnalysis({...analysis, textColor: e.target.value})}
                                  className="w-14 h-14 p-0 rounded-[18px] border-none cursor-pointer overflow-hidden shadow-sm"
                                />
                                <div className="flex-1 px-5 flex items-center bg-gray-50 rounded-[18px]">
                                  <span className="text-[11px] font-mono font-bold text-gray-400">{analysis.textColor}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-auto pt-6 border-t border-gray-50 flex gap-4">
                            <button onClick={() => setCurrentStep(1)} className="flex-1 h-12 border border-gray-200 rounded-full text-[10px] font-black uppercase tracking-widest hover:border-black transition-all">
                              重设参数
                            </button>
                            <button onClick={handleDownload} className="flex-1 h-12 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-black/10 hover:scale-[1.02] active:scale-[0.98] transition-all">
                              保存导出
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Column 3: History Sidebar (Right, Collapsible) */}
                      <div className={`transition-all duration-500 ease-in-out flex flex-col flex-none overflow-hidden ${isHistoryCollapsed ? 'w-12' : 'w-64'}`}>
                        <div className="h-8 flex items-center justify-between px-2 mb-3 flex-none">
                          {!isHistoryCollapsed && <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest font-mono">Archive / 历史</span>}
                          <button 
                            onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-black transition-colors ml-auto"
                          >
                            {isHistoryCollapsed ? <ChevronLeft size={16} /> : <ArrowLeft size={16} className="rotate-180" />}
                          </button>
                        </div>
                        
                        <div className={`flex-1 overflow-hidden flex flex-col transition-opacity duration-300 ${isHistoryCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                          <div className="flex-1 bg-white border border-gray-100 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            {history.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                                <HistoryIcon size={32} className="text-black mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No Records</p>
                              </div>
                            ) : (
                              history.map((record) => (
                                <div 
                                  key={record.id}
                                  onClick={() => {
                                    setActiveHistoryId(record.id);
                                    setOriginalImage(record.originalImage);
                                    setBackgroundImages(record.backgroundImages);
                                    setActiveBgIndex(0);
                                    setAnalysis({
                                      title: record.title,
                                      sellingPoints: record.sellingPoints,
                                      bottomInfo: record.bottomInfo,
                                      textColor: record.textColor || '#1f2937'
                                    });
                                    setCurrentStep(2);
                                  }}
                                  className={`group relative aspect-[3/4] rounded-[24px] overflow-hidden cursor-pointer border-2 transition-all ${activeHistoryId === record.id ? 'border-black shadow-xl ring-4 ring-black/5' : 'border-transparent hover:border-gray-200'}`}
                                >
                                  <img src={record.backgroundImages[0] || record.originalImage} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="History" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-4">
                                    <p className="text-[10px] font-black text-white truncate uppercase tracking-tighter">{record.title || record.id}</p>
                                  </div>
                                  {activeHistoryId === record.id && (
                                    <div className="absolute top-2 right-2 w-6 h-6 bg-black rounded-full flex items-center justify-center shadow-lg border border-white/20">
                                      <CheckCircle2 size={12} className="text-white" />
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>
          </div>
        </main>

      {/* Fullscreen Overlay */}
      <AnimatePresence>
        {isFullScreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center overflow-hidden p-4 md:p-8"
            onClick={() => setIsFullScreen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center md:rounded-3xl overflow-visible"
              onClick={e => e.stopPropagation()}
            >
              {/* Main Fullscreen Container */}
              {(() => {
                const previewSrc = backgroundImages[activeBgIndex] || originalImage;
                return (
                  <div 
                    className="relative h-full max-h-full max-w-full shadow-2xl overflow-hidden rounded-2xl bg-white flex items-center justify-center"
                    style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                  >
                    <div style={{ containerType: 'size' }} className="relative w-full h-full flex items-center justify-center">
                      <img 
                        src={previewSrc} 
                        alt="Full View" 
                        className="absolute inset-0 w-full h-full object-contain"
                      />

                  {/* Proportional Text Overlay in Fullscreen */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ color: analysis.textColor }}>
                     {/* Title - Top Center */}
                     <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '11.5%', fontSize: '3.5cqi', width: '80%' }}>
                      <motion.h2 layoutId="full-title" className="font-black uppercase tracking-tight whitespace-pre-line leading-tight drop-shadow-sm">{analysis.title}</motion.h2>
                    </div>

                    {/* Left Side Callouts */}
                    <div className="absolute flex flex-col gap-[3cqi] items-end" style={{ left: '30%', top: '50%', transform: 'translate(-100%, -50%)', width: '30%' }}>
                      {analysis.sellingPoints.length >= 1 && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] drop-shadow-sm">
                          <span className="font-bold font-rounded whitespace-pre-line text-right leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[0]}</span>
                          <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                        </motion.div>
                      )}
                    </div>

                    {/* Right Side Callouts */}
                    <div className="absolute flex flex-col gap-[3cqi] items-start" style={{ left: '70%', top: '50%', transform: 'translate(0, -50%)', width: '30%' }}>
                      {analysis.sellingPoints.length === 2 && (
                        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] drop-shadow-sm">
                          <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                          <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                        </motion.div>
                      )}
                      {analysis.sellingPoints.length === 3 && (
                        <>
                          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] -translate-y-[4cqi] drop-shadow-sm">
                            <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                            <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                          </motion.div>
                          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] translate-y-[4cqi] drop-shadow-sm">
                            <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                            <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[2]}</span>
                          </motion.div>
                        </>
                      )}
                    </div>

                    {/* Bottom - Center */}
                    <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '92%', fontSize: '1.8cqi', width: '80%' }}>
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-medium font-rounded whitespace-pre-line leading-tight drop-shadow-sm">{analysis.bottomInfo}</motion.p>
                    </div>
                  </div>
                </div>
              </div>
                );
              })()}

              <button 
                onClick={() => setIsFullScreen(false)}
                className="absolute top-4 right-4 z-[120] p-3 bg-white/20 hover:bg-white/35 backdrop-blur-md rounded-full text-white transition-all"
              >
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .font-rounded { font-family: 'Outfit', sans-serif; }
        .font-black { font-weight: 900; }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E7EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1D5DB;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
