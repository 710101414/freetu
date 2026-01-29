"use client";
import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react"
import Image from "next/image";
import { faImages, faTrashAlt, faUpload, faSearchPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ToastContainer, toast } from "react-toastify";
import Footer from '@/components/Footer'
import Link from "next/link";
import LoadingOverlay from "@/components/LoadingOverlay";

const LoginButton = ({ onClick, children }) => (
  <button onClick={onClick} className="px-4 py-2 mx-2 bg-blue-500 text-white rounded font-medium">{children}</button>
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
  const [selectedImage, setSelectedImage] = useState(null);
  const [boxType, setBoxtype] = useState("img");
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
      return toast.error('Unauthorized: Admin access required.');
    }
    setUploading(true);
    const files = file ? [file] : selectedFiles;
    if (files.length === 0) {
      setUploading(false);
      return toast.error('No files selected.');
    }

    for (const f of files) {
      const formData = new FormData();
      formData.append('file', f);
      try {
        const res = await fetch(`/api/enableauthapi/${selectedOption}`, { method: 'POST', body: formData });
        if (res.ok) {
          const result = await res.json();
          f.url = result.url;
          setUploadedImages(prev => [...prev, f]);
          setSelectedFiles(prev => prev.filter(item => item !== f));
        } else { toast.error(`Upload failed: ${f.name}`); }
      } catch (e) { toast.error('API Error'); }
    }
    setUploading(false);
    toast.success('Process completed');
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50">
        <span className="font-bold text-lg">Private Gallery</span>
        {isAuthapi ? <LoginButton onClick={() => signOut()}>Logout</LoginButton> : <Link href="/login"><LoginButton>Login</LoginButton></Link>}
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Uploader</h1>
            <p className="text-sm text-slate-500">Total: {Total} | IP: {IP}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Channel:</span>
            <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} className="border rounded p-2 bg-slate-50 outline-none">
              <option value="tgchannel">TG_Channel</option>
              <option value="r2">R2</option>
            </select>
          </div>
        </div>

        <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 p-6 min-h-[300px] flex flex-wrap gap-4 relative">
          <LoadingOverlay loading={uploading} />
          {selectedFiles.map((f, i) => (
            <div key={i} className="w-40 h-52 bg-white border rounded-lg p-2 flex flex-col shadow-sm">
              <div className="h-32 w-full relative overflow-hidden rounded bg-slate-100">
                {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-slate-400">Video/File</div>}
              </div>
              <div className="mt-auto flex justify-around p-1">
                <button onClick={() => setSelectedFiles(selectedFiles.filter((_, idx) => idx !== i))} className="text-red-500"><FontAwesomeIcon icon={faTrashAlt} /></button>
                <button onClick={() => handleUpload(f)} className="text-green-500"><FontAwesomeIcon icon={faUpload} /></button>
              </div>
            </div>
          ))}
          <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setSelectedFiles(Array.from(e.target.files))} />
          {selectedFiles.length === 0 && <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none"><FontAwesomeIcon icon={faImages} size="3x" className="mb-2 opacity-20" /><span>Drop or click to select</span></div>}
        </div>

        <button onClick={() => handleUpload()} className="w-full mt-6 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg">Upload All</button>
        <ToastContainer />

        <div className="mt-10 space-y-4 pb-20">
          {uploadedImages.map((img, i) => (
            <div key={i} className="flex gap-4 p-4 border rounded-xl bg-slate-50 items-center">
              <img src={img.url} className="w-16 h-16 object-cover rounded shadow" />
              <input readOnly value={img.url} className="flex-1 bg-white border p-2 rounded text-xs font-mono outline-none cursor-pointer" onClick={(e) => handleCopy(e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      <div className="fixed bottom-4"><Footer /></div>
    </main>
  );
}
