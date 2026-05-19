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
  X
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
  const [activeTab, setActiveTab] = useState<'step2' | 'step3' | 'gallery'>('step2');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
        setActiveTab('step2');
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
    setActiveTab('step3'); 
    setActiveBgIndex(0);
    setActiveHistoryId(null);
    
    try {
      // SaaS Verify
      await saasService.verify(userId, toolId);

      const promptStyle = STYLES.find(s => s.id === style)?.prompt || '';
      
      // 1. Analyze the product first
      const analysisResult = await analyzeProductImage(originalImage);
      setAnalysis(analysisResult);

      // 2. Generate 3 perspectives
      const bgImages: string[] = [];
      for (const p of PERSPECTIVES) {
        const bg = await generateEcommerceImage(
          originalImage,
          '',
          '',
          promptStyle,
          aspectRatio,
          quality,
          p.prompt
        );
        bgImages.push(bg);
        
        // SaaS Save (Consume -> Upload -> Commit) for each image
        try {
          // Convert dataURL to Blob
          const res = await fetch(bg);
          const blob = await res.blob();
          await saasService.saveResultImage(userId, toolId, blob, `perfume_${Date.now()}.png`);
        } catch (saveErr) {
          console.error("SaaS save failed for one image:", saveErr);
        }

        // Add a tiny delay between requests to be safe
        await new Promise(r => setTimeout(r, 1000));
      }

      setBackgroundImages(bgImages);
      
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
      setActiveTab('step2');
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
    <div className="flex w-full min-h-screen bg-white text-gray-900 font-sans overflow-x-hidden">
      {/* Hidden Global File Input */}
      <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />

      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar: Step 1 & History */}
      <aside className={`
        fixed inset-y-0 left-0 z-[70] w-72 md:w-80 border-r border-gray-50 flex flex-col bg-[#F9FAFB] transition-transform duration-300 lg:static lg:translate-x-0 lg:flex-shrink-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="p-4 md:p-6 border-b border-gray-50 bg-white flex justify-between items-center">
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 bg-black rounded flex items-center justify-center text-[10px] text-white font-bold">1</div>
            <span className="text-[11px] font-bold text-gray-800 uppercase tracking-wider">香水上传与分析</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-gray-400 hover:text-black"
          >
            <X size={20} />
          </button>
        </div>

          <div className="space-y-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative aspect-square rounded-2xl border border-dashed transition-all cursor-pointer group flex flex-col items-center justify-center overflow-hidden bg-white ${
                originalImage ? 'border-gray-200' : 'border-gray-200 hover:border-black hover:bg-gray-50'
              }`}
            >
              {originalImage ? (
                <img src={originalImage} alt="Product" className="w-full h-full object-contain p-4" />
              ) : (
                <div className="text-center p-6">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Upload className="text-gray-400 w-5 h-5" />
                  </div>
                  <p className="text-[11px] font-bold text-gray-400">点击上传产品原图</p>
                  <p className="text-[9px] text-gray-300 mt-1">支持 JPG, PNG</p>
                </div>
              )}
            </div>
          </div>

        {/* History Section */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">历史记录图集</h3>
          <div className="space-y-4">
            {history.map((item) => (
              <div 
                key={item.id}
                className={`group relative bg-white p-3 rounded-2xl border transition-all shadow-sm ${
                  activeHistoryId === item.id ? 'border-black ring-1 ring-black' : 'border-gray-100 hover:border-black'
                }`}
              >
                <div className="grid grid-cols-3 gap-1 mb-2">
                  {item.backgroundImages.slice(0, 3).map((bg, idx) => (
                    <div 
                      key={idx} 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOriginalImage(item.originalImage);
                        setBackgroundImages(item.backgroundImages);
                        setAnalysis({ 
                          title: item.title, 
                          sellingPoints: item.sellingPoints,
                          bottomInfo: item.bottomInfo,
                          textColor: item.textColor || '#000000'
                        });
                        setActiveBgIndex(idx);
                        setActiveHistoryId(item.id);
                        setActiveTab('step3');
                      }}
                      className={`aspect-square rounded-md overflow-hidden bg-gray-50 border cursor-pointer hover:scale-105 transition-transform ${
                        activeHistoryId === item.id && activeBgIndex === idx ? 'border-black border-2' : 'border-gray-100'
                      }`}
                    >
                      <img src={bg} alt="H" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                <div 
                  onClick={() => {
                    setOriginalImage(item.originalImage);
                    setBackgroundImages(item.backgroundImages);
                    setAnalysis({ 
                      title: item.title, 
                      sellingPoints: item.sellingPoints,
                      bottomInfo: item.bottomInfo,
                      textColor: item.textColor || '#000000'
                    });
                    setActiveBgIndex(0);
                    setActiveHistoryId(item.id);
                    setActiveTab('step3');
                  }}
                  className="flex items-center justify-between px-1 cursor-pointer"
                >
                  <p className="text-[10px] font-bold truncate text-gray-600">{item.title}</p>
                  <span className="text-[8px] text-gray-400 font-medium"> 系列 (3张) </span>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-[10px] text-gray-300 text-center py-10 font-medium">暂无历史</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-white min-h-screen">
        {/* Navigation Tabs */}
        <header className="h-14 md:h-16 border-b border-gray-50 flex items-center px-4 md:px-10 gap-6 md:gap-12 flex-shrink-0 sticky top-0 bg-white/80 backdrop-blur-sm z-10 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-400 hover:text-black flex-shrink-0"
          >
            <HistoryIcon size={18} />
          </button>

          <button 
            onClick={() => setActiveTab('step2')}
            className={`h-full flex items-center gap-2 relative transition-colors flex-shrink-0 ${
              activeTab === 'step2' ? 'text-black font-bold' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-xs md:text-sm">参数设置</span>
            {activeTab === 'step2' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#FF6B00]" />}
          </button>
          <button 
            disabled={backgroundImages.length === 0 && !isGenerating}
            onClick={() => setActiveTab('step3')}
            className={`h-full flex items-center gap-2 relative transition-colors disabled:opacity-30 flex-shrink-0 ${
              activeTab === 'step3' ? 'text-black font-bold' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-xs md:text-sm">生成结果</span>
            {activeTab === 'step3' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#FF6B00]" />}
          </button>

          <button 
            onClick={() => setActiveTab('gallery')}
            className={`h-full flex items-center gap-2 relative transition-colors flex-shrink-0 ${
              activeTab === 'gallery' ? 'text-black font-bold' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-xs md:text-sm">图片库</span>
            {activeTab === 'gallery' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#FF6B00]" />}
          </button>

          <div className="ml-auto hidden sm:flex items-center gap-6 flex-shrink-0">
            {user && (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-orange-50 rounded-full border border-orange-100">
                <Sparkles className="text-orange-500 w-3.5 h-3.5" />
                <span className="text-[10px] md:text-xs font-bold text-orange-700">{user.integral}</span>
              </div>
            )}
          </div>
        </header>

        {/* Mobile Header Balance Display */}
        {user && (
          <div className="sm:hidden px-4 py-2 bg-orange-50/50 border-b border-orange-100 flex justify-center items-center gap-2">
            <Sparkles size={12} className="text-orange-500" />
            <span className="text-[10px] font-bold text-orange-700 uppercase tracking-widest">可用积分: {user.integral}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 p-4 md:p-10 flex flex-col">
          <AnimatePresence mode="wait">
            {activeTab === 'step2' ? (
              <motion.div 
                key="step2-content"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="w-full flex flex-col space-y-4 md:space-y-8 max-w-7xl mx-auto pb-10"
              >
                {/* Central Upload Block when no image */}
                {!originalImage ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-square md:aspect-[2/1] bg-white rounded-[32px] md:rounded-[48px] border-2 border-dashed border-gray-100 hover:border-black hover:bg-gray-50/20 transition-all flex flex-col items-center justify-center gap-6 cursor-pointer group shadow-[0_8px_30px_rgb(0,0,0,0.02)] mb-4"
                  >
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-gray-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      <Upload className="text-black w-8 h-8 md:w-10 md:h-10" />
                    </div>
                    <div className="text-center px-8">
                      <h3 className="text-xl md:text-2xl font-black text-gray-900 uppercase tracking-tighter">第 1 步：上传香水实拍图</h3>
                      <p className="text-[10px] md:text-sm text-gray-400 font-medium max-w-sm mx-auto mt-3">建议使用纯色背景、光线明亮的产品实拍图<br />AI 将智能分离主体并为您构建 3 个系列化高级渲染场景</p>
                    </div>
                    
                    <div className="mt-4 flex gap-4">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <CheckCircle2 size={12} className="text-green-500" />
                        高清分离
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <CheckCircle2 size={12} className="text-green-500" />
                        动态排版
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 bg-gray-50/50 p-4 rounded-3xl border border-gray-100 mb-2">
                    <div className="w-14 h-14 bg-white rounded-xl border p-1 border-gray-100 flex-shrink-0">
                      <img src={originalImage} className="w-full h-full object-contain" alt="Preview" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-gray-800">已载入产品图</h4>
                      <p className="text-[10px] text-gray-400">点击下方风格即可启动全景渲染</p>
                    </div>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-bold hover:border-black transition-all"
                    >
                      更换原图
                    </button>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 text-red-500 text-xs font-bold bg-red-50 p-4 rounded-2xl border border-red-100 mb-4"
                  >
                    <AlertCircle size={16} />
                    {error}
                  </motion.div>
                )}

                {/* Visual Style Selection */}
                <div className="bg-white rounded-[32px] border border-gray-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 md:p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center">
                      <Sparkles className="text-indigo-500 w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-gray-800">选择画面风格</h3>
                      <p className="text-[10px] text-gray-400 font-medium">AI 将为您构建纯净渲染背景</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    {STYLES.map(s => (
                      <button 
                        key={s.id}
                        onClick={() => setStyle(s.id)}
                        className={`px-3 py-6 md:py-8 rounded-2xl border transition-all flex flex-col items-center gap-3 ${
                          style === s.id 
                            ? 'bg-black text-white border-black shadow-xl' 
                            : 'bg-white text-gray-400 border-gray-100 hover:border-black hover:text-black'
                        }`}
                      >
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center ${style === s.id ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-gray-100'}`}>
                          <ImageIcon size={18} />
                        </div>
                        <span className="text-[11px] md:text-xs font-bold">{s.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Settings Card */}
                <div className="bg-white rounded-[32px] border border-gray-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 md:p-8 space-y-8 md:space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-20">
                    <div className="space-y-4">
                      <label className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">画幅比例选择</label>
                      <div className="flex flex-wrap gap-2">
                        {RATIOS.map(r => (
                          <button 
                            key={r}
                            onClick={() => setAspectRatio(r)}
                            className={`flex-1 min-w-[60px] py-2 md:py-2.5 rounded-lg text-xs font-bold border transition-all ${
                              aspectRatio === r ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50 hover:border-gray-300'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">输出分辨率</label>
                      <div className="flex flex-wrap gap-2">
                        {QUALITIES.map(q => (
                          <button 
                            key={q}
                            onClick={() => setQuality(q)}
                            className={`flex-1 min-w-[60px] py-2 md:py-2.5 rounded-lg text-xs font-bold border transition-all ${
                              quality === q ? 'bg-black text-white border-black' : 'border-gray-100 text-gray-400 bg-gray-50 hover:border-gray-300'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button 
                    disabled={!originalImage || isGenerating}
                    onClick={handleGenerate}
                    className="w-full h-14 md:h-16 bg-black text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.99] shadow-2xl shadow-black/10 disabled:opacity-30"
                  >
                    {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles size={20} />}
                    {isGenerating ? '正在拼命分析生成中...' : '立即生成 3 个系列视角'}
                  </button>
                </div>
              </motion.div>
            ) : activeTab === 'step3' ? (
              <motion.div 
                key="step3-content"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="w-full flex flex-col lg:flex-row gap-6 md:gap-8 max-w-7xl mx-auto pb-10"
              >
                {/* Left: Preview with Overlay */}
                <div className="flex-1 bg-[#F9FAFB] rounded-[32px] md:rounded-[40px] border border-gray-50 flex flex-col overflow-hidden relative group shadow-sm bg-white min-h-[400px] md:min-h-0">
                  <div className="h-12 md:h-14 border-b bg-white flex items-center justify-between px-6 md:px-10">
                    <span className="text-[9px] md:text-[10px] font-black text-gray-300 uppercase tracking-widest">效果预览 (含动态排版)</span>
                  </div>

                  <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-hidden relative">
                    {isGenerating ? (
                      <div className="text-center space-y-4">
                        <div className="w-12 h-12 md:w-16 md:h-16 mx-auto relative">
                          <div className="absolute inset-0 border-2 border-gray-100 rounded-full" />
                          <motion.div 
                            className="absolute inset-0 border-2 border-black rounded-full border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                          />
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-black uppercase tracking-widest px-4 text-center">AI 正在全力构建中...</p>
                      </div>
                    ) : backgroundImages.length > 0 ? (
                      <div 
                        key={activeHistoryId + '-' + activeBgIndex}
                        className="relative w-full h-full flex items-center justify-center shadow-xl md:shadow-2xl rounded-2xl overflow-hidden bg-gray-50"
                        style={{ containerType: 'size' }}
                      >
                        <img 
                          src={backgroundImages[activeBgIndex]} 
                          alt="Background" 
                          className="w-full h-full object-contain cursor-pointer" 
                          onClick={() => setIsFullScreen(true)}
                        />
                        
                        <button 
                          onClick={() => setIsFullScreen(true)}
                          className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all pointer-events-auto opacity-0 group-hover:opacity-100"
                        >
                          <Maximize2 size={20} />
                        </button>
                        
                        {/* Pattern-based Text Overlay - Proportional Synchronization */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ color: analysis.textColor }}>
                          {/* Title - Top Center */}
                          <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '11.5%', fontSize: '3.5cqi', width: '80%' }}>
                            <motion.h2 
                              layoutId="prev-title"
                              className="font-black uppercase tracking-tight whitespace-pre-line"
                            >
                              {analysis.title}
                            </motion.h2>
                          </div>

                          {/* Left Side Callouts */}
                          <div className="absolute flex flex-col gap-[3cqi] items-end" style={{ left: '30%', top: '50%', transform: 'translate(-100%, -50%)', width: '30%' }}>
                            {analysis.sellingPoints.length >= 1 && (
                              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi]">
                                <span className="font-bold font-rounded whitespace-pre-line text-right" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[0]}</span>
                                <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                              </motion.div>
                            )}
                          </div>

                          {/* Right Side Callouts */}
                          <div className="absolute flex flex-col gap-[3cqi] items-start" style={{ left: '70%', top: '50%', transform: 'translate(0, -50%)', width: '30%' }}>
                            {analysis.sellingPoints.length === 2 && (
                              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi]">
                                <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                <span className="font-bold font-rounded whitespace-pre-line text-left" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                              </motion.div>
                            )}
                            {analysis.sellingPoints.length === 3 && (
                              <>
                                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] -translate-y-[4cqi]">
                                  <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                  <span className="font-bold font-rounded whitespace-pre-line text-left" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                                </motion.div>
                                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-[1cqi] translate-y-[4cqi]">
                                  <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                                  <span className="font-bold font-rounded whitespace-pre-line text-left" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[2]}</span>
                                </motion.div>
                              </>
                            )}
                          </div>

                          {/* Bottom - Center */}
                          <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '92%', fontSize: '1.8cqi', width: '80%' }}>
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-medium font-rounded whitespace-pre-line">
                              {analysis.bottomInfo}
                            </motion.p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center opacity-20">
                        <ImageIcon size={64} className="mx-auto" />
                        <p className="text-xs font-bold uppercase mt-4">等待生成</p>
                      </div>
                    )}

                    {/* Text Adjustment is on the right */}
                  </div>
                </div>

                {/* Right: Text Adjustment */}
                <div className="w-full lg:w-96 flex flex-col gap-6">
                  <div className="bg-white rounded-[32px] border border-gray-100 p-6 md:p-8 space-y-6 shadow-sm">
                    <h3 className="text-xs md:text-sm font-bold text-gray-800 flex items-center gap-2">
                      <Sparkles size={16} className="text-orange-500" />
                      当前视角: {PERSPECTIVES[activeBgIndex]?.name}
                    </h3>
                    
                    <div className="space-y-4 md:space-y-6">
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">广告主标题</label>
                        <textarea 
                          value={analysis.title}
                          onChange={(e) => setAnalysis(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-1 focus:ring-black outline-none text-xs md:text-sm font-bold resize-none h-16 md:h-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">产品核心卖点 (1-3个)</label>
                        <div className="grid grid-cols-1 gap-2">
                          {analysis.sellingPoints.map((point, idx) => (
                            <div key={idx} className="flex gap-2">
                              <textarea 
                                value={point}
                                onChange={(e) => {
                                  const newPoints = [...analysis.sellingPoints];
                                  newPoints[idx] = e.target.value;
                                  setAnalysis(prev => ({ ...prev, sellingPoints: newPoints }));
                                }}
                                className="flex-1 p-2 bg-gray-50 rounded-lg text-xs font-medium border-none focus:ring-1 focus:ring-black outline-none resize-none h-10 md:h-12"
                              />
                              <button 
                                onClick={() => {
                                  const newPoints = analysis.sellingPoints.filter((_, i) => i !== idx);
                                  setAnalysis(prev => ({ ...prev, sellingPoints: newPoints }));
                                }}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          {analysis.sellingPoints.length < 3 && (
                            <button 
                              onClick={() => setAnalysis(prev => ({ ...prev, sellingPoints: [...prev.sellingPoints, '新增卖点'] }))}
                              className="w-full py-2.5 border border-dashed border-gray-200 rounded-lg text-[10px] text-gray-400 hover:border-black hover:text-black transition-all"
                            >
                              + 添加卖点
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">底部补充信息</label>
                        <textarea 
                          value={analysis.bottomInfo}
                          onChange={(e) => setAnalysis(prev => ({ ...prev, bottomInfo: e.target.value }))}
                          className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-1 focus:ring-black outline-none text-xs resize-none h-12 md:h-16"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">全局字体颜色</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="color"
                          value={analysis.textColor}
                          onChange={(e) => setAnalysis(prev => ({ ...prev, textColor: e.target.value }))}
                          className="w-10 h-10 md:w-12 md:h-12 rounded-xl cursor-pointer border-none p-0 overflow-hidden"
                        />
                        <span className="text-xs font-mono text-gray-400">{analysis.textColor}</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    disabled={backgroundImages.length === 0 || isGenerating}
                    onClick={handleDownload}
                    className="w-full h-14 md:h-16 bg-black text-white rounded-2xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-3 hover:scale-[1.02] shadow-xl shadow-black/10 disabled:opacity-30 mb-8"
                  >
                    <Download size={20} />
                    下载当前视角 (含动态排版)
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="gallery-content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
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
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button 
                            onClick={() => downloadImage(img.url, img.fileName)}
                            className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform"
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
                            className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-red-500 hover:scale-110 transition-transform"
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
            )}
          </AnimatePresence>
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
              <img 
                src={backgroundImages[activeBgIndex]} 
                alt="Full View" 
                className="w-full h-full object-contain shadow-2xl"
              />

              {/* Proportional Text Overlay in Fullscreen */}
              <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ color: analysis.textColor, containerType: 'size' }}>
                 {/* Title - Top Center */}
                 <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '11.5%', fontSize: '3.5cqi', width: '80%' }}>
                  <h2 className="font-black uppercase tracking-tight whitespace-pre-line">{analysis.title}</h2>
                </div>

                {/* Left Side Callouts */}
                <div className="absolute flex flex-col gap-[3cqi] items-end" style={{ left: '30%', top: '50%', transform: 'translate(-100%, -50%)', width: '30%' }}>
                  {analysis.sellingPoints.length >= 1 && (
                    <div className="flex items-center gap-[1cqi]">
                      <span className="font-bold font-rounded whitespace-pre-line text-right" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[0]}</span>
                      <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                    </div>
                  )}
                </div>

                {/* Right Side Callouts */}
                <div className="absolute flex flex-col gap-[3cqi] items-start" style={{ left: '70%', top: '50%', transform: 'translate(0, -50%)', width: '30%' }}>
                  {analysis.sellingPoints.length === 2 && (
                    <div className="flex items-center gap-[1cqi]">
                      <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                      <span className="font-bold font-rounded whitespace-pre-line text-left" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                    </div>
                  )}
                  {analysis.sellingPoints.length === 3 && (
                    <>
                      <div className="flex items-center gap-[1cqi] -translate-y-[4cqi]">
                        <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                        <span className="font-bold font-rounded whitespace-pre-line text-left" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[1]}</span>
                      </div>
                      <div className="flex items-center gap-[1cqi] translate-y-[4cqi]">
                        <div className="rounded-full flex-shrink-0" style={{ backgroundColor: analysis.textColor, width: '0.8cqi', height: '0.8cqi' }} />
                        <span className="font-bold font-rounded whitespace-pre-line text-left" style={{ fontSize: '2.5cqi' }}>{analysis.sellingPoints[2]}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Bottom - Center */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '92%', fontSize: '1.8cqi', width: '80%' }}>
                  <p className="font-medium font-rounded whitespace-pre-line">{analysis.bottomInfo}</p>
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
