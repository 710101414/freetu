"use client";
import { useState, useEffect, useMemo } from "react";
import { signOut } from "next-auth/react";
import {
  faImages,
  faCheckSquare,
  faSquare,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Footer from "@/components/Footer";
import Link from "next/link";
import LoadingOverlay from "@/components/LoadingOverlay";

const LoginButton = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="px-4 py-2 mx-2 bg-blue-500 text-white rounded-xl font-medium shadow-sm hover:bg-blue-600 transition"
  >
    {children}
  </button>
);

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [IP, setIP] = useState("");
  const [Total, setTotal] = useState("?");
  const [selectedOption, setSelectedOption] = useState("tgchannel");
  const [isAuthapi, setIsAuthapi] = useState(false);
  const [role, setRole] = useState("");

  // 命名相关：可留空
  const [customBaseName, setCustomBaseName] = useState(""); // 例如 2026-01-29-000
  const [autoDailyName, setAutoDailyName] = useState(true);

  const previewItems = useMemo(() => {
    return selectedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
  }, [selectedFiles]);

  useEffect(() => {
    return () => {
      for (const item of previewItems) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch (_) {}
      }
    };
  }, [previewItems]);

  const isImageFile = (file) => {
    return !!file && typeof file.type === "string" && file.type.startsWith("image/");
  };

  const appendFiles = (files) => {
    const arr = Array.from(files || []);
    const imgFiles = arr.filter(isImageFile);
    if (arr.length > 0 && imgFiles.length === 0) {
      toast.warn("检测到非图片文件，已忽略");
      return;
    }
    if (imgFiles.length !== arr.length) toast.warn("已忽略部分非图片文件");
    if (imgFiles.length > 0) setSelectedFiles((prev) => [...prev, ...imgFiles]);
  };

  useEffect(() => {
    const initData = async () => {
      try {
        const [ipRes, totalRes, authRes] = await Promise.all([
          fetch("/api/ip"),
          fetch("/api/total"),
          fetch("/api/enableauthapi/isauth"),
        ]);

        if (ipRes.ok) {
          const ipData = await ipRes.json();
          if (ipData?.ip) setIP(ipData.ip);
        }

        if (totalRes.ok) {
          const totalData = await totalRes.json();
          if (typeof totalData?.total !== "undefined") setTotal(totalData.total);
        }

        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData?.role) {
            setIsAuthapi(true);
            setRole(authData.role);
          } else {
            setIsAuthapi(false);
            setRole("");
          }
        } else {
          setIsAuthapi(false);
          setRole("");
        }
      } catch (err) {
        console.error("初始化失败:", err);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items || [];
      const blobs = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it?.type && it.type.indexOf("image") !== -1) {
          const blob = it.getAsFile();
          if (blob && isImageFile(blob)) blobs.push(blob);
        }
      }
      if (blobs.length > 0) {
        setSelectedFiles((prev) => [...prev, ...blobs]);
        toast.info("已捕获剪贴板图片");
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const handleUpload = async (file = null, index = null) => {
    if (!isAuthapi || role !== "admin")
      return toast.error("权限不足：请先登录管理员账号");

    setUploading(true);

    const files = file ? [file] : selectedFiles;
    if (files.length === 0) {
      setUploading(false);
      return toast.error("未选择任何图片");
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const formData = new FormData();
      formData.append("file", f);

      // 命名字段：后端会优先使用 name；没传则自动生成（若 autoDailyName=true）
      if (customBaseName.trim()) formData.append("name", customBaseName.trim());
      formData.append("autoDailyName", autoDailyName ? "true" : "false");

      try {
        const res = await fetch(`/api/enableauthapi/${selectedOption}`, {
          method: "POST",
          body: formData,
        });

        const result = await res.json().catch(() => ({}));

        if (res.ok) {
          const uploadedFile = {
            id: result?.id || result?.url || `${Date.now()}-${Math.random()}`,
            name: result?.name || f?.name || `img-${Date.now()}.png`,
            url: result?.url,
          };

          if (!uploadedFile.url) {
            toast.error("上传成功但未返回 URL（后端返回结构异常）");
          } else {
            setUploadedImages((prev) => [uploadedFile, ...prev]);
          }

          if (file) {
            setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
          } else {
            setSelectedFiles([]);
          }
        } else {
          toast.error(`上传失败: ${result?.message || "未知错误"}`);
        }
      } catch (e) {
        toast.error("API通讯错误");
      }
    }

    setUploading(false);
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制", { autoClose: 800 });
    } catch (_) {
      toast.error("复制失败");
    }
  };

  const LinkRow = ({ label, value }) => (
    <div className="grid grid-cols-4 items-center gap-4 mb-3">
      <span className="col-span-1 text-right text-[12px] font-bold text-slate-500 uppercase tracking-tight">
        {label}
      </span>
      <div className="col-span-3">
        <input
          readOnly
          value={value}
          onClick={(e) => {
            e.target.select();
            handleCopy(value);
          }}
          className="w-full p-2 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600 cursor-pointer hover:bg-white hover:border-blue-400 transition-all outline-none"
        />
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pb-20">
      <header className="fixed top-0 w-full h-14 bg-white border-b flex items-center justify-between px-6 z-50 shadow-sm">
        <span className="font-bold text-lg text-blue-600">私人图床终端</span>
        <div className="flex items-center">
          {isAuthapi && role === "admin" && (
            <Link href="/manage">
              <button className="px-4 py-2 mx-2 bg-slate-100 text-slate-700 rounded-xl font-medium shadow-sm hover:bg-slate-200 transition">
                管理后台
              </button>
            </Link>
          )}

          {isAuthapi ? (
            <LoginButton onClick={() => signOut({ callbackUrl: "/" })}>
              登出({role})
            </LoginButton>
          ) : (
            <Link href="/login">
              <LoginButton>登录管理</LoginButton>
            </Link>
          )}
        </div>
      </header>

      <div className="mt-20 w-full max-w-4xl p-4">
        {/* 控制面板 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tighter italic uppercase">
                Uploader
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                托管总量: {Total} | 您的IP: {IP}
              </p>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedOption}
                onChange={(e) => setSelectedOption(e.target.value)}
                className="border-2 border-slate-50 rounded-xl p-2 bg-slate-50 text-xs font-bold text-slate-600 outline-none"
              >
                <option value="tgchannel">Telegram 频道</option>
                <option value="r2">Cloudflare R2</option>
              </select>
            </div>
          </div>

          {/* 命名设置 */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="md:col-span-2">
              <div className="text-xs font-black text-slate-500 mb-1">自定义名称（可选）</div>
              <input
                value={customBaseName}
                onChange={(e) => setCustomBaseName(e.target.value)}
                placeholder="例如：2026-01-29-000（留空则自动生成）"
                className="w-full p-3 rounded-xl bg-slate-50 border text-sm font-mono text-slate-700 outline-none"
              />
              <div className="text-[11px] text-slate-400 mt-1">
                后端会自动补扩展名（.png/.jpg 等），并写入历史库。
              </div>
            </div>

            <label className="flex items-center gap-2 bg-slate-50 border rounded-xl p-3">
              <input
                type="checkbox"
                checked={autoDailyName}
                onChange={(e) => setAutoDailyName(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-xs font-bold text-slate-700">
                自动按天编号命名（YYYY-MM-DD-000）
              </span>
            </label>
          </div>
        </div>

        {/* 待上传队列 */}
        <div
          className="border-4 border-dashed border-slate-200 rounded-[2rem] bg-white p-8 min-h-[160px] flex flex-wrap gap-4 relative transition-all hover:border-blue-300"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            appendFiles(e.dataTransfer?.files);
          }}
        >
          <LoadingOverlay loading={uploading} />

          {previewItems.map((item, i) => (
            <div
              key={`${item.previewUrl}-${i}`}
              className="w-32 h-44 bg-slate-50 rounded-2xl p-2 flex flex-col shadow-sm border relative z-20"
            >
              <img
                src={item.previewUrl}
                className="h-28 w-full object-cover rounded-xl"
                alt="preview"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i));
                }}
                className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center z-50 shadow-lg cursor-pointer hover:scale-110 transition"
                aria-label="remove"
              >
                <FontAwesomeIcon icon={faTimesCircle} />
              </button>
              <button
                onClick={() => handleUpload(item.file, i)}
                className="mt-auto text-blue-600 text-[10px] font-bold py-1"
              >
                立即上传
              </button>
            </div>
          ))}

          {selectedFiles.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <FontAwesomeIcon icon={faImages} size="3x" className="mb-2 opacity-10" />
              <p className="text-sm font-bold">支持 截图粘贴 / 拖拽 / 点击</p>
            </div>
          )}

          <input
            type="file"
            multiple
            accept="image/*"
            className={`absolute inset-0 opacity-0 cursor-pointer ${
              selectedFiles.length > 0 ? "z-10" : "z-30"
            }`}
            onChange={(e) => appendFiles(e.target.files)}
          />
        </div>

        {selectedFiles.length > 0 && (
          <button
            onClick={() => handleUpload()}
            className="w-full mt-4 bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg transition active:scale-95"
          >
            确认开始批量上传
          </button>
        )}

        {/* 首页展示：保持你原来的 5 外链方式展示 */}
        <div className="mt-10 bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 min-h-[240px]">
          <div className="flex justify-between items-center mb-10 border-b pb-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              上传结果（最近）
            </h2>
          </div>

          <div className="space-y-12">
            {uploadedImages.length === 0 && (
              <div className="col-span-full text-center py-20 text-slate-200 italic">
                暂无记录
              </div>
            )}

            {uploadedImages.map((img, i) => (
              <div
                key={img.id || i}
                className="relative flex flex-col md:flex-row gap-8 p-6 rounded-3xl border border-slate-50 bg-slate-50/30"
              >
                <div className="w-full md:w-48 h-48 rounded-2xl overflow-hidden shadow-sm border-2 border-white relative">
                  <img src={img.url} className="w-full h-full object-cover" loading="lazy" alt={img.name || "uploaded"} />
                </div>

                <div className="flex-1">
                  <LinkRow label="图片链接" value={img.url} />
                  <LinkRow label="HTML" value={`<a href="${img.url}" target="_blank"><img src="${img.url}"></a>`} />
                  <LinkRow label="BBCode" value={`[url=${img.url}][img]${img.url}[/img][/url]`} />
                  <LinkRow label="Markdown" value={`![image](${img.url})`} />
                  <LinkRow label="图片URL" value={img.url} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ToastContainer position="bottom-right" autoClose={2000} />
      <div className="mt-10 opacity-30">
        <Footer />
      </div>
    </main>
  );
}
