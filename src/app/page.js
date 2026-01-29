"use client";
import { useState, useRef, useEffect } from "react";
import { signOut, useSession } from "next-auth/react"; // 找回 Session
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

  // --- 找回登录状态监听 ---
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
        
        // 关键：判断是否已登录及角色
        if (authRes.ok) {
          const authData = await authRes.json();
          setIsAuthapi(true);
          setRole(authData.role);
        } else {
          setIsAuthapi(false);
          setRole('');
        }
      } catch (err) { console.error("初始化失败:", err); }
    };
    initData();
  }, []);

  // 截图粘贴
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

  const handleUpload = async (file = null, index = null) => {
    if (!isAuthapi || role !== 'admin') return toast.error('权限不足：请先点击右上角登录管理员账号');
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
          const uploadedFile = { id: result.id || result.url, name: f.name || `Pasted-${Date.now()}.png`, url: result.url };
          setUploadedImages(prev => [uploadedFile, ...prev]);
          if (file) {
            setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
          } else {
            setSelectedFiles([]);
          }
        } else { toast.error(`上传失败: ${result.message || '数据库表不存在'}`); }
      } catch (e) { toast.error('API错误，请检查D1绑定'); }
    }
    setUploading(false);
  };

  const handleDeleteBatch = async () => {
    if (selectedImageIds.length === 0) return toast.warn("请选择图片");
    if (!confirm(`确定删除选中的 ${selectedImageIds.length} 张图片吗？`)) return;
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
        toast.success("删除成功");
      }
    } catch (e) { toast.error("网络请求失败"); }
    setUploading(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制', { autoClose: 800 });
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pb-20" onPaste={handlePaste}>
      {/* 找回顶栏登录按钮逻辑 */}
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50 shadow-sm">
        <span className="font-bold text-lg text-blue-600">私人图床终端</span>
        <div className="flex items-center">
          {isAuthapi ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">管理员: {role}</span>
              <LoginButton onClick={() => signOut({ callbackUrl: '/' })}>退出</LoginButton>
            </div>
          ) : (
            <Link href="/login"><LoginButton>登录</LoginButton></Link>
          )}
        </div>
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        {/* 控制面板 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-slate-100 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-2xl text-blue-500"><FontAwesomeIcon icon={faUserShield} className="text-xl" /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">管理中心</h1>
              <p className="text-xs text-slate-400">托管: {Total} | 接口: {selectedOption.toUpperCase()}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className="border-2 border-slate-50 rounded-xl p-2 bg-slate-50 text-sm font-bold text-slate-600 outline-none">
              <option value="tgchannel">Telegram</option>
              <option value="r2">Cloudflare R2</option>
            </select>
            <button 
              onClick={() => { setIsManageMode(!isManageMode); setSelectedImageIds([]); }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${isManageMode ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}
            >
              {isManageMode ? '取消选择' : '批量管理'}
            </button>
          </div>
        </div>

        {/* 待上传队列 */}
        <div className="border-4 border-dashed border-slate-200 rounded-[2rem] bg-white p-8 min-h-[160px] flex flex-wrap gap-4 relative transition-all hover:border-blue-300">
          <LoadingOverlay loading={uploading} />
          {selectedFiles.map((f, i) => (
            <div key={i} className="w-32 h-44 bg-slate-50 rounded-2xl p-2 flex flex-col shadow-sm border border-slate-100 relative group z-20">
              <img src={URL.createObjectURL(f)} className="h-28 w-full object-cover rounded-xl" />
              {/* 待上传区红叉删除 */}
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, idx) => idx !== i)); }} 
                className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-lg hover:scale-110 z-50"
              >
                <FontAwesomeIcon icon={faTimesCircle} />
              </button>
              <button onClick={() => handleUpload(f, i)} className="mt-auto text-blue-600 text-xs font-bold py-1">单独上传</button>
            </div>
          ))}
          {selectedFiles.length === 0 && (
            <div className="w-full flex flex-col items-center justify-center text-slate-300 py-6">
              <FontAwesomeIcon icon={faImages} size="3x" className="mb-2 opacity-10" />
              <p className="text-sm font-bold">粘贴图片 或 拖动/点击选择</p>
            </div>
          )}
          <input type="file" multiple className={`absolute inset-0 opacity-0 cursor-pointer ${selectedFiles.length > 0 ? 'z-10' : 'z-30'}`} onChange={(e) => setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)])} />
        </div>

        {selectedFiles.length > 0 && (
          <button onClick={() => handleUpload()} className="w-full mt-4 bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-blue-700 transition active:scale-95">开始上传 ({selectedFiles.length})</button>
        )}

        {/* 已上传展示区 */}
        <div className="mt-10 bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 min-h-[400px]">
          <div className="flex items-center justify-between mb-6 border-b border-slate-50 pb-4">
            <div className="flex gap-2">
              {['preview', 'url', 'markdown'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === tab ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-400'}`}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
            {isManageMode && (
              <button onClick={handleDeleteBatch} className="bg-red-50 text-red-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition shadow-sm">
                确认删除已选 ({selectedImageIds.length})
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {uploadedImages.length === 0 && <div className="col-span-full text-center py-20 text-slate-300 italic">暂无历史记录</div>}
            {uploadedImages.map((img, i) => (
              <div 
                key={img.id || i} 
                onClick={() => isManageMode && setSelectedImageIds(prev => prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                className={`relative group p-2 rounded-2xl border transition-all cursor-pointer ${selectedImageIds.includes(img.id) ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100' : 'border-slate-100'}`}
              >
                <div className="aspect-square w-full overflow-hidden rounded-xl bg-slate-100 mb-2 relative">
                  <img src={img.url} className="w-full h-full object-cover" loading="lazy" />
                  {isManageMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <FontAwesomeIcon icon={selectedImageIds.includes(img.id) ? faCheckSquare : faSquare} className={`text-2xl ${selectedImageIds.includes(img.id) ? 'text-blue-500' : 'text-white drop-shadow-md'}`} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] text-slate-400 font-mono truncate mr-2">{img.url.split('/').pop()}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleCopy(activeTab === 'markdown' ? `![img](${img.url})` : img.url); }} className="text-slate-300 hover:text-blue-500 transition">
                    <FontAwesomeIcon icon={faCopy} size="sm" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={2000} />
      <div className="mt-10 opacity-30"><Footer /></div>
    </main>
  );
}
