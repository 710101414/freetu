"use client";
import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react"
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
  const [activeTab, setActiveTab] = useState('preview');
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
        }
      } catch (err) { console.error("初始化失败:", err); }
    };
    initData();
  }, []);

  // --- 【核心找回】粘贴图片监听 ---
  const handlePaste = (event) => {
    const items = event.clipboardData.items;
    let found = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        setSelectedFiles(prev => [...prev, blob]);
        found = true;
      }
    }
    if (found) toast.info("已从剪贴板捕获图片");
  };

  // --- 【核心找回】拖拽图片监听 ---
  const handleDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleUpload = async (file = null, index = null) => {
    if (!isAuthapi || role !== 'admin') return toast.error('请先登录管理员账号');
    setUploading(true);
    const files = file ? [file] : selectedFiles;
    if (files.length === 0) { setUploading(false); return toast.error('无图片可上传'); }

    for (const f of files) {
      const formData = new FormData();
      formData.append('file', f);
      try {
        const res = await fetch(`/api/enableauthapi/${selectedOption}`, { method: 'POST', body: formData });
        if (res.ok) {
          const result = await res.json();
          // 这里的 id 必须对应 D1 里的自增 ID
          const uploadedFile = { id: result.id || result.url, name: f.name || `Pasted-${Date.now()}.png`, url: result.url };
          setUploadedImages(prev => [uploadedFile, ...prev]);
          if (file) {
            setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
          } else {
            setSelectedFiles([]);
          }
        } else { toast.error("上传接口报错，检查数据库表"); }
      } catch (e) { toast.error("网络错误"); }
    }
    setUploading(false);
  };

  const handleDeleteBatch = async () => {
    if (selectedImageIds.length === 0) return toast.warn("未选中图片");
    if (!confirm(`确定删除这 ${selectedImageIds.length} 张记录？`)) return;
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
        toast.success("删除记录成功");
      }
    } catch (e) { toast.error("删除失败"); }
    setUploading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pb-20" onPaste={handlePaste}>
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50">
        <span className="font-bold text-blue-600">我的私人图床</span>
        {isAuthapi ? <LoginButton onClick={() => signOut()}>退出</LoginButton> : <Link href="/login"><LoginButton>登录</LoginButton></Link>}
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        {/* 控制板 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex justify-between items-center border border-slate-100">
          <div>
            <h1 className="text-xl font-black text-slate-800">控制台</h1>
            <p className="text-xs text-slate-400">IP: {IP} | 接口: {selectedOption}</p>
          </div>
          <div className="flex gap-2">
            <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className="border rounded-lg p-2 text-sm bg-slate-50">
              <option value="tgchannel">Telegram</option>
              <option value="r2">R2</option>
            </select>
            <button onClick={() => { setIsManageMode(!isManageMode); setSelectedImageIds([]); }} className={`px-4 py-2 rounded-lg text-sm font-bold ${isManageMode ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>管理模式</button>
          </div>
        </div>

        {/* 待上传区 */}
        <div 
          className="border-4 border-dashed border-slate-200 rounded-3xl bg-white p-6 min-h-[160px] flex flex-wrap gap-4 relative"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <LoadingOverlay loading={uploading} />
          {selectedFiles.map((f, i) => (
            <div key={i} className="w-32 h-40 bg-slate-50 rounded-xl p-2 relative z-20 shadow-sm border">
              <img src={URL.createObjectURL(f)} className="h-28 w-full object-cover rounded-lg" />
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center z-50 shadow-md"
              >
                <FontAwesomeIcon icon={faTimesCircle} />
              </button>
              <button onClick={() => handleUpload(f, i)} className="w-full text-[10px] text-blue-500 mt-1 font-bold">上传</button>
            </div>
          ))}
          {selectedFiles.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <span className="text-sm font-bold">支持 截图粘贴 / 拖拽 / 点击</span>
            </div>
          )}
          <input type="file" multiple className={`absolute inset-0 opacity-0 cursor-pointer ${selectedFiles.length > 0 ? 'z-10' : 'z-30'}`} onChange={(e) => setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)])} />
        </div>

        <button onClick={() => handleUpload()} className="w-full mt-4 bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition">全部上传</button>

        {/* 管理展示区 */}
        <div className="mt-10 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 min-h-[400px]">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <div className="flex gap-2">
              {['preview', 'markdown'].map(t => <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-1 rounded-md text-xs font-bold ${activeTab === t ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-400'}`}>{t.toUpperCase()}</button>)}
            </div>
            {isManageMode && <button onClick={handleDeleteBatch} className="bg-red-50 text-red-600 px-4 py-1 rounded-md text-xs font-bold">删除选中 ({selectedImageIds.length})</button>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {uploadedImages.map((img, i) => (
              <div 
                key={img.id || i}
                onClick={() => isManageMode && setSelectedImageIds(prev => prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                className={`relative p-2 rounded-xl border transition-all cursor-pointer ${selectedImageIds.includes(img.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-100'}`}
              >
                <div className="aspect-square w-full overflow-hidden rounded-lg bg-slate-100 mb-2 relative">
                  <img src={img.url} className="w-full h-full object-cover" />
                  {isManageMode && <FontAwesomeIcon icon={selectedImageIds.includes(img.id) ? faCheckSquare : faSquare} className={`absolute top-2 left-2 text-xl ${selectedImageIds.includes(img.id) ? 'text-blue-500' : 'text-white shadow-sm'}`} />}
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] text-slate-400 truncate w-20 font-mono">{img.url.split('/').pop()}</span>
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(activeTab === 'markdown' ? `![img](${img.url})` : img.url); toast.success('已复制'); }} className="text-slate-300 hover:text-blue-500"><FontAwesomeIcon icon={faCopy} size="sm" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={2000} />
      <div className="mt-10"><Footer /></div>
    </main>
  );
}
