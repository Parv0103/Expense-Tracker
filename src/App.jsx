import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, AreaChart, Area,
} from "recharts";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Food", icon: "🍽️", color: "#f97316" },
  { name: "Shopping", icon: "🛍️", color: "#8b5cf6" },
  { name: "Travel", icon: "✈️", color: "#0ea5e9" },
  { name: "Bills", icon: "📄", color: "#ef4444" },
  { name: "Health", icon: "💊", color: "#10b981" },
  { name: "Entertainment", icon: "🎬", color: "#f59e0b" },
  { name: "Others", icon: "📦", color: "#6b7280" },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.name, c]));
const METHODS = [
  { name: "UPI", icon: "📱" },
  { name: "Cash", icon: "💵" },
  { name: "Card", icon: "💳" },
];
const MODULES = [
  { id: "daily", icon: "📒", title: "Daily Tracker", desc: "Log and review everyday expenses" },
  { id: "budgeted", icon: "💰", title: "Budgeted Tracking", desc: "Track against income sources" },
  { id: "plan", icon: "🎯", title: "Plan a Budget", desc: "Goal-based budget planning" },
  { id: "reports", icon: "📊", title: "Reports & Insights", desc: "Analytics and trends" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "high", label: "Amount: High → Low" },
  { value: "low", label: "Amount: Low → High" },
];

// ─── STORAGE ─────────────────────────────────────────────────────────────────

