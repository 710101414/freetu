// 文件：src/app/page.jsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { faImages, faTimesCircle } from "@fortawesome/free-solid-svg-icons";
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

function normalizeBaseUrl(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v.replace(/\/+$/, "");
  return `https://${v}`.replace(/\/+$/, "");
}

function getPublicDomains() {
  // 需要在 Cloudflare Pages 里配置：NEXT_PUBLIC_CDN_DOMAINS
  // 例：https://cn.xxx.com,https://global.xxx.com
  const raw = process.env.NEXT_PUBLIC_CDN_DOMAINS || "";
  const arr = raw
    .split(",")
    .map((x) => normalizeBaseUrl(x))
    .filter(Boolean);
  // 去重
  return Array.from(new Set(arr));
}

function buildAliasUrl(base, filename) {
  const b = normalizeBaseUrl(base);
  return `${b}/api/p/${encodeURIComponent(filename)}`;
}

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [selectedOption, setSelectedOption] = useState("tgchannel");
  const [isAuthapi, setIsAuthapi] = useState(false);
  const [role, setRole] = useState("");

  // 命名
  const [customBaseName, setCustomBaseName] = useState("");
  const [autoDailyName, setAutoDailyName] = useState(true);

  // 域名选择（公开链接）
  const [domainOptions, setDomainOptions] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");

  // 私密链接
  const [usePrivate, setUsePrivate] = useState(false);
  const [privateHours, setPrivateHours] = useState(24);

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

  const isImageFile = (file) => !!file && typeof file.type === "string" && file.type.startsWith("image/");

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

  // 初始化鉴权
  useEffect(() => {
    const initAuth = async () => {
      try {
        const res = await fetch("/api/enableauthapi/isauth");
        if (!res.ok) {
          setIsAuthapi(false);
          setRole("");
          return;
        }
        const data = await res.json();
        if (data?.role) {
          setIsAuthapi(true);
          setRole(data.role);
        } else {
          setIsAuthapi(false);
          setRole("");
        }
      } catch (_) {
        setIsAuthapi(false);
        setRole("");
      }
    };
    initAuth();
  }, []);

  // 初始化域名列表（当前域名 + 预置的多域名）
  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const preset = getPublicDomains();
    const opts = [normalizeBaseUrl(origin), ...preset].filter(Boolean);
    const dedup = Array.from(new Set(opts));
    setDomainOptions(dedup);
    setSelectedDomain(dedup[0] || normalizeBaseUrl(origin));
  }, []);

  // 截图粘贴监听
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
    if (!isAuthapi || role !== "admin") return toast.error("权限不足：请先登录管理员账号");

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
            // 后端应返回 filename，若没有则从 name 兜底
            filename: result?.filename || result?.name || f?.name || `img-${Date.now()}.png`,
          };

          setUploadedImages((prev) => [uploadedFile, ...prev]);

          if (file) setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
          else setSelectedFiles([]);
        } else {
          toast.error(`上传失败: ${result?.message || "未知错误"}`);
        }
      } catch (_) {
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

  async function getPrivateUrl(filename, base) {
    const expSeconds = Math.max(1, Number(privateHours || 24)) * 3600;
    const qs = new URLSearchParams();
    qs.set("filename", filename);
    qs.set("expSeconds", String(expSeconds));
    qs.set("base", base);
    const res = await fetch(`/api/enableauthapi/sign?${qs.toString()}`);
    if (!res.ok) throw new Error("sign api failed");
    const data = await res.json().catch(() => ({}));
    if (!data?.url) throw new Error("bad sign response");
    return data.url;
  }

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
            <LoginButton onClick={() => signOut({ callbackUrl: "/" })}>登出({role})</LoginButton>
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
              <h1 className="text-xl font-black text-slate-800 tracking-tighter italic uppercase">Uploader</h1>
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

              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="border-2 border-slate-50 rounded-xl p-2 bg-slate-50 text-xs font-bold text-slate-600 outline-none"
                title="选择复制外链域名"
              >
                {domainOptions.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/^https?:\/\//, "")}
                  </option>
                ))}
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
              <div className="text-[11px] text-slate-400 mt-1">后端会自动补扩展名（.png/.jpg 等），并写入历史库。</div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 bg-slate-50 border rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={autoDailyName}
                  onChange={(e) => setAutoDailyName(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-700">自动按天编号命名</span>
              </label>

              <label className="flex items-center gap-2 bg-slate-50 border rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={usePrivate}
                  onChange={(e) => setUsePrivate(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-700">复制私密链接（签名）</span>
              </label>

              {usePrivate && (
                <div className="bg-slate-50 border rounded-xl p-3">
                  <div className="text-[11px] font-bold text-slate-600 mb-1">有效期（小时）</div>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={privateHours}
                    onChange={(e) => setPrivateHours(e.target.value)}
                    className="w-full p-2 rounded-lg border bg-white text-sm font-mono outline-none"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">仅影响复制出来的私密外链，不影响公开外链。</div>
                </div>
              )}
            </div>
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
            <div key={`${item.previewUrl}-${i}`} className="w-32 h-44 bg-slate-50 rounded-2xl p-2 flex flex-col shadow-sm border relative z-20">
              <img src={item.previewUrl} className="h-28 w-full object-cover rounded-xl" alt="preview" />
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
              <button onClick={() => handleUpload(item.file, i)} className="mt-auto text-blue-600 text-[10px] font-bold py-1">
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
            className={`absolute inset-0 opacity-0 cursor-pointer ${selectedFiles.length > 0 ? "z-10" : "z-30"}`}
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

        {/* 上传结果展示 */}
        <div className="mt-10 bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 min-h-[240px]">
          <div className="flex justify-between items-center mb-10 border-b pb-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              上传结果（最近）
            </h2>
          </div>

          <div className="space-y-12">
            {uploadedImages.length === 0 && <div className="text-center py-20 text-slate-200 italic">暂无记录</div>}

            {uploadedImages.map((img, i) => {
              const filename = img.filename || img.name || `file-${i}.png`;
              const publicUrl = buildAliasUrl(selectedDomain, filename);

              return (
                <UploadCard
                  key={img.id || i}
                  filename={filename}
                  publicUrl={publicUrl}
                  selectedDomain={selectedDomain}
                  usePrivate={usePrivate}
                  getPrivateUrl={getPrivateUrl}
                  LinkRow={LinkRow}
                />
              );
            })}
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

function makeCodes(url) {
  return {
    "图片链接": url,
    HTML: `<a href="${url}" target="_blank"><img src="${url}"></a>`,
    BBCode: `[url=${url}][img]${url}[/img][/url]`,
    Markdown: `![image](${url})`,
    "图片URL": url,
  };
}

function UploadCard({ filename, publicUrl, selectedDomain, usePrivate, getPrivateUrl, LinkRow }) {
  const [open, setOpen] = useState(true);
  const [privateUrl, setPrivateUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const codes = useMemo(() => makeCodes(publicUrl), [publicUrl]);
  const privateCodes = useMemo(() => makeCodes(privateUrl || ""), [privateUrl]);

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!usePrivate) {
        setPrivateUrl("");
        return;
      }
      setLoading(true);
      try {
        const url = await getPrivateUrl(filename, selectedDomain);
        if (mounted) setPrivateUrl(url);
      } catch (_) {
        if (mounted) setPrivateUrl("");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [usePrivate, filename, selectedDomain, getPrivateUrl]);

  return (
    <div className="relative flex flex-col md:flex-row gap-8 p-6 rounded-3xl border border-slate-50 bg-slate-50/30">
      <div className="w-full md:w-48 h-48 rounded-2xl overflow-hidden shadow-sm border-2 border-white relative">
        <img src={publicUrl} className="w-full h-full object-cover" loading="lazy" alt={filename} />
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-black text-slate-800 truncate">{filename}</div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition"
          >
            {open ? "收起外链" : "展开外链"}
          </button>
        </div>

        {open && (
          <>
            {Object.entries(codes).map(([k, v]) => (
              <LinkRow key={k} label={k} value={v} />
            ))}

            {usePrivate && (
              <div className="mt-6 pt-4 border-t">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                  私密外链（签名）{loading ? "（生成中）" : ""}
                </div>
                {privateUrl ? (
                  Object.entries(privateCodes).map(([k, v]) => <LinkRow key={`p-${k}`} label={k} value={v} />)
                ) : (
                  <div className="text-sm text-slate-400">私密链接生成失败（请检查 SIGNING_SECRET 和 sign 接口）</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
