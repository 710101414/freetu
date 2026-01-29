"use client";
import { useState, useRef, useCallback } from "react";
import { signOut } from "next-auth/react"
import Image from "next/image";
import { faImages, faTrashAlt, faUpload, faSearchPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ToastContainer } from "react-toastify";
import { toast } from "react-toastify";
import { useEffect } from 'react';
import Footer from '@/components/Footer'
import Link from "next/link";
import LoadingOverlay from "@/components/LoadingOverlay";


const LoginButton = ({ onClick, href, children }) => (
  <button
    onClick={onClick}
    className="px-4 py-2 mx-2 w-28 sm:w-28 md:w-20 lg:w-16 xl:w-16 2xl:w-20 bg-blue-500 text-white rounded"
  >
    {children}
  </button>
);


export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedFilesNum, setUploadedFilesNum] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null); 
  const [activeTab, setActiveTab] = useState('preview');
  const [uploading, setUploading] = useState(false);
  const [IP, setIP] = useState('');
  const [Total, setTotal] = useState('?');
  const [selectedOption, setSelectedOption] = useState('tgchannel'); 
  const [isAuthapi, setisAuthapi] = useState(false); 
  const [Loginuser, setLoginuser] = useState(''); 
  const [boxType, setBoxtype] = useState("img");

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const parentRef = useRef(null);

  let headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  }

  useEffect(() => {
    ip();
    getTotal();
    isAuth();
  }, []);

  const ip = async () => {
    try {
      const res = await fetch(`/api/ip`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setIP(data.ip);
    } catch (error) {
      console.error('请求出错:', error);
    }
  };

  const isAuth = async () => {
    try {
      const res = await fetch(`/api/enableauthapi/isauth`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        setisAuthapi(true)
        setLoginuser(data.role)
      } else {
        setisAuthapi(false)
        setSelectedOption("tgchannel")
      }
    } catch (error) {
      console.error('请求出错:', error);
    }
  };

  const getTotal = async () => {
    try {
      const res = await fetch(`/api/total`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setTotal(data.total);
    } catch (error) {
      console.error('请求出错:', error);
    }
  }

  const handleFileChange = (event) => {
    const newFiles = event.target.files;
    const filteredFiles = Array.from(newFiles).filter(file =>
      !selectedFiles.find(selFile => selFile.name === file.name));
    const uniqueFiles = filteredFiles.filter(file =>
      !uploadedImages.find(upImg => upImg.name === file.name)
    );
    setSelectedFiles([...selectedFiles, ...uniqueFiles]);
  };

  const handleClear = () => {
    setSelectedFiles([]);
  };

  const getTotalSizeInMB = (files) => {
    const totalSizeInBytes = Array.from(files).reduce((acc, file) => acc + file.size, 0);
    return (totalSizeInBytes / (1024 * 1024)).toFixed(2);
  };

  const handleUpload = async (file = null) => {
    if (!isAuthapi || Loginuser !== 'admin') {
      toast.error('未经授权：网页端已禁用匿名上传，请先登录管理员账号。');
      return;
    }

    setUploading(true);
    const filesToUpload = file ? [file] : selectedFiles;

    if (filesToUpload.length === 0) {
      toast.error('请选择文件');
      setUploading(false);
      return;
    }

    const formFieldName = "file";
    let successCount = 0;

    try {
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append(formFieldName, file);

        try {
          const targetUrl = `/api/enableauthapi/${selectedOption}`;

          const response = await fetch(targetUrl, {
            method: 'POST',
            body: formData,
            headers: headers
          });

          if (response.ok) {
            const result = await response.json();
            file.url = result.url;
            setUploadedImages((prevImages) => [...prevImages, file]);
            setSelectedFiles((prevFiles) => prevFiles.filter(f => f !== file));
            successCount++;
          } else {
            toast.error(`上传 ${file.name} 失败`);
          }
        } catch (error) {
          toast.error(`接口请求出错`);
        }
      }
      if(successCount > 0) toast.success(`成功上传 ${successCount} 张图片`);
    } catch (error) {
      toast.error('上传过程错误');
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (event) => {
    const clipboardItems = event.clipboardData.items;
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.kind === 'file' && item.type.includes('image')) {
        const file = item.getAsFile();
        setSelectedFiles([...selectedFiles, file]);
        break; 
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const filteredFiles = Array.from(files).filter(file => !selectedFiles.find(selFile => selFile.name === file.name));
      setSelectedFiles([...selectedFiles, ...filteredFiles]);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const calculateMinHeight = () => {
    const rows = Math.ceil(selectedFiles.length / 4);
    return `${rows * 100}px`;
  };

  const handleImageClick = (index) => {
    if (selectedFiles[index].type.startsWith('image/')) {
      setBoxtype("img");
    } else if (selectedFiles[index].type.startsWith('video/')) {
      setBoxtype("video");
    } else {
      setBoxtype("other");
    }
    setSelectedImage(URL.createObjectURL(selectedFiles[index]));
  };

  const handleCloseImage = () => {
    setSelectedImage(null);
  };

  const handleRemoveImage = (index) => {
    const updatedFiles = selectedFiles.filter((_, idx) => idx !== index);
    setSelectedFiles(updatedFiles);
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`链接复制成功`);
    } catch (err) {
      toast.error("链接复制失败")
    }
  };

  const handleCopyCode = async () => {
    const codeElements = parentRef.current.querySelectorAll('code');
    const values = Array.from(codeElements).map(code => code.textContent);
    try {
      await navigator.clipboard.writeText(values.join("\n"));
      toast.success(`批量复制成功`);
    } catch (error) {
      toast.error(`复制失败`)
    }
  }

  const handlerenderImageClick = (imageUrl, type) => {
    setBoxtype(type);
    setSelectedImage(imageUrl);
  };

  const renderFile = (data, index) => {
    const fileUrl = data.url;
    if (data.type.startsWith('image/')) {
      return (
        <img
          key={`image-${index}`}
          src={data.url}
          alt={`Uploaded ${index}`}
          className="object-cover w-36 h-40 m-2 cursor-pointer"
          onClick={() => handlerenderImageClick(fileUrl, "img")}
        />
      );
    } else if (data.type.startsWith('video/')) {
      return (
        <video
          key={`video-${index}`}
          src={data.url}
          className="object-cover w-36 h-40 m-2 cursor-pointer"
          controls
          onClick={() => handlerenderImageClick(fileUrl, "video")}
        />
      );
    } else {
      return (
        <img
          key={`image-${index}`}
          src={data.url}
          className="object-cover w-36 h-40 m-2 cursor-pointer"
          onClick={() => handlerenderImageClick(fileUrl, "other")}
        />
      );
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'preview':
        return (
          <div className=" flex flex-col ">
            {uploadedImages.map((data, index) => (
              <div key={index} className="m-2 rounded-2xl ring-offset-2 ring-2 ring-slate-100 flex flex-row ">
                {renderFile(data, index)}
                <div className="flex flex-col justify-center w-4/5">
                  {[
                    { text: data.url, onClick: () => handleCopy(data.url) },
                    { text: `![${data.name}](${data.url})`, onClick: () => handleCopy(`![${data.name}](${data.url})`) },
                    { text: `<a href="${data.url}" target="_blank"><img src="${data.url}"></a>`, onClick: () => handleCopy(`<a href="${data.url}" target="_blank"><img src="${data.url}"></a>`) },
                    { text: `[img]${data.url}[/img]`, onClick: () => handleCopy(`[img]${data.url}[/img]`) },
                  ].map((item, i) => (
                    <input
                      key={`input-${i}`}
                      readOnly
                      value={item.text}
                      onClick={item.onClick}
                      className="px-3 my-1 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-800 focus:outline-none cursor-pointer hover:bg-slate-50"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <div ref={parentRef} className=" p-4 bg-slate-100 cursor-pointer" onClick={handleCopyCode}>
            {uploadedImages.map((data, index) => (
              <div key={index} className="mb-2 ">
                <code className=" w-2 break-all">
                  {activeTab === 'htmlLinks' && `<img src="${data.url}" alt="${data.name}" />`}
                  {activeTab === 'markdownLinks' && `![${data.name}](${data.url})`}
                  {activeTab === 'bbcodeLinks' && `[img]${data.url}[/img]`}
                  {activeTab === 'viewLinks' && `${data.url}`}
                </code>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <main className=" overflow-auto h-full flex w-full min-h-screen flex-col items-center justify-between">
      <header className="fixed top-0 h-[50px] left-0 w-full border-b bg-white flex z-50 justify-center items-center">
        <nav className="flex justify-between items-center w-full max-w-4xl px-4 font-bold">私人图床控制台</nav>
        {renderButton()}
      </header>
      <div className="mt-[60px] w-9/10 sm:w-9/10 md:w-9/10 lg:w-9/10 xl:w-3/5 2xl:w-2/3">

        <div className="flex flex-row">
          <div className="flex flex-col">
            <div className="text-gray-800 text-lg font-bold">私有化上传</div>
            <div className="mb-4 text-sm text-gray-500">
              单文件最大 5 MB; 托管总量: <span className="text-cyan-600">{Total}</span>; IP: <span className="text-cyan-600">{IP}</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-col md:w-auto lg:flex-row xl:flex-row 2xl:flex-row mx-auto items-center">
            <span className="text-lg">接口：</span>
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              className="text-lg p-2 border rounded text-center w-auto cursor-pointer bg-white">
              <option value="tgchannel">TG_Channel</option>
              <option value="r2">R2</option>
            </select>
          </div>
        </div>

        <div
          className="border-2 border-dashed border-slate-400 rounded-md relative bg-slate-50"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onPaste={handlePaste}
          style={{ minHeight: calculateMinHeight() }}
        >
          <div className="flex flex-wrap gap-3 min-h-[240px]">
            <LoadingOverlay loading={uploading} />
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative rounded-2xl w-44 h-48 ring-offset-2 ring-2 ring-blue-100 bg-white mx-3 my-3 flex flex-col items-center shadow-sm">
                <div className="relative w-36 h-36 mt-2 cursor-pointer" onClick={() => handleImageClick(index)}>
                  {file.type.startsWith('image/') && (
                    <Image src={URL.createObjectURL(file)} alt="Preview" fill={true} className="rounded-lg object-cover" />
                  )}
                  {file.type.startsWith('video/') && (
                    <video src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-lg" />
                  )}
                </div>
                <div className="flex flex-row items-center justify-center w-full mt-2">
                  <button className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center mx-2" onClick={() => handleImageClick(index)}>
                    <FontAwesomeIcon icon={faSearchPlus} size="xs" />
                  </button>
                  <button className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center mx-2" onClick={() => handleRemoveImage(index)}>
                    <FontAwesomeIcon icon={faTrashAlt} size="xs" />
                  </button>
                  <button className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center mx-2" onClick={() => handleUpload(file)}>
                    <FontAwesomeIcon icon={faUpload} size="xs" />
                  </button>
                </div>
              </div>
            ))}
            {selectedFiles.length === 0 && (
              <div className="absolute -z-0 left-0 top-0 w-full h-full flex items-center justify-center">
                <div className="text-gray-400 flex flex-col items-center">
                  <FontAwesomeIcon icon={faImages} size="3x" className="mb-2 opacity-20" />
                  拖拽或粘贴到此处上传
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full rounded-md shadow-sm overflow-hidden mt-4 grid grid-cols-8">
          <div className="md:col-span-1 col-span-8">
            <label htmlFor="file-upload" className="w-full h-10 bg-blue-500 cursor-pointer flex items-center justify-center text-white hover:bg-blue-600">
              <FontAwesomeIcon icon={faImages} className="mr-2" />选择图片
            </label>
            <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} multiple />
          </div>
          <div className="md:col-span-5 col-span-8 bg-slate-100 flex items-center px-4 font-mono text-sm">
            已选: {selectedFiles.length} | 大小: {getTotalSizeInMB(selectedFiles)} MB
          </div>
          <div className="md:col-span-1 col-span-3">
            <div className="w-full bg-red-500 cursor-pointer h-10 flex items-center justify-center text-white hover:bg-red-600" onClick={handleClear}>
              <FontAwesomeIcon icon={faTrashAlt} className="mr-2" />清除
            </div>
          </div>
          <div className="md:col-span-1 col-span-5">
            <div className={`w-full bg-green-500 cursor-pointer h-10 flex items-center justify-center text-white hover:bg-green-600 ${uploading ? 'pointer-events-none opacity-50' : ''}`} onClick={() => handleUpload()}>
              <FontAwesomeIcon icon={faUpload} className="mr-2" />上传全部
            </div>
          </div>
        </div>

        <ToastContainer position="bottom-right" autoClose={2000} />
        
        <div className="w-full mt-4 min-h-[200px] mb-[60px]">
          {uploadedImages.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1 mb-4 border-b">
                {['preview', 'htmlLinks', 'markdownLinks', 'bbcodeLinks', 'viewLinks'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 transition-colors ${activeTab === tab ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                  >
                    {tab.replace('Links', '')}
                  </button>
                ))}
              </div>
              {renderTabContent()}
            </>
          )}
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[100]" onClick={handleCloseImage}>
          <div className="relative max-w-4xl max-h-[90vh]">
            <button className="absolute -top-10 right-0 text-white text-3xl font-bold" onClick={handleCloseImage}>&times;</button>
            {boxType === "img" ? (
              <img src={selectedImage} alt="Large" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
            ) : (
              <video src={selectedImage} className="max-w-full max-h-[85vh] rounded-lg" controls autoPlay />
            )}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 h-[50px] bg-slate-50 border-t w-full flex z-50 justify-center items-center">
        <Footer />
      </div>
    </main>
  );
}
