// 文件：src/app/manage/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function fmtTime(ts) {
  const n = Number(ts || 0);
  if (!n) return "-";
  try {
    return new Date(n).toLocaleString();
  } catch {
    return "-";
  }
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

export default function ManagePage() {
  const [role, setRole] = useState("");
  const [authed, setAuthed] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const [provider, setProvider] = useState(""); // "", "tgchannel", "r2"
  const [date, setDate] = useState(""); // YYYY-MM-DD（前端筛选）
  const [q, setQ] = useState(""); // 前端关键字筛选

  const [selectedIds, setSelectedIds] = useState([]);

  // 折叠状态：记录 id -> boolean
  const [openMap, setOpenMap] = useState({});

  // 认证
  useEffect(() => {
    const initAuth = async () => {
      try {
        const res = await fetch("/api/enableauthapi/isauth");
        if (!res.ok) {
          setAuthed(false);
          setRole("");
          return;
        }
        const data = await res.json();
        if (data?.role) {
          setAuthed(true);
          setRole(data.role);
        } else {
          setAuthed(false);
          setRole("");
        }
      } catch (_) {
        setAuthed(false);
        setRole("");
      }
    };
    initAuth();
  }, []);

  const fetchList = async ({ reset = false } = {}) => {
    if (!authed || role !== "admin") return;
    if (loading) return;

    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "60");
      if (!reset && cursor) qs.set("cursor", String(cursor));
      if (provider) qs.set("provider", provider);

      const res = await fetch(`/api/enableauthapi/list?${qs.toString()}`);
      if (!res.ok) throw new Error("list api failed");

      const data = await res.json().catch(() => ({}));
      const newItems = Array.isArray(data.items) ? data.items : [];

      if (reset) setItems(newItems);
      else setItems((prev) => [...prev, ...newItems]);

      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.nextCursor));
    } catch (_) {
      toast.error("拉取历史失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed && role === "admin") fetchList({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, role]);

  useEffect(() => {
    if (authed && role === "admin") {
      setCursor(null);
      setHasMore(true);
      setSelectedIds([]);
      setOpenMap({});
      fetchList({ reset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const filtered = useMemo(() => {
    let arr = items.slice();

    // 日期筛选（前端）
    if (date) {
      arr = arr.filter((x) => {
        const ts = Number(x.created_at || 0);
        if (!ts) return false;
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}` === date;
      });
    }

    // 关键字筛选（filename/url/id）
    const kw = q.trim().toLowerCase();
    if (kw) {
      arr = arr.filter((x) => {
        const s = `${x.filename || ""} ${x.url || ""} ${x.id || ""}`.toLowerCase();
        return s.includes(kw);
      });
    }

    return arr;
  }, [items, date, q]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    const ids = filtered.map((x) => x.id).filter(Boolean);
    setSelectedIds(ids);
  };

  const clearSelect = () => setSelectedIds([]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制", { autoClose: 800 });
    } catch (_) {
      toast.error("复制失败");
    }
  };

  const deleteBatch = async () => {
    if (selectedIds.length === 0) return toast.warn("请选择要删除的记录");
    if (!confirm(`确定删除选中的 ${selectedIds.length} 条记录？`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/enableauthapi/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (!res.ok) throw new Error("delete failed");

      setItems((prev) => prev.filter((x) => !selectedIds.includes(x.id)));
      setSelectedIds([]);
      toast.success("删除成功");
    } catch (_) {
      toast.error("删除失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = (id) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <ToastContainer position="bottom-right" autoClose={2000} />
        <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-black text-slate-800">管理后台</h1>
          <p className="text-xs text-slate-400 mt-2">请先登录管理员账号</p>
          <div className="mt-6 flex gap-2">
            <Link href="/login" className="flex-1 text-center bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition">
              去登录
            </Link>
            <Link href="/" className="flex-1 text-center bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition">
              回主页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <ToastContainer position="bottom-right" autoClose={2000} />
        <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-black text-slate-800">管理后台</h1>
          <p className="text-xs text-slate-400 mt-2">权限不足（当前角色：{role || "unknown"}）</p>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition"
            >
              退出登录
            </button>
            <Link href="/" className="flex-1 text-center bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition">
              回主页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <ToastContainer position="bottom-right" autoClose={2000} />

      <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-black text-blue-600">
              ← 回到主页
            </Link>
            <span className="text-slate-300">|</span>
            <span className="font-bold text-slate-700">管理后台</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
          >
            登出(admin)
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {/* 工具栏 */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border text-sm font-bold text-slate-700 outline-none"
              >
                <option value="">全部来源</option>
                <option value="tgchannel">Telegram</option>
                <option value="r2">R2</option>
              </select>

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border text-sm font-bold text-slate-700 outline-none"
              />

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索 文件名/URL/ID"
                className="px-3 py-2 rounded-xl bg-slate-50 border text-sm font-bold text-slate-700 outline-none w-64"
              />

              <button
                onClick={() => fetchList({ reset: true })}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-slate-100 border text-sm font-bold text-slate-700 hover:bg-slate-200 transition disabled:opacity-60"
              >
                {loading ? "刷新中..." : "刷新"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={selectAllFiltered}
                className="px-3 py-2 rounded-xl bg-slate-100 border text-sm font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                全选筛选结果
              </button>
              <button
                onClick={clearSelect}
                className="px-3 py-2 rounded-xl bg-slate-100 border text-sm font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                清空选择
              </button>
              <button
                onClick={deleteBatch}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 transition disabled:opacity-60"
              >
                删除已选（{selectedIds.length}）
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400">
            已加载 {items.length} 条；筛选后 {filtered.length} 条
          </div>
        </div>

        {/* 小图列表 */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((x) => {
            const id = x.id || x.url;
            const filename = x.filename || id;

            // 统一外链：/api/p/<filename>（无论 TG/R2）
            const aliasUrl = `/api/p/${encodeURIComponent(filename)}`;

            const providerText = x.provider || "-";
            const timeText = fmtTime(x.created_at);
            const checked = selectedIds.includes(id);
            const opened = !!openMap[id];
            const codes = makeCodes(aliasUrl);

            return (
              <div key={id} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
                {/* 小图 */}
                <div className="relative">
                  <div className="absolute top-2 right-2 z-10">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(id)}
                      className="w-5 h-5"
                      aria-label="select"
                    />
                  </div>

                  <a href={aliasUrl} target="_blank" rel="noreferrer">
                    <img
                      src={aliasUrl}
                      alt={filename}
                      className="w-full h-44 object-cover bg-slate-100"
                      loading="lazy"
                    />
                  </a>
                </div>

                {/* 信息区 */}
                <div className="p-4">
                  <div className="text-xs text-slate-400 font-bold">
                    {providerText} · {timeText}
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-800 truncate">{filename}</div>

                  {/* 只保留“展开外链”按钮（移除：复制链接 / 复制Markdown） */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleOpen(id)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition"
                    >
                      {opened ? "收起外链" : "展开外链"}
                    </button>
                  </div>

                  {/* 折叠外链 */}
                  {opened && (
                    <div className="mt-4 space-y-3">
                      {Object.entries(codes).map(([k, v]) => (
                        <div key={k}>
                          <div className="text-[11px] font-black text-slate-500">{k}</div>
                          <input
                            readOnly
                            value={v}
                            onClick={(e) => {
                              e.target.select();
                              copy(v);
                            }}
                            className="mt-1 w-full p-2 bg-slate-50 border rounded text-[10px] font-mono text-slate-600 cursor-pointer hover:bg-white hover:border-blue-400 transition outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 加载更多 */}
        <div className="mt-6 flex justify-center">
          {hasMore ? (
            <button
              onClick={() => fetchList({ reset: false })}
              disabled={loading}
              className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-black hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "加载中..." : "加载更多"}
            </button>
          ) : (
            <div className="text-sm text-slate-400 font-bold">没有更多了</div>
          )}
        </div>
      </div>
    </main>
  );
}
