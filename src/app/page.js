"use client";
import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react"
import Image from "next/image";
import { faImages, faTrashAlt, faUpload, faSearchPlus, faCopy } from '@fortawesome/free-solid-svg-icons';
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
  const [selectedImage, setSelectedImage] = useState(null);
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
      } catch (err) { console.error("Init Error:", err); }
    };
    initData();
  }, []);

  const handleUpload = async (file = null) => {
    if (!isAuthapi || role !== 'admin') {
      return toast.error('权限不足：仅管理员允许上传');
    }
    setUploading(true);
    const files = file ? [file] : selectedFiles;
    if (files.length === 0) {
      setUploading(false);
      return toast.error('未选择任何文件');
    }

    for (const f of files) {
      const formData = new FormData();
      formData.append('file', f);
      try {
        const res = await fetch(`/api/enableauthapi/${selectedOption}`, { method: 'POST', body: formData });
        if (res.ok) {
          const result = await res.json();
          const uploadedFile = { name: f.name, url: result.url, type: f.type };
          setUploadedImages(prev => [...prev, uploadedFile]);
          setSelectedFiles(prev => prev.filter(item => item !== f));
        } else { toast.error(`上传失败: ${f.name}`); }
      } catch (e) { toast.error('接口通讯失败'); }
    }
    setUploading(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.info('链接已复制到剪贴板', { autoClose: 1000 });
  };

  const renderLinks = (img) => {
    const links = {
      preview: img.url,
      markdown: `![${img.name}](${img.url})`,
      html: `<img src="${img.url}" alt="${img.name}" />`,
      bbcode: `[img]${img.url}[/img]`
    };
    
    if (activeTab === 'preview') {
      return (
        <div className="flex flex-col gap-2 w-full pr-4">
          <input readOnly value={links.preview} className="text-xs p-2 border rounded bg-white cursor-pointer" onClick={(e) => handleCopy(e.target.value)} />
          <input readOnly value={links.markdown} className="text-xs p-2 border rounded bg-white cursor-pointer" onClick={(e) => handleCopy(e.target.value)} />
          <input readOnly value={links.html} className="text-xs p-2 border rounded bg-white cursor-pointer" onClick={(e) => handleCopy(e.target.value)} />
        </div>
      );
    }
    
    const formats = { htmlLinks: 'html', markdownLinks: 'markdown', bbcodeLinks: 'bbcode', viewLinks: 'preview' };
    return <code className="text-[10px] break-all bg-slate-100 p-2 rounded block">{links[formats[activeTab]]}</code>;
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center">
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50 shadow-sm">
        <span className="font-bold text-lg text-blue-600">我的私人图床</span>
        {isAuthapi ? <LoginButton onClick={() => signOut()}>退出登录</LoginButton> : <Link href="/login"><LoginButton>管理员登录</LoginButton></Link>}
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-800">图片上传控制台</h1>
            <p className="text-sm text-slate-400 mt-1">已托管: <span className="text-blue-500 font-bold">{Total}</span> | 您的IP: {IP}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">选择存储通道</span>
            <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className="border-2 border-slate-100 rounded-lg p-2 bg-slate-50 outline-none text-sm font-bold text-slate-700 focus:border-blue-500 transition">
              <option value="tgchannel">Telegram 频道</option>
              <option value="r2">Cloudflare R2</option>
            </select>
          </div>
        </div>

        <div className="border-4 border-dashed border-slate-200 rounded-3xl bg-white p-8 min-h-[340px] flex flex-wrap gap-6 relative transition-all hover:border-blue-100">
          <LoadingOverlay loading={uploading} />
          {selectedFiles.map((f, i) => (
            <div key={i} className="w-44 h-56 bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col shadow-sm group relative">
              <div className="h-36 w-full relative overflow-hidden rounded-xl bg-white">
                {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-slate-400">视频文件</div>}
              </div>
              <div className="mt-auto flex justify-center gap-4">
                <button onClick={() => setSelectedFiles(selectedFiles.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 transition"><FontAwesomeIcon icon={faTrashAlt} /></button>
                <button onClick={() => handleUpload(f)} className="text-blue-400 hover:text-blue-600 transition"><FontAwesomeIcon icon={faUpload} /></button>
              </div>
            </div>
          ))}
          <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setSelectedFiles(Array.from(e.target.files))} />
          {selectedFiles.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <FontAwesomeIcon icon={faImages} size="4x" className="mb-4 opacity-10" />
              <span className="font-medium">拖拽图片到这里 或 点击此处选择</span>
              <span className="text-xs mt-2 opacity-60">仅限管理员上传</span>
            </div>
          )}
        </div>

        <button onClick={() => handleUpload()} className="w-full mt-8 bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 transition shadow-lg shadow-blue-200 active:scale-[0.98]">开始上传全部</button>
        
        <div className="mt-12 bg-white rounded-3xl p-6 shadow-sm mb-20">
          <div className="flex gap-2 mb-6 border-b border-slate-100 pb-4 overflow-x-auto">
            {['preview', 'htmlLinks', 'markdownLinks', 'bbcodeLinks', 'viewLinks'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === tab ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                {tab === 'preview' ? '预览' : tab.replace('Links', '').toUpperCase()}
              </button>
            ))}
          </div>
          
          <div className="space-y-6">
            {uploadedImages.length === 0 && <p className="text-center text-slate-300 py-10 text-sm italic">暂无上传记录</p>}
            {uploadedImages.map((img, i) => (
              <div key={i} className="flex gap-4 p-2 bg-slate-50 rounded-2xl items-center group">
                <img src={img.url} className="w-24 h-24 object-cover rounded-xl shadow-sm border-2 border-white" />
                <div className="flex-1 overflow-hidden">
                  {renderLinks(img)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ToastContainer />
      <div className="fixed bottom-4"><Footer /></div>
    </main>
  );
}