const ls = {
  get: (k, fallback) => {
    try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

function usePersist(key, init) {
  const [val, setVal] = useState(() => ls.get(key, init));
  const set = useCallback((next) => {
    setVal((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      ls.set(key, resolved);
      return resolved;
    });
  }, [key]);
  return [val, set];
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = "ok") => {
    const id = ++_tid;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2800);
  }, []);
  return { toasts, push };
}
function ToastContainer({ toasts, D }) {
  return (
    <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none", width: "90%", maxWidth: 360 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding: "11px 18px", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", background: t.type === "error" ? "#ef4444" : t.type === "warn" ? "#f59e0b" : "#10b981", color: "#fff" }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const isoDate = d => new Date(d).toISOString().slice(0, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const makeEmptyForm = () => ({ amount: "", category: "Food", method: "UPI", note: "", date: todayISO(), incomeSourceId: "" });

function startOf(period) {
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - d.getDay());
  else if (period === "month") d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function labelDate(iso) {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function exportCSV(expenses) {
  const header = "Date,Category,Method,Amount,Note";
  const rows = expenses.map(e => [new Date(e.date).toLocaleString("en-IN"), e.category, e.method, e.amount, `"${e.note}"`].join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `expenses_${todayISO()}.csv`; a.click();
}

function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `expense_backup_${todayISO()}.json`; a.click();
}

// ─── SMART INSIGHTS ───────────────────────────────────────────────────────────

function computeInsights(expenses, catLimits, incomeSources) {
  const insights = [];
  const now = new Date();
  const thisMonth = startOf("month");
  const lastMonthStart = new Date(thisMonth); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthEnd = new Date(thisMonth); lastMonthEnd.setMilliseconds(-1);

  const thisMonthExp = expenses.filter(e => new Date(e.date) >= thisMonth);
  const lastMonthExp = expenses.filter(e => new Date(e.date) >= lastMonthStart && new Date(e.date) <= lastMonthEnd);

  const thisTotal = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const lastTotal = lastMonthExp.reduce((s, e) => s + e.amount, 0);

  if (lastTotal > 0 && thisTotal > 0) {
    const pct = Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
    if (pct > 0) insights.push({ icon: "📈", text: `You spent ${pct}% more than last month`, type: "warn" });
    else insights.push({ icon: "📉", text: `You spent ${Math.abs(pct)}% less than last month — great job!`, type: "ok" });
  }

  // Top category
  const catMap = {};
  thisMonthExp.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat) insights.push({ icon: "🔥", text: `Your highest spending category is ${topCat[0]} (${fmt(topCat[1])})`, type: "info" });

  // Category limits
  Object.entries(catLimits || {}).forEach(([cat, limit]) => {
    const spent = catMap[cat] || 0;
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    if (pct >= 100) insights.push({ icon: "🚨", text: `You've exceeded your ${cat} limit! Spent ${fmt(spent)} of ${fmt(limit)}`, type: "error" });
    else if (pct >= 80) insights.push({ icon: "⚠️", text: `You're at ${Math.round(pct)}% of your ${cat} limit (${fmt(spent)}/${fmt(limit)})`, type: "warn" });
  });

  // Income vs expenses
  const totalIncome = (incomeSources || []).reduce((s, src) => s + src.amount, 0);
  if (totalIncome > 0 && thisTotal > 0) {
    const pct = Math.round((thisTotal / totalIncome) * 100);
    if (pct > 90) insights.push({ icon: "💸", text: `You've used ${pct}% of your total income this month!`, type: "error" });
    else if (pct > 60) insights.push({ icon: "💡", text: `You've used ${pct}% of your income — stay mindful`, type: "warn" });
  }

  // Days with no spending
  const activeDays = new Set(thisMonthExp.map(e => isoDate(e.date))).size;
  const daysSoFar = now.getDate();
  if (activeDays < daysSoFar * 0.5 && daysSoFar > 5) insights.push({ icon: "🌱", text: `You've had ${daysSoFar - activeDays} spending-free days this month!`, type: "ok" });

  return insights;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const S = (D) => ({
  root: { minHeight: "100vh", background: D ? "#0d0d14" : "#f0f0f5", color: D ? "#e8e8f0" : "#1a1a2e", fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80, transition: "background 0.3s,color 0.3s" },
  header: { position: "sticky", top: 0, zIndex: 100, background: D ? "rgba(13,13,20,0.92)" : "rgba(240,240,245,0.88)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${D ? "#2a2a3a" : "#e0e0ea"}`, padding: "12px 16px" },
  main: { maxWidth: 600, margin: "0 auto", padding: "20px 16px 0" },
  card: { background: D ? "#1a1a28" : "#ffffff", border: `1px solid ${D ? "#2a2a3a" : "#e8e8f0"}`, borderRadius: 18, padding: "16px 18px", marginBottom: 14 },
  input: { width: "100%", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${D ? "#3a3a4a" : "#e0e0ea"}`, fontSize: 15, outline: "none", boxSizing: "border-box", background: D ? "#2a2a3a" : "#f9fafb", color: D ? "#e8e8f0" : "#1a1a2e", fontFamily: "inherit" },
  select: { width: "100%", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${D ? "#3a3a4a" : "#e0e0ea"}`, fontSize: 14, outline: "none", background: D ? "#2a2a3a" : "#f9fafb", color: D ? "#e8e8f0" : "#1a1a2e", fontFamily: "inherit", boxSizing: "border-box", cursor: "pointer" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: D ? "#a0a0b8" : "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  btn: { background: "none", border: "none", cursor: "pointer", borderRadius: 10, padding: "8px 14px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14 },
  btnPrimary: { background: "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "#fff", borderRadius: 14, fontWeight: 700, boxShadow: "0 4px 20px rgba(124,58,237,0.28)", width: "100%", padding: "13px 0", fontSize: 16 },
  btnSecondary: { background: D ? "#2a2a3a" : "#f3f4f6", color: D ? "#a0a0b8" : "#374151", borderRadius: 12, fontWeight: 600, padding: "10px 18px" },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  nav: { position: "fixed", bottom: 0, left: 0, right: 0, background: D ? "rgba(13,13,20,0.96)" : "rgba(255,255,255,0.95)", backdropFilter: "blur(14px)", borderTop: `1px solid ${D ? "#2a2a3a" : "#e0e0ea"}`, display: "flex", zIndex: 100 },
  navBtn: (active) => ({ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: active ? "#7c3aed" : D ? "#6b7280" : "#9ca3af", fontWeight: active ? 700 : 400, fontFamily: "inherit" }),
  insightOk: { background: D ? "#0a2e1a" : "#ecfdf5", border: `1px solid ${D ? "#1a5c35" : "#a7f3d0"}`, color: D ? "#6ee7b7" : "#065f46" },
  insightWarn: { background: D ? "#2e2000" : "#fffbeb", border: `1px solid ${D ? "#5c3a00" : "#fde68a"}`, color: D ? "#fbbf24" : "#92400e" },
  insightError: { background: D ? "#2e0a0a" : "#fef2f2", border: `1px solid ${D ? "#5c1a1a" : "#fca5a5"}`, color: D ? "#f87171" : "#991b1b" },
  insightInfo: { background: D ? "#0a1a2e" : "#eff6ff", border: `1px solid ${D ? "#1a3a5c" : "#bfdbfe"}`, color: D ? "#93c5fd" : "#1e40af" },
});

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = "#7c3aed", height = 8 }) {
  const safe = Math.min(100, Math.max(0, pct));
  const bg = safe >= 100 ? "#ef4444" : safe >= 80 ? "#f59e0b" : color;
  return (
    <div style={{ height, borderRadius: 99, background: "rgba(0,0,0,0.1)", overflow: "hidden", width: "100%" }}>
      <div style={{ height: "100%", width: `${safe}%`, background: bg, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

// ─── EXPENSE CARD ─────────────────────────────────────────────────────────────

function ExpenseCard({ e, D, onEdit, onDelete }) {
  const s = S(D);
  const meta = CAT_MAP[e.category] || { icon: "📦", color: "#6b7280" };
  return (
    <div style={{ ...s.card, display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: meta.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.note || e.category}</div>
        <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", marginTop: 2 }}>
          <span style={{ background: meta.color + "22", color: meta.color, borderRadius: 6, padding: "1px 7px", fontSize: 11, fontWeight: 600, marginRight: 6 }}>{e.category}</span>
          {METHODS.find(m => m.name === e.method)?.icon} {e.method} · {labelDate(e.date)}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{fmt(e.amount)}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
          <button style={{ ...s.btn, fontSize: 11, padding: "3px 10px", color: "#7c3aed", border: "1px solid #7c3aed33" }} onClick={() => onEdit(e)}>Edit</button>
          <button style={{ ...s.btn, fontSize: 11, padding: "3px 10px", color: "#ef4444", border: "1px solid #ef444433" }} onClick={() => onDelete(e.id)}>Del</button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD EXPENSE FORM ────────────────────────────────────────────────────────

function AddExpenseForm({ D, form, setForm, handleSubmit, editingId, cancelEdit, incomeSources = [], budgetPlans = [], forModule = "daily" }) {
  const s = S(D);
  return (
    <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={s.label}>Amount (₹)</label>
        <input type="number" min="0" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={{ ...s.input, fontSize: 22, fontWeight: 700, textAlign: "center" }} />
      </div>
      <div>
        <label style={s.label}>Category</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map(c => (
            <button key={c.name} style={{ ...s.chip, background: form.category === c.name ? c.color : D ? "#2a2a3a" : "#f3f4f6", color: form.category === c.name ? "#fff" : D ? "#a0a0b8" : "#374151", border: `1.5px solid ${form.category === c.name ? c.color : D ? "#3a3a4a" : "#e5e7eb"}` }} onClick={() => setForm({ ...form, category: c.name })}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={s.label}>Payment Method</label>
        <div style={{ display: "flex", gap: 10 }}>
          {METHODS.map(m => (
            <button key={m.name} style={{ ...s.chip, flex: 1, justifyContent: "center", background: form.method === m.name ? "#7c3aed" : D ? "#2a2a3a" : "#f3f4f6", color: form.method === m.name ? "#fff" : D ? "#a0a0b8" : "#374151", border: `1.5px solid ${form.method === m.name ? "#7c3aed" : D ? "#3a3a4a" : "#e5e7eb"}`, padding: "10px 8px", fontSize: 15 }} onClick={() => setForm({ ...form, method: m.name })}>
              {m.icon} {m.name}
            </button>
          ))}
        </div>
      </div>
      {incomeSources.length > 0 && (
        <div>
          <label style={s.label}>Income Source (optional)</label>
          <select style={s.select} value={form.incomeSourceId} onChange={e => setForm({ ...form, incomeSourceId: e.target.value })}>
            <option value="">None / General</option>
            {incomeSources.map(src => <option key={src.id} value={src.id}>{src.name} ({fmt(src.amount)})</option>)}
          </select>
        </div>
      )}
      {budgetPlans.length > 0 && (
        <div>
          <label style={s.label}>Budget Plan (optional)</label>
          <select style={s.select} value={form.budgetPlanId || ""} onChange={e => setForm({ ...form, budgetPlanId: e.target.value })}>
            <option value="">None</option>
            {budgetPlans.map(p => <option key={p.id} value={p.id}>{p.name} (Remaining: {fmt(Math.max(0, p.target - p.spent))})</option>)}
          </select>
        </div>
      )}
      <div>
        <label style={s.label}>Note</label>
        <input type="text" placeholder="What was this for?" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={s.input} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} />
      </div>
      <div>
        <label style={s.label}>Date</label>
        <input type="date" max={todayISO()} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={s.input} />
      </div>
      <button onClick={handleSubmit} style={{ ...s.btn, ...s.btnPrimary }}>{editingId ? "Update Expense ✓" : "Add Expense +"}</button>
      {editingId && <button onClick={cancelEdit} style={{ ...s.btn, color: D ? "#a0a0b8" : "#9ca3af" }}>Cancel</button>}
    </div>
  );
}

// ─── WELCOME SCREEN ───────────────────────────────────────────────────────────

function WelcomeScreen({ D, onSelect }) {
  const s = S(D);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", background: D ? "#0d0d14" : "#f0f0f5" }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>💎</div>
      <h1 style={{ fontWeight: 900, fontSize: 28, margin: "0 0 6px", textAlign: "center", color: D ? "#e8e8f0" : "#1a1a2e" }}>Choose Your Purpose</h1>
      <p style={{ color: D ? "#6b7280" : "#9ca3af", marginBottom: 32, textAlign: "center", fontSize: 15 }}>How would you like to use Expense Manager today?</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, width: "100%", maxWidth: 520 }}>
        {MODULES.map(m => (
          <button key={m.id} onClick={() => onSelect(m.id)} style={{ ...s.card, cursor: "pointer", border: `2px solid ${D ? "#2a2a3a" : "#e0e0ea"}`, textAlign: "left", background: D ? "#1a1a28" : "#fff", transition: "transform 0.15s,border-color 0.15s", padding: "20px 18px" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = D ? "#2a2a3a" : "#e0e0ea"; e.currentTarget.style.transform = "translateY(0)"; }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{m.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: D ? "#e8e8f0" : "#1a1a2e", marginBottom: 4 }}>{m.title}</div>
            <div style={{ fontSize: 12, color: D ? "#6b7280" : "#9ca3af", lineHeight: 1.4 }}>{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── DAILY TRACKER ────────────────────────────────────────────────────────────

function DailyTracker({ D, expenses, setExpenses, push, catLimits, incomeSources, budgetPlans, setBudgetPlans }) {
  const s = S(D);
  const [form, setForm] = useState(makeEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterMethod, setFilterMethod] = useState("All");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSubmit = useCallback(() => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { push("Enter a valid amount", "error"); return; }
    const selectedDate = form.date ? new Date(form.date + "T12:00:00").toISOString() : new Date().toISOString();

    // Deduct from budget plan if linked
    if (form.budgetPlanId && !editingId) {
      setBudgetPlans(prev => prev.map(p => p.id === form.budgetPlanId ? { ...p, spent: (p.spent || 0) + amt } : p));
    }

    if (editingId) {
      setExpenses(p => p.map(e => e.id === editingId ? { ...e, ...form, amount: amt, date: selectedDate } : e));
      setEditingId(null); push("Expense updated ✓");
    } else {
      setExpenses(p => [{ id: Date.now(), ...form, amount: amt, date: selectedDate }, ...p]);
      push("Expense added ✓");
    }
    setForm(makeEmptyForm()); setShowAddForm(false);
  }, [form, editingId, setExpenses, push, setBudgetPlans]);

  const deleteExpense = useCallback(id => { setExpenses(p => p.filter(e => e.id !== id)); push("Deleted"); }, [setExpenses, push]);
  const startEdit = useCallback(exp => { setForm({ amount: String(exp.amount), category: exp.category, method: exp.method, note: exp.note, date: isoDate(exp.date), incomeSourceId: exp.incomeSourceId || "", budgetPlanId: exp.budgetPlanId || "" }); setEditingId(exp.id); setShowAddForm(true); }, []);
  const cancelEdit = () => { setForm(makeEmptyForm()); setEditingId(null); setShowAddForm(false); };

  const filtered = useMemo(() => {
    let list = [...expenses];
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(e => e.note.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)); }
    if (filterCat !== "All") list = list.filter(e => e.category === filterCat);
    if (filterMethod !== "All") list = list.filter(e => e.method === filterMethod);
    if (filterFrom) list = list.filter(e => isoDate(e.date) >= filterFrom);
    if (filterTo) list = list.filter(e => isoDate(e.date) <= filterTo);
    if (sort === "oldest") list.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === "high") list.sort((a, b) => b.amount - a.amount);
    else if (sort === "low") list.sort((a, b) => a.amount - b.amount);
    else list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }, [expenses, search, filterCat, filterMethod, filterFrom, filterTo, sort]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const todayTotal = filtered.filter(e => isoDate(e.date) === todayISO()).reduce((s, e) => s + e.amount, 0);
  const weekTotal = filtered.filter(e => new Date(e.date) >= startOf("week")).reduce((s, e) => s + e.amount, 0);
  const monthTotal = filtered.filter(e => new Date(e.date) >= startOf("month")).reduce((s, e) => s + e.amount, 0);

  // Category limit warnings
  const thisMonthExp = expenses.filter(e => new Date(e.date) >= startOf("month"));
  const catSpent = {};
  thisMonthExp.forEach(e => { catSpent[e.category] = (catSpent[e.category] || 0) + e.amount; });
  const limitWarnings = Object.entries(catLimits || {}).filter(([cat, lim]) => lim > 0 && catSpent[cat] && (catSpent[cat] / lim) >= 0.8);

  return (
    <div>
      {limitWarnings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {limitWarnings.map(([cat, lim]) => {
            const spent = catSpent[cat] || 0;
            const pct = Math.round((spent / lim) * 100);
            return (
              <div key={cat} style={{ borderRadius: 12, padding: "10px 14px", marginBottom: 8, background: pct >= 100 ? (D ? "#2e0a0a" : "#fef2f2") : (D ? "#2e2000" : "#fffbeb"), border: `1px solid ${pct >= 100 ? "#f87171" : "#fbbf24"}`, color: pct >= 100 ? "#ef4444" : "#d97706", fontSize: 13, fontWeight: 600 }}>
                {pct >= 100 ? "🚨" : "⚠️"} {cat}: {fmt(spent)} / {fmt(lim)} ({pct}%)
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        {[["Today", todayTotal], ["This Week", weekTotal], ["This Month", monthTotal]].map(([label, val]) => (
          <div key={label} style={{ ...s.card, textAlign: "center", marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#7c3aed" }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ ...s.card, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af" }}>All-time total ({filtered.length} transactions)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#7c3aed" }}>{fmt(total)}</div>
        </div>
        <button onClick={() => setShowAddForm(v => !v)} style={{ ...s.btn, background: "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "#fff", borderRadius: 12, fontWeight: 700, padding: "10px 18px" }}>
          {showAddForm ? "✕ Cancel" : "➕ Add"}
        </button>
      </div>

      {showAddForm && (
        <div style={{ marginBottom: 14 }}>
          <AddExpenseForm D={D} form={form} setForm={setForm} handleSubmit={handleSubmit} editingId={editingId} cancelEdit={cancelEdit} incomeSources={incomeSources} budgetPlans={budgetPlans} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input style={{ ...s.input, flex: 1 }} placeholder="🔍  Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <button style={{ ...s.btn, padding: "0 14px", borderRadius: 12, background: D ? "#2a2a3a" : "#f3f4f6" }} onClick={() => setShowFilters(v => !v)}>{showFilters ? "✕" : "⚙️"}</button>
      </div>

      {showFilters && (
        <div style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={s.label}>Category</label><select style={s.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}><option>All</option>{CATEGORIES.map(c => <option key={c.name}>{c.name}</option>)}</select></div>
            <div><label style={s.label}>Method</label><select style={s.select} value={filterMethod} onChange={e => setFilterMethod(e.target.value)}><option>All</option>{METHODS.map(m => <option key={m.name}>{m.name}</option>)}</select></div>
            <div><label style={s.label}>From</label><input type="date" style={s.input} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
            <div><label style={s.label}>To</label><input type="date" style={s.input} value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
          </div>
          <label style={s.label}>Sort</label>
          <select style={s.select} value={sort} onChange={e => setSort(e.target.value)}>{SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <button style={{ ...s.btn, marginTop: 10, fontSize: 12, color: "#ef4444", border: "1px solid #ef444433", borderRadius: 8 }} onClick={() => { setSearch(""); setFilterCat("All"); setFilterMethod("All"); setFilterFrom(""); setFilterTo(""); setSort("newest"); }}>Reset filters</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: D ? "#6b7280" : "#9ca3af" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🪴</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No expenses yet</div>
          <div style={{ fontSize: 13 }}>Tap ➕ Add to get started</div>
        </div>
      ) : filtered.map(e => <ExpenseCard key={e.id} e={e} D={D} onEdit={startEdit} onDelete={deleteExpense} />)}

      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 13 }} onClick={() => { exportCSV(filtered); push("CSV exported ✓"); }}>⬇️ Export CSV</button>
        {expenses.length > 0 && (
          showClearConfirm ? (
            <>
              <button style={{ ...s.btn, color: "#ef4444", border: "1px solid #ef4444", borderRadius: 10 }} onClick={() => { setExpenses([]); setShowClearConfirm(false); push("Cleared"); }}>Yes, delete all</button>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => setShowClearConfirm(false)}>Cancel</button>
            </>
          ) : <button style={{ ...s.btn, color: "#9ca3af", fontSize: 13 }} onClick={() => setShowClearConfirm(true)}>🗑 Clear all</button>
        )}
      </div>
    </div>
  );
}

// ─── BUDGETED TRACKING ────────────────────────────────────────────────────────

function BudgetedTracking({ D, expenses, setExpenses, push, incomeSources, setIncomeSources, budgetPlans, setBudgetPlans }) {
  const s = S(D);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ name: "", amount: "", frequency: "monthly" });
  const [showAddExp, setShowAddExp] = useState(false);
  const [form, setForm] = useState(makeEmptyForm());
  const [editingId, setEditingId] = useState(null);

  const addIncome = () => {
    const amt = parseFloat(incomeForm.amount);
    if (!incomeForm.name.trim() || !amt || amt <= 0) { push("Enter valid income details", "error"); return; }
    setIncomeSources(p => [...p, { id: Date.now(), name: incomeForm.name.trim(), amount: amt, frequency: incomeForm.frequency }]);
    setIncomeForm({ name: "", amount: "", frequency: "monthly" }); setShowAddIncome(false); push("Income source added ✓");
  };

  const removeIncome = id => { setIncomeSources(p => p.filter(s => s.id !== id)); push("Removed"); };

  const handleSubmit = () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { push("Enter a valid amount", "error"); return; }
    const selectedDate = form.date ? new Date(form.date + "T12:00:00").toISOString() : new Date().toISOString();
    if (editingId) {
      setExpenses(p => p.map(e => e.id === editingId ? { ...e, ...form, amount: amt, date: selectedDate } : e));
      setEditingId(null);
    } else {
      setExpenses(p => [{ id: Date.now(), ...form, amount: amt, date: selectedDate }, ...p]);
    }
    setForm(makeEmptyForm()); setShowAddExp(false); push("Expense logged ✓");
  };

  const totalIncome = incomeSources.reduce((s, src) => s + src.amount, 0);
  const thisMonthExp = expenses.filter(e => new Date(e.date) >= startOf("month"));
  const totalExpenses = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const remaining = totalIncome - totalExpenses;

  return (
    <div>
      <div style={{ ...s.card, background: D ? "#1a1a28" : "linear-gradient(135deg,#7c3aed15,#5b21b608)", marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Income</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{fmt(totalIncome)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Spent (Mo)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#ef4444" }}>{fmt(totalExpenses)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Remaining</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: remaining >= 0 ? "#7c3aed" : "#ef4444" }}>{fmt(remaining)}</div>
          </div>
        </div>
        {totalIncome > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", marginBottom: 6 }}>
              <span>Budget used</span><span>{Math.min(100, Math.round((totalExpenses / totalIncome) * 100))}%</span>
            </div>
            <ProgressBar pct={(totalExpenses / totalIncome) * 100} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Income Sources</h3>
        <button style={{ ...s.btn, background: "#7c3aed22", color: "#7c3aed", borderRadius: 10, fontWeight: 600, fontSize: 13 }} onClick={() => setShowAddIncome(v => !v)}>{showAddIncome ? "✕ Cancel" : "+ Add Source"}</button>
      </div>

      {showAddIncome && (
        <div style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={s.label}>Source Name</label><input style={s.input} placeholder="e.g. Salary" value={incomeForm.name} onChange={e => setIncomeForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={s.label}>Amount (₹)</label><input type="number" style={s.input} placeholder="0" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} /></div>
          </div>
          <label style={s.label}>Frequency</label>
          <select style={{ ...s.select, marginBottom: 12 }} value={incomeForm.frequency} onChange={e => setIncomeForm(f => ({ ...f, frequency: e.target.value }))}>
            <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="one-time">One-time</option>
          </select>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={addIncome}>Add Income Source</button>
        </div>
      )}

      {incomeSources.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: D ? "#6b7280" : "#9ca3af" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>💰</div>
          <div style={{ fontSize: 14 }}>Add income sources to start budgeted tracking</div>
        </div>
      ) : incomeSources.map(src => {
        const srcExpenses = thisMonthExp.filter(e => e.incomeSourceId === String(src.id));
        const srcSpent = srcExpenses.reduce((s, e) => s + e.amount, 0);
        const srcPct = src.amount > 0 ? (srcSpent / src.amount) * 100 : 0;
        return (
          <div key={src.id} style={{ ...s.card, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{src.name}</div>
                <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af" }}>{src.frequency} · {fmt(src.amount)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, color: "#10b981", fontSize: 15 }}>{fmt(src.amount - srcSpent)} left</div>
                <button style={{ ...s.btn, fontSize: 11, color: "#ef4444", padding: "2px 8px", border: "1px solid #ef444433", borderRadius: 6 }} onClick={() => removeIncome(src.id)}>Remove</button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", marginBottom: 4 }}>
              <span>Spent: {fmt(srcSpent)}</span><span>{Math.round(srcPct)}%</span>
            </div>
            <ProgressBar pct={srcPct} />
          </div>
        );
      })}

      <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Log Expense</h3>
        <button style={{ ...s.btn, background: "#7c3aed", color: "#fff", borderRadius: 10, fontWeight: 600, fontSize: 13 }} onClick={() => setShowAddExp(v => !v)}>{showAddExp ? "✕ Cancel" : "➕ Add"}</button>
      </div>
      {showAddExp && <AddExpenseForm D={D} form={form} setForm={setForm} handleSubmit={handleSubmit} editingId={editingId} cancelEdit={() => { setEditingId(null); setShowAddExp(false); setForm(makeEmptyForm()); }} incomeSources={incomeSources} />}

      <div style={{ marginTop: 10 }}>
        {expenses.filter(e => new Date(e.date) >= startOf("month")).slice(0, 8).map(e => <ExpenseCard key={e.id} e={e} D={D} onEdit={exp => { setForm({ amount: String(exp.amount), category: exp.category, method: exp.method, note: exp.note, date: isoDate(exp.date), incomeSourceId: exp.incomeSourceId || "" }); setEditingId(exp.id); setShowAddExp(true); }} onDelete={id => { setExpenses(p => p.filter(e => e.id !== id)); push("Deleted"); }} />)}
      </div>
    </div>
  );
}

// ─── PLAN A BUDGET ────────────────────────────────────────────────────────────

function PlanBudget({ D, budgetPlans, setBudgetPlans, expenses, setExpenses, push }) {
  const s = S(D);
  const [showForm, setShowForm] = useState(false);
  const [planForm, setPlanForm] = useState({ name: "", target: "", duration: "", notes: "" });
  const [activeplan, setActivePlan] = useState(null);
  const [expForm, setExpForm] = useState(makeEmptyForm());

  const addPlan = () => {
    const target = parseFloat(planForm.target);
    if (!planForm.name.trim() || !target || target <= 0) { push("Enter plan name and target amount", "error"); return; }
    setBudgetPlans(p => [...p, { id: Date.now(), name: planForm.name.trim(), target, duration: planForm.duration, notes: planForm.notes, spent: 0, createdAt: new Date().toISOString() }]);
    setPlanForm({ name: "", target: "", duration: "", notes: "" }); setShowForm(false); push("Budget plan created ✓");
  };

  const deletePlan = id => { setBudgetPlans(p => p.filter(pl => pl.id !== id)); push("Plan deleted"); };

  const addExpToPlan = (plan) => {
    const amt = parseFloat(expForm.amount);
    if (!amt || amt <= 0) { push("Enter a valid amount", "error"); return; }
    const entry = { id: Date.now(), ...expForm, amount: amt, date: new Date(expForm.date + "T12:00:00").toISOString(), budgetPlanId: plan.id };
    setExpenses(p => [entry, ...p]);
    setBudgetPlans(p => p.map(pl => pl.id === plan.id ? { ...pl, spent: (pl.spent || 0) + amt } : pl));
    setExpForm(makeEmptyForm()); setActivePlan(null); push("Expense added to plan ✓");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>Budget Plans</h2>
        <button style={{ ...s.btn, background: "#7c3aed", color: "#fff", borderRadius: 12, fontWeight: 600 }} onClick={() => setShowForm(v => !v)}>{showForm ? "✕ Cancel" : "+ New Plan"}</button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={s.label}>Plan Name</label><input style={s.input} placeholder="e.g. Goa Trip" value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={s.label}>Target Amount (₹)</label><input type="number" style={s.input} placeholder="0" value={planForm.target} onChange={e => setPlanForm(f => ({ ...f, target: e.target.value }))} /></div>
          </div>
          <label style={s.label}>Duration (optional)</label>
          <input style={{ ...s.input, marginBottom: 10 }} placeholder="e.g. 3 months, Dec 2025" value={planForm.duration} onChange={e => setPlanForm(f => ({ ...f, duration: e.target.value }))} />
          <label style={s.label}>Notes</label>
          <input style={{ ...s.input, marginBottom: 12 }} placeholder="Any notes..." value={planForm.notes} onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))} />
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={addPlan}>Create Plan</button>
        </div>
      )}

      {budgetPlans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: D ? "#6b7280" : "#9ca3af" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No budget plans yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Create one to start goal-based tracking</div>
        </div>
      ) : budgetPlans.map(plan => {
        const pct = plan.target > 0 ? (plan.spent / plan.target) * 100 : 0;
        const planExps = expenses.filter(e => e.budgetPlanId === plan.id);
        return (
          <div key={plan.id} style={{ ...s.card, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{plan.name}</div>
                {plan.duration && <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", marginTop: 2 }}>📅 {plan.duration}</div>}
                {plan.notes && <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", marginTop: 2 }}>💬 {plan.notes}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: pct >= 100 ? "#ef4444" : "#7c3aed" }}>{fmt(plan.spent || 0)} / {fmt(plan.target)}</div>
                <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af" }}>{Math.round(pct)}% used</div>
              </div>
            </div>
            <ProgressBar pct={pct} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af" }}>{planExps.length} transactions</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...s.btn, fontSize: 12, color: "#7c3aed", border: "1px solid #7c3aed33", borderRadius: 8, padding: "4px 12px" }} onClick={() => setActivePlan(activePlan?.id === plan.id ? null : plan)}>+ Add Expense</button>
                <button style={{ ...s.btn, fontSize: 12, color: "#ef4444", border: "1px solid #ef444433", borderRadius: 8, padding: "4px 12px" }} onClick={() => deletePlan(plan.id)}>Delete</button>
              </div>
            </div>
            {activePlan?.id === plan.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D ? "#2a2a3a" : "#e8e8f0"}` }}>
                <AddExpenseForm D={D} form={expForm} setForm={setExpForm} handleSubmit={() => addExpToPlan(plan)} editingId={null} cancelEdit={() => setActivePlan(null)} />
              </div>
            )}
            {planExps.slice(0, 3).map(e => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${D ? "#2a2a3a" : "#f0f0f5"}`, marginTop: 4 }}>
                <span style={{ fontSize: 13, color: D ? "#a0a0b8" : "#6b7280" }}>{CATEGORY_ICONS_MAP[e.category] || "📦"} {e.note || e.category} <span style={{ color: D ? "#6b7280" : "#9ca3af", fontSize: 11 }}>· {labelDate(e.date)}</span></span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(e.amount)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const CATEGORY_ICONS_MAP = Object.fromEntries(CATEGORIES.map(c => [c.name, c.icon]));

// ─── REPORTS ──────────────────────────────────────────────────────────────────

function Reports({ D, expenses, incomeSources, budgetPlans, push }) {
  const s = S(D);
  const [period, setPeriod] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));

  const periodExp = useMemo(() => {
    if (period === "month") {
      return expenses.filter(e => e.date.startsWith(selectedMonth));
    }
    return expenses.filter(e => new Date(e.date) >= startOf("week"));
  }, [expenses, period, selectedMonth]);

  const periodTotal = periodExp.reduce((s, e) => s + e.amount, 0);

  const catBreakdown = useMemo(() => {
    const map = {};
    periodExp.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodExp]);

  const methodBreakdown = useMemo(() => {
    const map = {};
    periodExp.forEach(e => { map[e.method] = (map[e.method] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodExp]);

  const pieData = catBreakdown.map(([name, value]) => ({ name, value }));

  const barData = useMemo(() => {
    const days = period === "week" ? 7 : 30;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      if (period === "month") { d.setDate(1); d.setDate(d.getDate() + (days - 1 - i)); }
      else d.setDate(d.getDate() - i);
      const key = isoDate(d);
      const dayLabel = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const amt = periodExp.filter(e => isoDate(e.date) === key).reduce((s, e) => s + e.amount, 0);
      result.push({ date: dayLabel, amount: amt });
    }
    return result;
  }, [periodExp, period]);

  const totalIncome = incomeSources.reduce((s, src) => s + src.amount, 0);

  const insights = useMemo(() => computeInsights(expenses, {}, incomeSources), [expenses, incomeSources]);

  const insightStyle = (type, D) => {
    const s = S(D);
    if (type === "ok") return s.insightOk;
    if (type === "warn") return s.insightWarn;
    if (type === "error") return s.insightError;
    return s.insightInfo;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["week", "month"].map(p => (
          <button key={p} style={{ ...s.btn, flex: 1, background: period === p ? "#7c3aed" : D ? "#2a2a3a" : "#f3f4f6", color: period === p ? "#fff" : D ? "#a0a0b8" : "#374151", borderRadius: 12, fontWeight: 700, padding: "10px 0", border: "none" }} onClick={() => setPeriod(p)}>
            This {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
      {period === "month" && (
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Select Month</label>
          <input type="month" style={s.input} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
        </div>
      )}

      {/* Smart Insights */}
      {insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>💡 Smart Insights</h3>
          {insights.map((ins, i) => (
            <div key={i} style={{ borderRadius: 12, padding: "10px 14px", marginBottom: 8, fontSize: 13, fontWeight: 500, ...insightStyle(ins.type, D) }}>
              {ins.icon} {ins.text}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ ...s.card, textAlign: "center", marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Total Spent</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{fmt(periodTotal)}</div>
        </div>
        {totalIncome > 0 && (
          <div style={{ ...s.card, textAlign: "center", marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Income</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>{fmt(totalIncome)}</div>
          </div>
        )}
        <div style={{ ...s.card, textAlign: "center", marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Transactions</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#7c3aed" }}>{periodExp.length}</div>
        </div>
        <div style={{ ...s.card, textAlign: "center", marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Avg/Transaction</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{periodExp.length > 0 ? fmt(Math.round(periodTotal / periodExp.length)) : "₹0"}</div>
        </div>
      </div>

      {periodExp.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: D ? "#6b7280" : "#9ca3af" }}>No data for this period</div>
      ) : (
        <>
          {/* Category breakdown */}
          <div style={{ ...s.card, marginBottom: 14 }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, margin: "0 0 12px" }}>By Category</h3>
            {catBreakdown.map(([cat, amt]) => {
              const pct = periodTotal > 0 ? (amt / periodTotal) * 100 : 0;
              const meta = CAT_MAP[cat] || { icon: "📦", color: "#6b7280" };
              return (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{meta.icon} {cat}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(amt)} <span style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af" }}>({pct.toFixed(1)}%)</span></span>
                  </div>
                  <ProgressBar pct={pct} color={meta.color} height={6} />
                </div>
              );
            })}
          </div>

          {/* Method breakdown */}
          <div style={{ ...s.card, marginBottom: 14 }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, margin: "0 0 12px" }}>Payment Methods</h3>
            {methodBreakdown.map(([method, amt]) => {
              const pct = periodTotal > 0 ? (amt / periodTotal) * 100 : 0;
              const icon = METHODS.find(m => m.name === method)?.icon || "💳";
              return (
                <div key={method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${D ? "#2a2a3a" : "#f0f0f5"}` }}>
                  <span>{icon} {method}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{fmt(amt)}</div>
                    <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af" }}>{pct.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PIE CHART */}
          <div style={{ ...s.card, marginBottom: 14 }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, margin: "0 0 12px" }}>Category Split</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map(entry => <Cell key={entry.name} fill={(CAT_MAP[entry.name] || { color: "#6b7280" }).color} />)}
                </Pie>
                <RTooltip formatter={v => fmt(v)} contentStyle={{ background: D ? "#1a1a28" : "#fff", border: `1px solid ${D ? "#2a2a3a" : "#e5e7eb"}`, borderRadius: 10, fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* BAR CHART */}
          <div style={{ ...s.card, marginBottom: 14 }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, margin: "0 0 12px" }}>Daily Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={D ? "#2a2a3a" : "#f0f0f5"} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: D ? "#a0a0b8" : "#9ca3af" }} interval={period === "month" ? 4 : 0} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: D ? "#a0a0b8" : "#9ca3af" }} tickFormatter={v => `₹${v}`} tickLine={false} axisLine={false} />
                <RTooltip formatter={v => [fmt(v), "Spent"]} contentStyle={{ background: D ? "#1a1a28" : "#fff", border: `1px solid ${D ? "#2a2a3a" : "#e5e7eb"}`, borderRadius: 10, fontSize: 13 }} />
                <Bar dataKey="amount" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Budget vs Actual */}
          {budgetPlans.length > 0 && (
            <div style={{ ...s.card, marginBottom: 14 }}>
              <h3 style={{ fontWeight: 800, fontSize: 15, margin: "0 0 12px" }}>Budget Plans Progress</h3>
              {budgetPlans.map(plan => {
                const pct = plan.target > 0 ? (plan.spent / plan.target) * 100 : 0;
                return (
                  <div key={plan.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{plan.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: pct >= 100 ? "#ef4444" : "#7c3aed" }}>{fmt(plan.spent || 0)} / {fmt(plan.target)}</span>
                    </div>
                    <ProgressBar pct={pct} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Export */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <button style={{ ...s.btn, ...s.btnSecondary, flex: 1, fontSize: 13 }} onClick={() => { exportCSV(periodExp); push("CSV exported ✓"); }}>⬇️ Export CSV</button>
            <button style={{ ...s.btn, ...s.btnSecondary, flex: 1, fontSize: 13 }} onClick={() => { exportJSON({ expenses, incomeSources, budgetPlans }); push("Full backup exported ✓"); }}>💾 Full Backup</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── CATEGORY LIMITS SETTINGS ─────────────────────────────────────────────────

function CategoryLimitsSettings({ D, catLimits, setCatLimits, push }) {
  const s = S(D);
  const [localLimits, setLocalLimits] = useState(() => {
    const obj = {};
    CATEGORIES.forEach(c => { obj[c.name] = catLimits[c.name] || ""; });
    return obj;
  });

  const save = () => {
    const cleaned = {};
    Object.entries(localLimits).forEach(([k, v]) => { if (v && parseFloat(v) > 0) cleaned[k] = parseFloat(v); });
    setCatLimits(cleaned); push("Category limits saved ✓");
  };

  return (
    <div style={{ ...s.card }}>
      <h3 style={{ fontWeight: 800, fontSize: 15, margin: "0 0 14px" }}>Category Spending Limits (Monthly)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {CATEGORIES.map(c => (
          <div key={c.name}>
            <label style={{ ...s.label, color: c.color }}>{c.icon} {c.name}</label>
            <input type="number" style={s.input} placeholder="No limit" value={localLimits[c.name]} onChange={e => setLocalLimits(p => ({ ...p, [c.name]: e.target.value }))} />
          </div>
        ))}
      </div>
      <button style={{ ...s.btn, ...s.btnPrimary }} onClick={save}>Save Limits</button>
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function SettingsPanel({ D, dark, setDark, username, setUsername, selectedModule, setSelectedModule, catLimits, setCatLimits, expenses, incomeSources, budgetPlans, setExpenses, setIncomeSources, setBudgetPlans, push }) {
  const s = S(D);
  const [nameEdit, setNameEdit] = useState(username);
  const fileRef = useRef();

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.expenses) setExpenses(data.expenses);
        if (data.incomeSources) setIncomeSources(data.incomeSources);
        if (data.budgetPlans) setBudgetPlans(data.budgetPlans);
        push("Data imported successfully ✓");
      } catch { push("Import failed — invalid file", "error"); }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 18, margin: "0 0 16px" }}>⚙️ Settings</h2>

      <div style={{ ...s.card, marginBottom: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 12px" }}>Profile</h3>
        <label style={s.label}>Your Name</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...s.input, flex: 1 }} value={nameEdit} onChange={e => setNameEdit(e.target.value)} />
          <button style={{ ...s.btn, background: "#7c3aed", color: "#fff", borderRadius: 10, fontWeight: 600, padding: "0 16px" }} onClick={() => { setUsername(nameEdit); push("Name updated ✓"); }}>Save</button>
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 12px" }}>Appearance</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15 }}>{dark ? "🌙 Dark Mode" : "☀️ Light Mode"}</span>
          <button style={{ ...s.btn, background: dark ? "#7c3aed" : "#e5e7eb", color: dark ? "#fff" : "#374151", borderRadius: 20, padding: "6px 18px", fontWeight: 600 }} onClick={() => setDark(v => !v)}>Toggle</button>
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 12px" }}>Default Module</h3>
        <select style={{ ...s.select, marginBottom: 10 }} value={selectedModule || ""} onChange={e => setSelectedModule(e.target.value || null)}>
          <option value="">Show welcome screen</option>
          {MODULES.map(m => <option key={m.id} value={m.id}>{m.icon} {m.title}</option>)}
        </select>
        <button style={{ ...s.btn, color: "#ef4444", fontSize: 13, padding: 0 }} onClick={() => { setSelectedModule(null); push("Default view reset"); }}>Reset to welcome screen</button>
      </div>

      <CategoryLimitsSettings D={D} catLimits={catLimits} setCatLimits={setCatLimits} push={push} />

      <div style={{ ...s.card, marginTop: 14, marginBottom: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 12px" }}>Backup & Restore</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 13 }} onClick={() => { exportJSON({ expenses, incomeSources, budgetPlans }); push("Backup exported ✓"); }}>💾 Export Backup</button>
          <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 13 }} onClick={() => fileRef.current?.click()}>📥 Import Backup</button>
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [expenses, setExpenses] = usePersist("xp_expenses_v2", []);
  const [incomeSources, setIncomeSources] = usePersist("xp_income_sources", []);
  const [budgetPlans, setBudgetPlans] = usePersist("xp_budget_plans", []);
  const [catLimits, setCatLimits] = usePersist("xp_cat_limits", {});
  const [username, setUsername] = usePersist("xp_username", "");
  const [dark, setDark] = usePersist("xp_dark", false);
  const [selectedModule, setSelectedModule] = usePersist("xp_selected_module", null);
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const { toasts, push } = useToast();
  const D = dark;
  const s = S(D);

  // Migrate old storage key if present
  useEffect(() => {
    try {
      const old = localStorage.getItem("xp_expenses");
      if (old && !localStorage.getItem("xp_expenses_v2")) {
        const parsed = JSON.parse(old);
        if (Array.isArray(parsed) && parsed.length > 0) {
          ls.set("xp_expenses_v2", parsed);
          setExpenses(parsed);
          push("Migrated existing data ✓");
        }
      }
    } catch {}
  }, []);

  // Determine which tab/module to show
  const activeTab = tab || selectedModule;

  // First run: get name
  if (!username) {
    return (
      <div style={s.root}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...s.card, maxWidth: 360, width: "100%", textAlign: "center", padding: "40px 32px" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>👋</div>
            <h2 style={{ fontWeight: 900, fontSize: 26, margin: "0 0 8px" }}>Welcome!</h2>
            <p style={{ color: D ? "#a0a0b8" : "#6b7280", marginBottom: 24, fontSize: 15 }}>What should we call you?</p>
            <input autoFocus style={{ ...s.input, marginBottom: 16, fontSize: 16, textAlign: "center" }} placeholder="Your name" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && nameInput.trim()) setUsername(nameInput.trim()); }} />
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => { if (nameInput.trim()) setUsername(nameInput.trim()); }}>Get Started →</button>
          </div>
        </div>
        <ToastContainer toasts={toasts} D={D} />
      </div>
    );
  }

  // Welcome/Module selector
  if (!activeTab) {
    return (
      <div style={s.root}>
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }}>
          <button style={{ ...s.btn, background: D ? "#2a2a3a" : "#f3f4f6", borderRadius: 10, width: 38, height: 38, padding: 0 }} onClick={() => setDark(v => !v)}>{D ? "☀️" : "🌙"}</button>
        </div>
        <WelcomeScreen D={D} onSelect={mod => { setSelectedModule(mod); setTab(mod); }} />
        <ToastContainer toasts={toasts} D={D} />
      </div>
    );
  }

  const currentModule = MODULES.find(m => m.id === activeTab) || MODULES[0];

  return (
    <div style={s.root}>
      {/* HEADER */}
      <header style={s.header}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: D ? "#6b7280" : "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase" }}>Expense Manager</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: D ? "#e8e8f0" : "#1a1a2e" }}>Hello, {username} 👋</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...s.btn, background: D ? "#2a2a3a" : "#f3f4f6", borderRadius: 10, width: 38, height: 38, padding: 0, fontSize: 16 }} onClick={() => setDark(v => !v)}>{D ? "☀️" : "🌙"}</button>
            <button style={{ ...s.btn, background: showSettings ? "#7c3aed" : D ? "#2a2a3a" : "#f3f4f6", color: showSettings ? "#fff" : "inherit", borderRadius: 10, width: 38, height: 38, padding: 0, fontSize: 16 }} onClick={() => setShowSettings(v => !v)}>⚙️</button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={s.main}>
        {showSettings ? (
          <SettingsPanel D={D} dark={dark} setDark={setDark} username={username} setUsername={setUsername} selectedModule={selectedModule} setSelectedModule={mod => { setSelectedModule(mod); if (!mod) setTab(null); }} catLimits={catLimits} setCatLimits={setCatLimits} expenses={expenses} incomeSources={incomeSources} budgetPlans={budgetPlans} setExpenses={setExpenses} setIncomeSources={setIncomeSources} setBudgetPlans={setBudgetPlans} push={push} />
        ) : activeTab === "daily" ? (
          <DailyTracker D={D} expenses={expenses} setExpenses={setExpenses} push={push} catLimits={catLimits} incomeSources={incomeSources} budgetPlans={budgetPlans} setBudgetPlans={setBudgetPlans} />
        ) : activeTab === "budgeted" ? (
          <BudgetedTracking D={D} expenses={expenses} setExpenses={setExpenses} push={push} incomeSources={incomeSources} setIncomeSources={setIncomeSources} budgetPlans={budgetPlans} setBudgetPlans={setBudgetPlans} />
        ) : activeTab === "plan" ? (
          <PlanBudget D={D} budgetPlans={budgetPlans} setBudgetPlans={setBudgetPlans} expenses={expenses} setExpenses={setExpenses} push={push} />
        ) : activeTab === "reports" ? (
          <Reports D={D} expenses={expenses} incomeSources={incomeSources} budgetPlans={budgetPlans} push={push} />
        ) : null}
      </main>

      {/* BOTTOM NAV */}
      <nav style={s.nav}>
        {MODULES.map(m => (
          <button key={m.id} style={s.navBtn(activeTab === m.id && !showSettings)} onClick={() => { setTab(m.id); setShowSettings(false); }}>
            <span style={{ fontSize: 19, display: "block", marginBottom: 1 }}>{m.icon}</span>
            <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.title.split(" ")[0]}</span>
          </button>
        ))}
        <button style={s.navBtn(showSettings)} onClick={() => setShowSettings(v => !v)}>
          <span style={{ fontSize: 19, display: "block", marginBottom: 1 }}>⚙️</span>
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Settings</span>
        </button>
      </nav>

      <ToastContainer toasts={toasts} D={D} />
    </div>
  );
}