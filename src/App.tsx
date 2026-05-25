import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Sparkles, 
  Trash2, 
  Download, 
  History as HistoryIcon, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
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
  const [gallery, setGallery] = useState<any[]>([]);
  const [userId, setUserId] = useState<string>('user_123'); // Default for demo
  const [toolId, setToolId] = useState<string>('tool_perfume'); // Default for demo

  // State
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<'workspace' | 'gallery'>('workspace');
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
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SaaS Init
  useEffect(() => {
    const initSaaS = async (uid: string, tid: string) => {
      try {
        const data = await saasService.launch(uid, tid);
        setUser(data.user);
        setTool(data.tool);
        // Load initial gallery
        const images = await saasService.getImages(uid, data.user.role);
        setGallery(images);
      } catch (err) {
        console.error("SaaS launch failed:", err);
      }
    };

    // Listen for SaaS Message
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SAAS_INIT') {
        const { userId: uid, toolId: tid } = event.data;
        if (uid) setUserId(uid);
        if (tid) setToolId(tid);
        initSaaS(uid || userId, tid || toolId);
      }
    };

    window.addEventListener('message', handleMessage);
    initSaaS(userId, toolId); // Initial call for dev

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('perfume_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history
  useEffect(() => {
    localStorage.setItem('perfume_history', JSON.stringify(history));
  }, [history]);

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
        setActiveTab('workspace');
        setActiveHistoryId(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 2 -> 3: Generate
  const handleGenerate = async () => {
    if (!originalImage || !user || !tool) return;
    setIsGenerating(true);
    setError(null);
    setActiveBgIndex(0);
    setActiveHistoryId(null);
    
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
      
      // Refresh gallery
      const images = await saasService.getImages(userId, user.role);
      setGallery(images);

      // Auto-save initial state to history (can be updated later)
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
      setActiveTab('workspace');
    } finally {
      setIsGenerating(false);
    }
  };

  // Utility: Add text to image using canvas for final download
  const generateFinalComposite = async (bgSrc: string): Promise<string> => {
    if (!bgSrc) return '';
    
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
        const padding = h * 0.08;
        
        ctx.fillStyle = analysis.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // 1. Title: Proportional top center
        const titleSize = Math.floor(base * 0.035);
        ctx.font = `bold ${titleSize}px "Inter", sans-serif`;
        const titleLines = (analysis.title || '').split('\n');
        titleLines.forEach((line, i) => {
          ctx.fillText(line, w / 2, h * 0.115 + (i * titleSize * 1.2));
        });

        // 2. Selling Points: Proportional mid section
        const itemSize = Math.floor(base * 0.025);
        ctx.font = `bold ${itemSize}px "Inter", sans-serif`;
        ctx.textBaseline = 'middle';
        
        const drawItem = (text: string, xAnchor: number, yAnchorOrigin: number, align: CanvasTextAlign) => {
          const lines = (text || '').split('\n');
          const lineHeight = itemSize * 1.2;
          const totalTextHeight = lines.length * lineHeight;
          
          // Calculate overall offset if item is shifted (p2, p3 in 3-point layout)
          const startY = yAnchorOrigin - (totalTextHeight / 2) + (itemSize / 2);
          
          ctx.save();
          ctx.textAlign = align;
          
          const dotRadius = base * 0.004; // 0.4cqi
          const gap = base * 0.01; // 1cqi
          
          // Dot Position
          // In CSS, the anchor is the outer edge of the group.
          const dotX = align === 'right' ? xAnchor - dotRadius : xAnchor + dotRadius;
          const textX = align === 'right' ? xAnchor - (dotRadius * 2) - gap : xAnchor + (dotRadius * 2) + gap;

          // Draw Dot at the center of the first line (or relative to group center?) 
          // For multi-line, we keep the dot aligned with the center of the text block for simplicity or first line?
          // The CSS layout aligns the flex row which vertically centers the dot relative to the text block.
          ctx.beginPath();
          ctx.arc(dotX, yAnchorOrigin, dotRadius, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw Lines
          lines.forEach((line, i) => {
            ctx.fillText(line, textX, startY + (i * lineHeight));
          });
          ctx.restore();
        };

        const points = analysis.sellingPoints;
        const midY = h * 0.5;
        const leftAnchor = w * 0.3; // Further from center 35 -> 30
        const rightAnchor = w * 0.7; // Further from center 65 -> 70
        const vertSpread = h * 0.08; // Proportional spread

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
        ctx.font = `${bottomSize}px "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const bottomLines = (analysis.bottomInfo || '').split('\n');
        bottomLines.forEach((line, i) => {
          ctx.fillText(line, w / 2, h * 0.92 + (i * bottomSize * 1.2));
        });

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = bgSrc;
    });
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

  const handleDownload = async () => {
    const final = await generateFinalComposite(backgroundImages[activeBgIndex]);
    if (final) {
      downloadImage(final, `perfume-view-${activeBgIndex + 1}-${Date.now()}.png`);
    }
  };

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

          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
            <button 
              onClick={() => setActiveTab('workspace')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'workspace' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              创作台
            </button>
            <button 
              onClick={() => setActiveTab('gallery')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'gallery' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              云图库
            </button>
          </div>

          {user && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50/80 border border-orange-100 rounded-full flex-shrink-0">
              <Sparkles size={14} className="text-orange-500" />
              <span className="text-xs font-bold text-orange-700">积分: {user.integral}</span>
            </div>
          )}
        </header>

        {/* Tab Content */}
        <div className="flex-1 p-4 md:p-10 flex flex-col lg:min-h-0 lg:overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'workspace' ? (
              currentStep === 1 ? (
              <motion.div 
                key="step-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex-1 flex flex-col md:flex-row gap-6 max-w-[960px] mx-auto pb-10 md:pb-0 md:min-h-0 md:h-full md:overflow-hidden justify-center"
              >
                {/* Left: Upload Card */}
                <div className="w-full md:flex-1 flex flex-col shrink-0 md:h-full justify-center">
                  {!originalImage ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-[4/3] md:aspect-auto md:h-[60%] md:max-h-[600px] bg-white rounded-[24px] border-2 border-dashed border-gray-200 hover:border-black hover:bg-gray-50/50 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer group shadow-sm bg-gray-50/20"
                    >
                      <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <Upload className="text-black w-6 h-6" />
                      </div>
                      <div className="text-center px-4">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter">上传香水实拍图</h3>
                        <p className="text-[10px] text-gray-400 font-medium">推荐纯色背景环境</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-6 bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm w-full md:h-[60%] md:max-h-[600px]">
                      <div className="w-full h-full max-h-[300px] bg-gray-50 rounded-xl border p-2 border-gray-100 flex-shrink-0 flex items-center justify-center">
                        <img src={originalImage} className="w-full h-full object-contain" alt="Preview" />
                      </div>
                      <div className="flex flex-col items-center gap-1 w-full">
                        <h4 className="text-sm font-bold text-gray-800 text-center">已载入产品图</h4>
                        <p className="text-xs text-gray-400 text-center mb-2">完成右侧设置后可生成</p>
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="px-6 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold hover:border-black hover:bg-white transition-all w-full max-w-[200px]"
                        >
                          更换图片
                        </button>
                      </div>
                    </div>
                  )}

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 flex items-center justify-center gap-2 text-red-500 text-[10px] font-bold bg-red-50 p-3 rounded-xl border border-red-100 md:max-w-[600px] mx-auto w-full"
                    >
                      <AlertCircle size={14} />
                      {error}
                    </motion.div>
                  )}
                </div>

                {/* Right: AI Style & Output */}
                <div className="w-full md:w-[380px] xl:w-[420px] flex flex-col gap-6 flex-shrink-0 md:h-full md:overflow-y-auto no-scrollbar md:py-6">
                  <div className="bg-white rounded-[24px] border border-gray-50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-6 space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center flex-row gap-2">
                         <Sparkles className="text-indigo-500 w-4 h-4" />
                         <span className="text-xs font-bold text-gray-800">画面风格选择</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {STYLES.map(s => (
                          <button 
                            key={s.id}
                            onClick={() => setStyle(s.id)}
                            className={`px-3 py-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                              style === s.id 
                                ? 'bg-black text-white border-black shadow-md' 
                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-800 hover:text-black'
                            }`}
                          >
                            <ImageIcon size={18} className={style === s.id ? 'opacity-80' : 'opacity-40'} />
                            <span className="text-[11px] font-bold">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-5 pt-2">
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">拍摄视角</label>
                        <div className="flex flex-wrap gap-2">
                          {PERSPECTIVES.map(p => (
                            <button 
                              key={p.id}
                              onClick={() => setPerspective(p.id)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                                perspective === p.id ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50 hover:border-gray-300'
                              }`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">画幅比例</label>
                        <div className="flex flex-wrap gap-2">
                          {RATIOS.map(r => (
                            <button 
                              key={r}
                              onClick={() => setAspectRatio(r)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                                aspectRatio === r ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50 hover:border-gray-300'
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">输出分辨率</label>
                        <div className="flex flex-wrap gap-2">
                          {QUALITIES.map(q => (
                            <button 
                              key={q}
                              onClick={() => setQuality(q)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                                quality === q ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50 hover:border-gray-300'
                              }`}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button 
                        disabled={!originalImage || isGenerating}
                        onClick={handleGenerate}
                        className="w-full h-12 bg-black text-white rounded-xl font-bold text-[13px] transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] shadow-lg disabled:opacity-30"
                      >
                        {isGenerating ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles size={16} />}
                        {isGenerating ? 'AI 构建中...' : '生成商品图'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
              ) : (
              <motion.div 
                key="step-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex-1 flex flex-col md:flex-row gap-6 max-w-[1200px] mx-auto pb-10 md:pb-0 md:min-h-0 md:h-full md:overflow-hidden justify-center"
              >
                {/* Left Column: Preview & History */}
                <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4 md:h-full overflow-hidden">
                  {/* Huge Preview Container */}
                  <div className="flex-1 min-w-0 min-h-0 bg-white rounded-[24px] border border-gray-50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col overflow-hidden relative">
                    <div className="h-10 border-b border-gray-50 bg-white flex items-center justify-between px-5 bg-gradient-to-r from-gray-50/50 to-white">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        渲染预览
                      </span>
                      {backgroundImages.length > 1 && (
                        <div className="flex items-center gap-1.5">
                          {backgroundImages.map((_, i) => (
                             <button 
                               key={i}
                               onClick={() => setActiveBgIndex(i)}
                               className={`w-2 h-2 rounded-full transition-all ${activeBgIndex === i ? 'bg-black w-4' : 'bg-gray-200'}`}
                             />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 w-full bg-gray-50 relative overflow-hidden flex items-center justify-center p-2 outline-none">
                      {isGenerating ? (
                        <div className="text-center space-y-4">
                          <div className="w-10 h-10 relative mx-auto">
                            <div className="absolute inset-0 border-2 border-gray-200 rounded-full" />
                            <motion.div 
                              className="absolute inset-0 border-2 border-black rounded-full border-t-transparent"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                          </div>
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest tracking-[0.2em] font-mono">RENDERING...</p>
                        </div>
                      ) : backgroundImages.length > 0 ? (
                        <div className="w-full h-full flex items-center justify-center relative p-2 md:p-6 cursor-zoom-in" onClick={() => setIsFullScreen(true)}>
                          <div 
                            key={activeHistoryId + '-' + activeBgIndex}
                            className="relative max-w-full max-h-full flex rounded-[16px] overflow-hidden shadow-sm group"
                            style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                          >
                            <div style={{ containerType: 'size' }} className="relative w-full h-full">
                              <img 
                                src={backgroundImages[activeBgIndex]} 
                                alt="Background" 
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              
                              <button 
                                className="absolute top-4 right-4 z-20 p-2 bg-black/10 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
                              >
                                <Maximize2 size={16} />
                              </button>
                              
                              {/* Text Overlay Layer */}
                              <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ color: analysis.textColor }}>
                                {/* Title - Top Center */}
                                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '11.5%', fontSize: '3.5cqi', width: '80%' }}>
                                  <motion.h2 
                                    layoutId="prev-title"
                                    className="font-black uppercase tracking-tight whitespace-pre-line leading-tight"
                                  >
                                    {analysis.title}
                                  </motion.h2>
                                </div>

                                {/* Callout Blocks */}
                                {/* Left */}
                                <div className="absolute flex flex-col gap-[3cqi] items-end" style={{ left: '30%', top: '50%', transform: 'translate(-100%, -50%)', width: '30%' }}>
                                  {analysis.sellingPoints.length >= 1 && (
                                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi]">
                                      <span className="font-bold font-rounded whitespace-pre-line text-right leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[0]}</span>
                                      <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                    </motion.div>
                                  )}
                                </div>
                                
                                {/* Right */}
                                <div className="absolute flex flex-col gap-[3cqi] items-start" style={{ left: '70%', top: '50%', transform: 'translate(0, -50%)', width: '30%' }}>
                                  {analysis.sellingPoints.length === 2 && (
                                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi]">
                                      <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                      <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                                    </motion.div>
                                  )}
                                  {analysis.sellingPoints.length === 3 && (
                                    <>
                                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] -translate-y-[4cqi]">
                                        <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                        <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                                      </motion.div>
                                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] translate-y-[4cqi]">
                                        <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                        <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[2]}</span>
                                      </motion.div>
                                    </>
                                  )}
                                </div>

                                {/* Bottom Info */}
                                <div className="absolute left-1/2 -translate-x-1/2 text-center w-[80%]" style={{ top: '92%', fontSize: '1.8cqi' }}>
                                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-medium font-rounded whitespace-pre-line leading-tight">
                                    {analysis.bottomInfo}
                                  </motion.p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center opacity-[0.03]">
                          <ImageIcon size={100} className="mx-auto" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* History List below Preview */}
                  {history.length > 0 && (
                    <div className="h-28 md:h-32 bg-white rounded-[24px] border border-gray-50 flex-shrink-0 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-4 flex flex-col">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 shrink-0 flex items-center justify-between">
                        历史记录
                      </h4>
                      <div className="flex-1 flex gap-3 overflow-x-auto no-scrollbar items-center">
                        {history.map((record) => {
                           const coverImage = record.backgroundImages?.[0] || record.originalImage;
                           const isSelected = activeHistoryId === record.id;
                           return (
                             <div 
                               key={record.id}
                               className={`h-full aspect-square rounded-xl overflow-hidden relative cursor-pointer flex-shrink-0 border-2 transition-all ${isSelected ? 'border-black' : 'border-gray-100 hover:border-gray-400'}`}
                               onClick={() => {
                                 setActiveHistoryId(record.id);
                                 setOriginalImage(record.originalImage);
                                 setBackgroundImages(record.backgroundImages);
                                 setAnalysis({
                                   title: record.title,
                                   sellingPoints: record.sellingPoints,
                                   bottomInfo: record.bottomInfo,
                                   textColor: record.textColor || '#1f2937'
                                 });
                               }}
                             >
                               <img src={coverImage} className="w-full h-full object-cover" />
                               <button 
                                 className="absolute top-1 right-1 z-20 p-1 bg-black/20 hover:bg-black/60 backdrop-blur-sm rounded-full text-white opacity-0 hover:opacity-100 flex items-center justify-center transition-all"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setActiveHistoryId(record.id);
                                   setOriginalImage(record.originalImage);
                                   setBackgroundImages(record.backgroundImages);
                                   setAnalysis({
                                     title: record.title,
                                     sellingPoints: record.sellingPoints,
                                     bottomInfo: record.bottomInfo,
                                     textColor: record.textColor || '#1f2937'
                                   });
                                   setIsFullScreen(true);
                                 }}
                               >
                                 <Maximize2 size={12} />
                               </button>
                             </div>
                           )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Text & Layout Config */}
                <div className="w-full md:w-[280px] xl:w-[320px] flex flex-col gap-4 flex-shrink-0 md:h-full md:overflow-y-auto no-scrollbar md:pb-10">
                  <button 
                    onClick={() => setCurrentStep(1)} 
                    className="flex items-center gap-2 text-gray-500 hover:text-black hover:bg-gray-50 self-start px-2 py-1 rounded-lg transition-colors text-xs font-bold"
                  >
                    <ArrowLeft size={14} />
                    返回修改配置
                  </button>
                  <div className="bg-white rounded-[24px] border border-gray-50 p-5 space-y-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] opacity-100 transition-opacity">
                    <h3 className="text-[11px] font-bold text-gray-800 flex items-center gap-2 mb-2">
                       当前选用: {PERSPECTIVES.find(p => p.id === perspective)?.name || '-'}
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">排版主标题</label>
                        <textarea 
                          value={analysis.title}
                          onChange={(e) => setAnalysis(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="请输入宣传大字标题"
                          className="w-full p-2.5 bg-gray-50/50 rounded-xl border border-gray-100 focus:ring-1 focus:ring-black outline-none text-[10px] font-bold resize-none h-14 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex justify-between items-center">
                           <span>核心卖点 (1-3个)</span>
                        </label>
                        <div className="grid grid-cols-1 gap-1.5">
                          {analysis.sellingPoints.map((point, idx) => (
                            <div key={idx} className="flex gap-1.5 relative group">
                              <textarea 
                                value={point}
                                onChange={(e) => {
                                  const newPoints = [...analysis.sellingPoints];
                                  newPoints[idx] = e.target.value;
                                  setAnalysis(prev => ({ ...prev, sellingPoints: newPoints }));
                                }}
                                className="flex-1 p-2 bg-gray-50/50 border border-gray-100 rounded-lg text-[9px] font-medium focus:ring-1 focus:ring-black outline-none resize-none h-9 transition-all leading-tight"
                              />
                              <button 
                                onClick={() => {
                                  const newPoints = analysis.sellingPoints.filter((_, i) => i !== idx);
                                  setAnalysis(prev => ({ ...prev, sellingPoints: newPoints }));
                                }}
                                className="absolute right-1 top-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white rounded shadow-sm"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          ))}
                          {analysis.sellingPoints.length < 3 && (
                            <button 
                              onClick={() => setAnalysis(prev => ({ ...prev, sellingPoints: [...prev.sellingPoints, '新增卖点信息...'] }))}
                              className="w-full py-1.5 border border-dashed border-gray-200 rounded-lg text-[9px] font-bold text-gray-400 hover:border-black hover:text-black transition-all bg-gray-50/20"
                            >
                              + 添加卖点参数
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">画面底注 (可选)</label>
                        <textarea 
                          value={analysis.bottomInfo}
                          onChange={(e) => setAnalysis(prev => ({ ...prev, bottomInfo: e.target.value }))}
                          className="w-full p-2.5 bg-gray-50/50 rounded-xl border border-gray-100 focus:ring-1 focus:ring-black outline-none text-[9px] resize-none h-10 transition-all leading-snug"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-gray-50">
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">渲染文字色</label>
                      <div className="flex items-center gap-3 bg-gray-50/30 p-1.5 rounded-xl border border-gray-100">
                        <input 
                          type="color"
                          value={analysis.textColor}
                          onChange={(e) => setAnalysis(prev => ({ ...prev, textColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border-none p-0 overflow-hidden flex-shrink-0"
                        />
                        <span className="text-[10px] font-mono text-gray-600 font-bold">{analysis.textColor}</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    disabled={backgroundImages.length === 0 || isGenerating}
                    onClick={handleDownload}
                    className="w-full h-12 bg-black text-white rounded-[16px] font-bold text-xs transition-all flex items-center justify-center gap-2 hover:scale-[1.02] shadow-xl shadow-black/10 disabled:opacity-30 flex-shrink-0"
                  >
                    <Download size={14} />
                    下载含排版成图
                  </button>
                </div>
              </motion.div>
              )
            ) : activeTab === 'gallery' ? (
              <motion.div 
                key="gallery-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-7xl mx-auto pb-10"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">我的生成记录</h2>
                    <p className="text-sm text-gray-400 mt-1">最近 30 天生成的所有结果图已入库</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if (user) {
                        const images = await saasService.getImages(userId, user.role);
                        setGallery(images);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-all"
                  >
                    <HistoryIcon size={14} />
                    刷新列表
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {gallery.map((img) => (
                    <div key={img.id} className="group relative bg-white rounded-3xl border border-gray-100 p-2 shadow-sm hover:shadow-xl transition-all">
                      <div className="aspect-square rounded-2xl overflow-hidden bg-gray-50 relative">
                        <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button 
                            onClick={() => downloadImage(img.url, img.fileName)}
                            className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform"
                          >
                            <Download size={18} />
                          </button>
                          <button 
                            onClick={async () => {
                              if (confirm('确定要删除这张图片吗？')) {
                                await saasService.deleteImage(img.id, userId, user?.role || 1);
                                setGallery(prev => prev.filter(i => i.id !== img.id));
                              }
                            }}
                            className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center text-red-500 hover:scale-110 transition-transform"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(img.createdAt).toLocaleDateString()}</p>
                        <p className="text-[11px] font-bold text-gray-800 truncate mt-1">{img.fileName.split('/').pop()}</p>
                      </div>
                    </div>
                  ))}
                  {gallery.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-gray-50 rounded-[40px] border border-dashed border-gray-100">
                      <ImageIcon size={40} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-sm font-bold text-gray-300">暂无图片记录</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}</AnimatePresence>
        </div>
      </main>

      {/* Fullscreen Overlay */}
      <AnimatePresence>
        {isFullScreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden p-10"
            onClick={() => setIsFullScreen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center bg-black/50 md:rounded-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setIsFullScreen(false)}
                className="absolute top-4 right-4 z-20 p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all"
              >
                <X size={24} />
              </button>
              <div 
                className="relative max-w-full max-h-full flex shadow-2xl overflow-hidden"
                style={{ aspectRatio: aspectRatio.replace(':', '/') }}
              >
                <div style={{ containerType: 'size' }} className="relative w-full h-full">
                  <img 
                    src={backgroundImages[activeBgIndex]} 
                    alt="Full View" 
                    className="w-full h-full object-cover"
                  />

                  {/* Proportional Text Overlay in Fullscreen */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ color: analysis.textColor }}>
                     {/* Title - Top Center */}
                     <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '11.5%', fontSize: '3.5cqi', width: '80%' }}>
                      <h2 className="font-black uppercase tracking-tight whitespace-pre-line leading-tight">{analysis.title}</h2>
                    </div>

                    {/* Left Side Callouts */}
                    <div className="absolute flex flex-col gap-[3cqi] items-end" style={{ left: '30%', top: '50%', transform: 'translate(-100%, -50%)', width: '30%' }}>
                      {analysis.sellingPoints.length >= 1 && (
                        <div className="flex items-center gap-[1cqi]">
                          <span className="font-bold font-rounded whitespace-pre-line text-right leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[0]}</span>
                          <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                        </div>
                      )}
                    </div>

                    {/* Right Side Callouts */}
                    <div className="absolute flex flex-col gap-[3cqi] items-start" style={{ left: '70%', top: '50%', transform: 'translate(0, -50%)', width: '30%' }}>
                      {analysis.sellingPoints.length === 2 && (
                        <div className="flex items-center gap-[1cqi]">
                          <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                          <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                        </div>
                      )}
                      {analysis.sellingPoints.length === 3 && (
                        <>
                          <div className="flex items-center gap-[1cqi] -translate-y-[4cqi]">
                            <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                            <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                          </div>
                          <div className="flex items-center gap-[1cqi] translate-y-[4cqi]">
                            <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                            <span className="font-bold font-rounded whitespace-pre-line text-left leading-tight" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[2]}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Bottom - Center */}
                    <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '92%', fontSize: '1.8cqi', width: '80%' }}>
                      <p className="font-medium font-rounded whitespace-pre-line leading-tight">{analysis.bottomInfo}</p>
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsFullScreen(false)}
                className="absolute top-10 right-10 p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all z-[110]"
              >
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Quicksand:wght@400;500;600;700&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .font-rounded {
          font-family: 'Quicksand', sans-serif;
        }

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
      `}</style>
    </div>
  );
}
