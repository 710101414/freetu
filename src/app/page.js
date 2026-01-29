"use client";
import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { faImages, faTrashAlt, faUpload, faCopy, faCheckSquare, faSquare, faUserShield, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Footer from '@/components/Footer'
import Link from "next/link";
import LoadingOverlay from "@/components/LoadingOverlay";

const LoginButton = ({ onClick, children }) => (
  <button onClick={onClick} className="px-4 py-2 mx-2 bg-blue-500 text-white rounded-xl font-medium shadow-sm hover:bg-blue-600 transition">{children}</button>
);

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [IP, setIP] = useState('');
  const [Total, setTotal] = useState('?');
  const [selectedOption, setSelectedOption] = useState('tgchannel'); 
  const [isAuthapi, setIsAuthapi] = useState(false); 
  const [role, setRole] = useState(''); 
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState([]);

  useEffect(() => {
    const initData = async () => {
      try {
        const [ipRes, totalRes, authRes] = await Promise.all([
          fetch('/api/ip'),
          fetch('/api/total'),
          fetch('/api/enableauthapi/isauth')
        ]);
        if (ipRes.ok) setIP((await ipRes.json()).ip);
        if (totalRes.ok) setTotal((await totalRes.json()).total);
        if (authRes.ok) {
          const authData = await authRes.json();
          setIsAuthapi(true);
          setRole(authData.role);
        } else {
          setIsAuthapi(false);
        }
      } catch (err) { console.error("初始化失败:", err); }
    };
    initData();
  }, []);

  // 监听粘贴事件
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          setSelectedFiles(prev => [...prev, blob]);
          toast.info("已捕获剪贴板图片");
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const handleUpload = async (file = null, index = null) => {
    if (!isAuthapi || role !== 'admin') return toast.error('权限不足：请先登录管理员账号');
    setUploading(true);
    const files = file ? [file] : selectedFiles;
    if (files.length === 0) { setUploading(false); return toast.error('请选择图片'); }

    for (const f of files) {
      const formData = new FormData();
      formData.append('file', f);
      try {
        const res = await fetch(`/api/enableauthapi/${selectedOption}`, { method: 'POST', body: formData });
        const result = await res.json();
        if (res.ok) {
          const uploadedFile = { id: result.id || result.url, name: f.name || `img-${Date.now()}.png`, url: result.url };
          setUploadedImages(prev => [uploadedFile, ...prev]);
          if (file) {
            setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
          } else {
            setSelectedFiles([]);
          }
        } else { toast.error(`上传失败: ${result.message}`); }
      } catch (e) { toast.error('API错误，请检查数据库'); }
    }
    setUploading(false);
  };

  const handleDeleteBatch = async () => {
    if (selectedImageIds.length === 0) return toast.warn("请选择记录");
    if (!confirm(`确定删除选中的 ${selectedImageIds.length} 张图片记录？`)) return;
    setUploading(true);
    try {
      const res = await fetch('/api/enableauthapi/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedImageIds })
      });
      if (res.ok) {
        setUploadedImages(prev => prev.filter(img => !selectedImageIds.includes(img.id)));
        setSelectedImageIds([]);
        setIsManageMode(false);
        toast.success("记录已成功移除");
      }
    } catch (e) { toast.error("请求失败"); }
    setUploading(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板', { autoClose: 800 });
  };

  // --- 核心修复：渲染类似 Gifyu 的垂直外链列表 ---
  const LinkItem = ({ label, value }) => (
    <div className="grid grid-cols-4 items-center gap-4 mb-3">
      <span className="col-span-1 text-right text-sm font-bold text-slate-700">{label}</span>
      <div className="col-span-3">
        <input 
          readOnly 
          value={value} 
          onClick={(e) => { e.target.select(); handleCopy(value); }}
          className="w-full p-2 bg-slate-100 border border-slate-200 rounded text-xs font-mono text-slate-600 cursor-pointer hover:bg-white hover:border-blue-300 transition-all outline-none"
        />
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pb-20">
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50 shadow-sm">
        <span className="font-bold text-lg text-blue-600 tracking-tight">私人图床终端</span>
        <div className="flex items-center">
          {isAuthapi ? <LoginButton onClick={() => signOut({ callbackUrl: '/' })}>登出({role})</LoginButton> : <Link href="/login"><LoginButton>管理登录</LoginButton></Link>}
        </div>
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        {/* 控制面板 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex justify-between items-center border">
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight italic">UPLOADER</h1>
            <p className="text-xs text-slate-400">托管: {Total} | IP: {IP}</p>
          </div>
          <div className="flex gap-2">
            <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className="border rounded-lg p-2 text-xs bg-slate-50 font-bold outline-none">
              <option value="tgchannel">Telegram 频道</option>
              <option value="r2">Cloudflare R2</option>
            </select>
            <button onClick={() => { setIsManageMode(!isManageMode); setSelectedImageIds([]); }} className={`px-4 py-2 rounded-lg text-xs font-bold transition ${isManageMode ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}>批量管理</button>
          </div>
        </div>

        {/* 待上传队列 */}
        <div 
          className="border-4 border-dashed border-slate-200 rounded-[2rem] bg-white p-8 min-h-[160px] flex flex-wrap gap-4 relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
        >
          <LoadingOverlay loading={uploading} />
          {selectedFiles.map((f, i) => (
            <div key={i} className="w-32 h-44 bg-slate-50 rounded-2xl p-2 flex flex-col shadow-sm border relative z-20">
              <img src={URL.createObjectURL(f)} className="h-28 w-full object-cover rounded-xl" />
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, idx) => idx !== i)); }} 
                className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center z-50 shadow-lg cursor-pointer"
              >
                <FontAwesomeIcon icon={faTimesCircle} />
              </button>
              <button onClick={() => handleUpload(f, i)} className="mt-auto text-blue-600 text-[10px] font-bold hover:bg-white rounded py-1">上传此张</button>
            </div>
          ))}
          {selectedFiles.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <FontAwesomeIcon icon={faImages} size="3x" className="mb-2 opacity-10" />
              <p className="text-sm font-bold tracking-widest">支持 截图粘贴 / 拖拽 / 点击</p>
            </div>
          )}
          <input type="file" multiple className={`absolute inset-0 opacity-0 cursor-pointer ${selectedFiles.length > 0 ? 'z-10' : 'z-30'}`} onChange={(e) => setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)])} />
        </div>

        {selectedFiles.length > 0 && (
          <button onClick={() => handleUpload()} className="w-full mt-4 bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg transition active:scale-95">开始全部上传</button>
        )}

        {/* 结果展示与批量管理区 */}
        <div className="mt-10 bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 min-h-[400px]">
          <div className="flex justify-between items-center mb-10 border-b pb-4">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              嵌入代码 {isManageMode && <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded text-[10px]">管理模式已开启</span>}
            </h2>
            {isManageMode && <button onClick={handleDeleteBatch} className="bg-red-50 text-red-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition">确认删除选中记录 ({selectedImageIds.length})</button>}
          </div>

          <div className="space-y-12">
            {uploadedImages.length === 0 && <p className="text-center text-slate-300 italic py-10">暂无上传数据</p>}
            {uploadedImages.map((img, i) => (
              <div 
                key={img.id || i} 
                className={`relative flex flex-col md:flex-row gap-8 p-6 rounded-3xl border transition-all ${selectedImageIds.includes(img.id) ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-100' : 'border-slate-50 bg-slate-50/30'}`}
              >
                {/* 左侧预览图与勾选 */}
                <div 
                  className="w-full md:w-48 h-48 rounded-2xl overflow-hidden shadow-sm border-2 border-white relative cursor-pointer"
                  onClick={() => isManageMode && setSelectedImageIds(prev => prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                >
                  <img src={img.url} className="w-full h-full object-cover" loading="lazy" />
                  {isManageMode && (
                    <div className="absolute top-2 left-2">
                      <FontAwesomeIcon icon={selectedImageIds.includes(img.id) ? faCheckSquare : faSquare} className={`text-2xl ${selectedImageIds.includes(img.id) ? 'text-blue-500' : 'text-white/80 drop-shadow-md'}`} />
                    </div>
                  )}
                </div>

                {/* 右侧垂直外链列表 - 核心修复点 */}
                <div className="flex-1">
                  <LinkItem label="图片链接" value={img.url} />
                  <LinkItem label="HTML" value={`<a href="${img.url}" target="_blank"><img src="${img.url}"></a>`} />
                  <LinkItem label="BBCode" value={`[url=${img.url}][img]${img.url}[/img][/url]`} />
                  <LinkItem label="Markdown" value={`![image](${img.url})`} />
                  <LinkItem label="图片URL链接" value={img.url} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={2000} />
      <div className="mt-10 opacity-20"><Footer /></div>
    </main>
  );
}
