"use client";
import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react"
import Image from "next/image";
import { faImages, faTrashAlt, faUpload, faCopy, faLink } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Footer from '@/components/Footer'
import Link from "next/link";
import LoadingOverlay from "@/components/LoadingOverlay";

const LoginButton = ({ onClick, children }) => (
  <button onClick={onClick} className="px-4 py-2 mx-2 bg-blue-500 text-white rounded font-medium shadow-sm hover:bg-blue-600 transition">{children}</button>
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
  const parentRef = useRef(null);

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

  // --- 核心功能：截图粘贴上传 ---
  const handlePaste = (event) => {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        setSelectedFiles(prev => [...prev, blob]);
        toast.info("已读取剪贴板图片");
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleUpload = async (file = null) => {
    if (!isAuthapi || role !== 'admin') {
      return toast.error('权限不足：仅限管理员上传');
    }
    setUploading(true);
    const files = file ? [file] : selectedFiles;
    if (files.length === 0) {
      setUploading(false);
      return toast.error('请先选择或粘贴图片');
    }

    for (const f of files) {
      const formData = new FormData();
      formData.append('file', f);
      try {
        const res = await fetch(`/api/enableauthapi/${selectedOption}`, { method: 'POST', body: formData });
        const result = await res.json();
        if (res.ok) {
          const uploadedFile = { name: f.name || `粘贴图片-${Date.now()}.png`, url: result.url, type: f.type };
          setUploadedImages(prev => [uploadedFile, ...prev]);
          setSelectedFiles(prev => prev.filter(item => item !== f));
        } else {
          toast.error(`上传失败: ${result.message || '服务器内部错误'}`);
        }
      } catch (e) { toast.error('接口连接失败，请检查D1数据库绑定'); }
    }
    setUploading(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('链接已复制', { autoClose: 800 });
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pb-20" onPaste={handlePaste}>
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50 shadow-sm">
        <span className="font-bold text-lg text-blue-600 tracking-tight">私人云端图床</span>
        {isAuthapi ? <LoginButton onClick={() => signOut()}>退出登录</LoginButton> : <Link href="/login"><LoginButton>管理登录</LoginButton></Link>}
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex justify-between items-center border border-slate-100">
          <div>
            <h1 className="text-2xl font-black text-slate-800">上传控制台</h1>
            <p className="text-sm text-slate-400 mt-1">总量: <span className="text-blue-500 font-bold">{Total}</span> | 您的IP: {IP}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold text-slate-300 uppercase">存储接口</span>
            <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className="border-2 border-slate-100 rounded-xl p-2 bg-slate-50 outline-none text-sm font-bold text-slate-700 focus:border-blue-500 transition-all">
              <option value="tgchannel">Telegram 频道</option>
              <option value="r2">Cloudflare R2</option>
            </select>
          </div>
        </div>

        <div 
          className="border-4 border-dashed border-slate-200 rounded-[2rem] bg-white p-8 min-h-[320px] flex flex-wrap gap-6 relative transition-all hover:border-blue-300 hover:bg-blue-50/30"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <LoadingOverlay loading={uploading} />
          {selectedFiles.map((f, i) => (
            <div key={i} className="w-40 h-52 bg-white border border-slate-100 rounded-2xl p-3 flex flex-col shadow-sm animate-in fade-in zoom-in duration-300">
              <div className="h-32 w-full relative overflow-hidden rounded-xl">
                <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" />
              </div>
              <div className="mt-auto flex justify-center gap-4 pt-2">
                <button onClick={() => setSelectedFiles(selectedFiles.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 transition"><FontAwesomeIcon icon={faTrashAlt} /></button>
                <button onClick={() => handleUpload(f)} className="text-blue-500 hover:text-blue-700 transition"><FontAwesomeIcon icon={faUpload} /></button>
              </div>
            </div>
          ))}
          {selectedFiles.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <FontAwesomeIcon icon={faImages} size="4x" className="mb-4 opacity-5" />
              <span className="font-bold text-slate-400">支持 截图粘贴 / 拖拽上传 / 点击选择</span>
              <span className="text-xs mt-2 opacity-50">仅限管理员模式上传</span>
            </div>
          )}
          <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setSelectedFiles(Array.from(e.target.files))} />
        </div>

        <button onClick={() => handleUpload()} className="w-full mt-6 bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">确认上传全部图片</button>
        
        <div className="mt-12 bg-white rounded-[2rem] p-8 shadow-sm border border-slate-50">
          <div className="flex gap-2 mb-8 border-b border-slate-50 pb-4 overflow-x-auto no-scrollbar">
            {[
              { id: 'preview', label: '预览视图' },
              { id: 'url', label: 'URL' },
              { id: 'markdown', label: 'MARKDOWN' },
              { id: 'html', label: 'HTML' },
              { id: 'bbcode', label: 'BBCODE' }
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-500 text-white shadow-lg shadow-blue-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                {tab.label}
              </button>
            ))}
          </div>
          
          <div className="space-y-6">
            {uploadedImages.length === 0 && <p className="text-center text-slate-300 py-10 italic text-sm">暂无上传数据</p>}
            {uploadedImages.map((img, i) => (
              <div key={i} className="flex gap-5 p-4 bg-slate-50 rounded-2xl items-center border border-slate-100 group animate-in slide-in-from-bottom-4 duration-500">
                <img src={img.url} className="w-24 h-24 object-cover rounded-xl shadow-md border-2 border-white" />
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  {activeTab === 'preview' ? (
                    <>
                      <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 cursor-pointer hover:border-blue-400 transition" onClick={() => handleCopy(img.url)}>
                        <FontAwesomeIcon icon={faLink} className="text-blue-500 text-[10px]" />
                        <span className="text-[10px] truncate text-slate-600 font-mono">{img.url}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 cursor-pointer hover:border-blue-400 transition" onClick={() => handleCopy(`![img](${img.url})`)}>
                        <FontAwesomeIcon icon={faCopy} className="text-slate-400 text-[10px]" />
                        <span className="text-[10px] truncate text-slate-400 font-mono">![img]({img.url})</span>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white p-3 border border-slate-200 rounded-xl cursor-pointer hover:border-blue-500 transition-all" onClick={() => handleCopy(
                      activeTab === 'html' ? `<img src="${img.url}" alt="image" />` :
                      activeTab === 'markdown' ? `![image](${img.url})` :
                      activeTab === 'bbcode' ? `[img]${img.url}[/img]` : img.url
                    )}>
                      <code className="text-[10px] break-all text-blue-600 font-mono">
                        {activeTab === 'html' ? `<img src="${img.url}" />` :
                         activeTab === 'markdown' ? `![img](${img.url})` :
                         activeTab === 'bbcode' ? `[img]${img.url}[/img]` : img.url}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" />
      <div className="mt-10 opacity-50"><Footer /></div>
    </main>
  );
}
