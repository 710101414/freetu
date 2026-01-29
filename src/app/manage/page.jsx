"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function ManagePage() {
  const [role, setRole] = useState("");
  const [authed, setAuthed] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const [provider, setProvider] = useState(""); // "", "tgchannel", "r2"
  const [date, setDate] = useState(""); // YYYY-MM-DD (仅前端筛选用)
  const [q, setQ] = useState(""); // 关键字（前端筛选 filename/url）

  const [selectedIds, setSelectedIds] = useState([]);

  // 认证：复用 isauth
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
      qs.set("limit", "50");
      if (!reset && cursor) qs.set("cursor", String(cursor));
      if (provider) qs.set("provider", provider);

      const res = await fetch(`/api/enableauthapi/list?${qs.toString()}`);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "list api failed");
      }

      const data = await res.json().catch(() => ({}));
      const newItems = Array.isArray(data.items) ? data.items : [];

      if (reset) setItems(newItems);
      else setItems((prev) => [...prev, ...newItems]);

      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.nextCursor));
    } catch (e) {
      toast.error("拉取历史失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed && role === "admin") {
      // 首次进入拉取
      fetchList({ reset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, role]);

  // 切换 provider 时重置拉取
  useEffect(() => {
    if (authed && role === "admin") {
      setCursor(null);
      setHasMore(true);
      setSelectedIds([]);
      fetchList({ reset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const filtered = useMemo(() => {
    let arr = items.slice();

    // 按日期（前端）：把 created_at(毫秒) 转成 YYYY-MM-DD 比较
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

    // 关键字：filename/url/id
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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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

      // 前端移除
      setItems((prev) => prev.filter((x) => !selectedIds.includes(x.id)));
      setSelectedIds([]);
      toast.success("删除成功");
    } catch (_) {
      toast.error("删除失败");
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <ToastContainer position="bottom-right" autoClose={2000} />
        <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-black text-slate-800">管理后台</h1>
          <p className="text-xs text-slate-400 mt-2">请先登录管理员账号</p>
          <div className="mt-6 flex gap-2">
            <Link
              href="/login"
              className="flex-1 text-center bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition"
            >
              去登录
            </Link>
            <Link
              href="/"
              className="flex-1 text-center bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
            >
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
            <Link
              href="/"
              className="flex-1 text-center bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
            >
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
                placeholder="搜索 filename / url / id"
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
            已加载 {items.length} 条记录；筛选后 {filtered.length} 条
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((x) => {
            const ts = Number(x.created_at || 0);
            const timeText = ts ? new Date(ts).toLocaleString() : "-";
            const checked = selectedIds.includes(x.id);

            return (
              <div key={x.id} className="bg-white border rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 font-bold">
                      {x.provider || "-"} · {timeText}
                    </div>
                    <div className="text-sm font-black text-slate-800 truncate mt-1">
                      {x.filename || x.id}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono break-all mt-2">
                      {x.url}
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(x.id)}
                    className="w-5 h-5 mt-1"
                  />
                </div>

                {x.url && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button
                      onClick={() => copy(x.url)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 border text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                    >
                      复制链接
                    </button>
                    <button
                      onClick={() => copy(`![image](${x.url})`)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 border text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                    >
                      复制Markdown
                    </button>
                    <a
                      href={x.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition"
                    >
                      打开
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
