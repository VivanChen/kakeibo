import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase, isDemoMode } from './supabase.js'
import { translations, categoryIcons, expenseCategories, incomeCategories } from './i18n.js'
import * as XLSX from 'xlsx'

// ─── Helpers ───
const genId = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)
const today = () => new Date().toISOString().slice(0, 10)
const fmtMoney = (n, sym) => `${sym}${Math.abs(n).toLocaleString()}`

// ─── Translation Service ───
// Uses MyMemory free API (1000 words/day free, no key needed)
// lang mapping: 'zh-TW' → 'zh-TW', 'id' → 'id'
const transCache = {}

async function translateText(text, fromLang, toLang) {
  if (!text || !text.trim() || fromLang === toLang) return text
  const cacheKey = `${fromLang}|${toLang}|${text}`
  if (transCache[cacheKey]) return transCache[cacheKey]

  // Map our lang codes to MyMemory format
  const langMap = { 'zh-TW': 'zh-TW', 'id': 'id' }
  const from = langMap[fromLang] || fromLang
  const to = langMap[toLang] || toLang

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText
      transCache[cacheKey] = translated
      return translated
    }
  } catch (e) {
    console.warn('Translation failed:', e)
  }
  return text // fallback to original
}

async function translateBatch(items, fromLangField, toLang) {
  // Translate an array of {note, note_lang} objects
  const results = await Promise.all(
    items.map(async (item) => {
      if (!item.note || !item.note.trim()) return ''
      const from = item[fromLangField] || 'zh-TW'
      if (from === toLang) return item.note
      return await translateText(item.note, from, toLang)
    })
  )
  return results
}

// ─── Hook: useTranslatedRecords ───
// Translates note fields when viewer's lang differs from record's note_lang
function useTranslatedNotes(records, viewerLang) {
  const [noteMap, setNoteMap] = useState({}) // id → translated note
  const pendingRef = useRef(new Set())

  useEffect(() => {
    if (!records.length) return
    let cancelled = false

    const toTranslate = records.filter(r => {
      if (!r.note || !r.note.trim()) return false
      const noteLang = r.note_lang || 'zh-TW'
      if (noteLang === viewerLang) return false
      if (noteMap[`${r.id}_${viewerLang}`]) return false
      if (pendingRef.current.has(`${r.id}_${viewerLang}`)) return false
      return true
    })

    if (!toTranslate.length) return

    toTranslate.forEach(r => pendingRef.current.add(`${r.id}_${viewerLang}`))

    // Translate in small batches to avoid rate limiting
    const processBatch = async () => {
      const newMap = {}
      for (const r of toTranslate) {
        if (cancelled) break
        const translated = await translateText(r.note, r.note_lang || 'zh-TW', viewerLang)
        newMap[`${r.id}_${viewerLang}`] = translated
      }
      if (!cancelled) {
        setNoteMap(prev => ({ ...prev, ...newMap }))
      }
    }
    processBatch()

    return () => { cancelled = true }
  }, [records, viewerLang])

  const getNote = useCallback((record) => {
    if (!record.note || !record.note.trim()) return ''
    const noteLang = record.note_lang || 'zh-TW'
    if (noteLang === viewerLang) return record.note
    return noteMap[`${record.id}_${viewerLang}`] || record.note
  }, [noteMap, viewerLang])

  const isTranslated = useCallback((record) => {
    if (!record.note || !record.note.trim()) return false
    const noteLang = record.note_lang || 'zh-TW'
    if (noteLang === viewerLang) return false
    return !!noteMap[`${record.id}_${viewerLang}`]
  }, [noteMap, viewerLang])

  return { getNote, isTranslated }
}

// ─── Styles ───
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f0f1a;--surface:#1a1a2e;--surface2:#252545;--surface3:#2f2f55;
  --text:#e8e8f0;--text2:#9a9ab8;--text3:#6a6a88;
  --accent:#6c5ce7;--accent2:#a29bfe;--accent-glow:rgba(108,92,231,0.25);
  --income:#00cec9;--income-bg:rgba(0,206,201,0.12);
  --expense:#fd79a8;--expense-bg:rgba(253,121,168,0.12);
  --danger:#e17055;--radius:14px;--radius-sm:10px;
  --font:'Noto Sans TC','Noto Sans',system-ui,sans-serif;
  --mono:'JetBrains Mono',monospace;
}
html{font-size:16px}
body{font-family:var(--font);background:var(--bg);color:var(--text);
  min-height:100dvh;overflow-x:hidden;-webkit-tap-highlight-color:transparent}
input,select,textarea,button{font-family:inherit;font-size:inherit}
button{cursor:pointer;border:none;background:none;color:inherit}

@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes glow{0%,100%{box-shadow:0 0 8px var(--accent-glow)}50%{box-shadow:0 0 20px var(--accent-glow)}}

.fade-up{animation:fadeUp .35s ease both}
.stagger-1{animation-delay:.05s}.stagger-2{animation-delay:.1s}.stagger-3{animation-delay:.15s}

.app{max-width:480px;margin:0 auto;min-height:100dvh;position:relative;padding-bottom:80px}
.header{padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:50;background:var(--bg);border-bottom:1px solid rgba(255,255,255,.04)}
.header h1{font-size:1.15rem;font-weight:600;letter-spacing:-.02em}
.header-actions{display:flex;gap:8px;align-items:center}
.icon-btn{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--surface);transition:all .2s;font-size:1.1rem}
.icon-btn:hover,.icon-btn:active{background:var(--surface2);transform:scale(1.05)}

.summary{padding:8px 20px 16px;display:flex;flex-direction:column;gap:10px}
.balance-card{background:linear-gradient(135deg,var(--accent),#8b5cf6);border-radius:var(--radius);
  padding:20px 22px;color:#fff;position:relative;overflow:hidden}
.balance-card::after{content:'';position:absolute;top:-30%;right:-20%;width:180px;height:180px;
  border-radius:50%;background:rgba(255,255,255,.08)}
.balance-label{font-size:.78rem;opacity:.8;font-weight:400;letter-spacing:.03em}
.balance-amount{font-family:var(--mono);font-size:1.85rem;font-weight:600;margin-top:4px}
.summary-row{display:flex;gap:10px}
.summary-card{flex:1;border-radius:var(--radius-sm);padding:14px 16px}
.summary-card.income{background:var(--income-bg);border:1px solid rgba(0,206,201,.15)}
.summary-card.expense{background:var(--expense-bg);border:1px solid rgba(253,121,168,.15)}
.summary-card .label{font-size:.72rem;color:var(--text2);font-weight:400}
.summary-card .value{font-family:var(--mono);font-size:1.1rem;font-weight:600;margin-top:3px}
.summary-card.income .value{color:var(--income)}
.summary-card.expense .value{color:var(--expense)}

.month-nav{display:flex;align-items:center;justify-content:center;gap:16px;padding:6px 20px 14px}
.month-nav button{width:32px;height:32px;border-radius:50%;background:var(--surface);
  display:flex;align-items:center;justify-content:center;font-size:.9rem;transition:all .2s}
.month-nav button:active{transform:scale(.9)}
.month-nav span{font-size:.92rem;font-weight:500;min-width:120px;text-align:center}

.records{padding:0 20px}
.date-group{margin-bottom:16px}
.date-label{font-size:.72rem;color:var(--text3);font-weight:500;padding:0 2px 6px;
  text-transform:uppercase;letter-spacing:.06em}
.record-item{display:flex;align-items:center;gap:12px;padding:12px 14px;
  background:var(--surface);border-radius:var(--radius-sm);margin-bottom:6px;
  transition:all .15s;position:relative;overflow:hidden}
.record-item:active{transform:scale(.985);background:var(--surface2)}
.record-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;
  justify-content:center;font-size:1.2rem;background:var(--surface2);flex-shrink:0}
.record-info{flex:1;min-width:0}
.record-cat{font-size:.85rem;font-weight:500}
.record-note{font-size:.72rem;color:var(--text3);margin-top:1px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.record-note .translated-badge{font-size:.6rem;color:var(--accent2);margin-left:4px;opacity:.7}
.record-amount{font-family:var(--mono);font-weight:600;font-size:.95rem;text-align:right;flex-shrink:0}
.record-amount.income{color:var(--income)}
.record-amount.expense{color:var(--expense)}
.record-meta{font-size:.65rem;color:var(--text3);text-align:right;margin-top:2px}
.empty-state{text-align:center;padding:60px 20px;color:var(--text3)}
.empty-state .emoji{font-size:3rem;margin-bottom:12px}
.empty-state p{font-size:.88rem}

.fab{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);width:56px;height:56px;
  border-radius:50%;background:var(--accent);color:#fff;font-size:1.8rem;display:flex;
  align-items:center;justify-content:center;box-shadow:0 4px 20px var(--accent-glow);
  z-index:100;transition:all .2s}
.fab:active{transform:translateX(-50%) scale(.9)}

.overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;
  opacity:0;transition:opacity .25s;pointer-events:none}
.overlay.open{opacity:1;pointer-events:all}
.sheet{position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;
  background:var(--surface);border-radius:20px 20px 0 0;z-index:201;
  transform:translateY(100%);transition:transform .3s cubic-bezier(.32,.72,0,1);
  max-height:92dvh;overflow-y:auto;padding:0 20px 32px}
.sheet.open{transform:translateY(0)}
.sheet-handle{width:36px;height:4px;border-radius:2px;background:var(--text3);
  margin:10px auto 16px;opacity:.5}
.sheet-title{font-size:1.05rem;font-weight:600;margin-bottom:18px;text-align:center}

.type-toggle{display:flex;gap:8px;margin-bottom:18px}
.type-btn{flex:1;padding:10px;border-radius:var(--radius-sm);font-weight:500;
  font-size:.88rem;border:1.5px solid var(--surface3);transition:all .2s}
.type-btn.active.expense{background:var(--expense-bg);border-color:var(--expense);color:var(--expense)}
.type-btn.active.income{background:var(--income-bg);border-color:var(--income);color:var(--income)}

.form-group{margin-bottom:14px}
.form-label{font-size:.75rem;color:var(--text2);margin-bottom:5px;display:block;font-weight:500}
.form-input{width:100%;padding:11px 14px;border-radius:var(--radius-sm);border:1.5px solid var(--surface3);
  background:var(--surface2);color:var(--text);font-size:.95rem;outline:none;transition:border-color .2s}
.form-input:focus{border-color:var(--accent)}
.form-input.amount{font-family:var(--mono);font-size:1.3rem;font-weight:600;text-align:center;padding:14px}

.cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.cat-chip{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;
  border-radius:var(--radius-sm);border:1.5px solid var(--surface3);transition:all .2s;font-size:.68rem}
.cat-chip:active{transform:scale(.95)}
.cat-chip .cat-icon{font-size:1.25rem}
.cat-chip.active{border-color:var(--accent);background:var(--accent-glow)}

.btn-primary{width:100%;padding:13px;border-radius:var(--radius-sm);
  background:var(--accent);color:#fff;font-weight:600;font-size:.95rem;
  margin-top:8px;transition:all .2s}
.btn-primary:active{transform:scale(.97);opacity:.9}
.btn-danger{width:100%;padding:11px;border-radius:var(--radius-sm);margin-top:6px;
  border:1.5px solid var(--danger);color:var(--danger);font-weight:500;font-size:.88rem;transition:all .2s}
.btn-danger:active{background:rgba(225,112,85,.1)}
.btn-secondary{width:100%;padding:11px;border-radius:var(--radius-sm);margin-top:6px;
  border:1.5px solid var(--surface3);color:var(--text2);font-weight:500;font-size:.88rem}

.lang-picker{display:flex;gap:8px;padding:8px 0}
.lang-btn{flex:1;padding:14px;border-radius:var(--radius-sm);border:1.5px solid var(--surface3);
  text-align:center;transition:all .2s;font-size:.92rem}
.lang-btn.active{border-color:var(--accent);background:var(--accent-glow)}
.lang-btn .flag{font-size:1.5rem;display:block;margin-bottom:4px}

.auth-page{display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:100dvh;padding:32px 24px}
.auth-logo{font-size:2.5rem;margin-bottom:8px}
.auth-title{font-size:1.4rem;font-weight:600;margin-bottom:4px}
.auth-sub{font-size:.82rem;color:var(--text2);margin-bottom:28px}
.auth-form{width:100%;max-width:340px}
.auth-form .form-group{margin-bottom:12px}
.auth-switch{font-size:.82rem;color:var(--accent2);text-align:center;margin-top:16px;
  background:none;border:none;cursor:pointer;text-decoration:underline}
.auth-error{font-size:.78rem;color:var(--danger);text-align:center;margin-top:8px}

.demo-banner{background:linear-gradient(90deg,rgba(108,92,231,.15),rgba(0,206,201,.1));
  text-align:center;padding:6px 16px;font-size:.72rem;color:var(--accent2);font-weight:500}

.sync-dot{width:6px;height:6px;border-radius:50%;background:var(--income);
  animation:pulse 2s infinite;display:inline-block;margin-right:6px}

.confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:300;
  display:flex;align-items:center;justify-content:center;padding:24px}
.confirm-box{background:var(--surface);border-radius:var(--radius);padding:24px;
  max-width:300px;width:100%;text-align:center}
.confirm-box p{font-size:.92rem;margin-bottom:18px}
.confirm-actions{display:flex;gap:10px}
.confirm-actions button{flex:1;padding:10px;border-radius:var(--radius-sm);font-weight:500;font-size:.88rem}
.confirm-actions .yes{background:var(--danger);color:#fff}
.confirm-actions .no{background:var(--surface2);color:var(--text2)}

/* Export loading */
.export-loading{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:300;
  display:flex;align-items:center;justify-content:center}
.export-loading-box{background:var(--surface);border-radius:var(--radius);padding:24px 32px;
  text-align:center;font-size:.88rem}
.export-loading-box .spinner{animation:pulse 1s infinite;font-size:1.5rem;margin-bottom:8px}

::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:2px}
`

// ─── Local Storage for Demo ───
const LS_KEY = 'cashflow_records'
const LS_LANG = 'cashflow_lang'
function loadLocalRecords() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function saveLocalRecords(records) {
  localStorage.setItem(LS_KEY, JSON.stringify(records))
}

// ─── App ───
export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem(LS_LANG) || 'zh-TW')
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [records, setRecords] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })

  const t = translations[lang]

  // Translation hook for record notes
  const { getNote, isTranslated } = useTranslatedNotes(records, lang)

  useEffect(() => { localStorage.setItem(LS_LANG, lang) }, [lang])

  // Auth check
  useEffect(() => {
    if (isDemoMode) {
      setAuthChecked(true)
      setUser({ id: 'demo', email: 'demo' })
      setRecords(loadLocalRecords())
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load records from Supabase
  useEffect(() => {
    if (isDemoMode || !user) return
    const fetchRecords = async () => {
      const { data } = await supabase
        .from('records')
        .select('*')
        .order('date', { ascending: false })
      if (data) setRecords(data)
    }
    fetchRecords()
    const channel = supabase
      .channel('records_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => {
        fetchRecords()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  // Save record — now includes note_lang
  const handleSave = async (record) => {
    const recordWithLang = { ...record, note_lang: lang }

    if (isDemoMode) {
      let updated
      if (recordWithLang.id && records.find(r => r.id === recordWithLang.id)) {
        updated = records.map(r => r.id === recordWithLang.id ? { ...r, ...recordWithLang } : r)
      } else {
        const newRec = { ...recordWithLang, id: genId(), user_email: 'demo', created_at: new Date().toISOString() }
        updated = [newRec, ...records]
      }
      setRecords(updated)
      saveLocalRecords(updated)
    } else {
      if (recordWithLang.id) {
        await supabase.from('records').update(recordWithLang).eq('id', recordWithLang.id)
      } else {
        await supabase.from('records').insert({ ...recordWithLang, user_email: user.email })
      }
    }
    setShowForm(false)
    setEditingRecord(null)
  }

  // Delete record
  const handleDelete = async (id) => {
    if (isDemoMode) {
      const updated = records.filter(r => r.id !== id)
      setRecords(updated)
      saveLocalRecords(updated)
    } else {
      await supabase.from('records').delete().eq('id', id)
    }
    setConfirmDelete(null)
    setShowForm(false)
    setEditingRecord(null)
  }

  // Filter by month
  const filtered = useMemo(() => {
    return records.filter(r => {
      const d = new Date(r.date)
      return d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month
    })
  }, [records, viewMonth])

  // Group by date
  const grouped = useMemo(() => {
    const g = {}
    filtered.forEach(r => {
      const key = r.date
      if (!g[key]) g[key] = []
      g[key].push(r)
    })
    return Object.entries(g).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  // Totals
  const totals = useMemo(() => {
    let inc = 0, exp = 0
    filtered.forEach(r => {
      if (r.type === 'income') inc += Number(r.amount)
      else exp += Number(r.amount)
    })
    return { income: inc, expense: exp, balance: inc - exp }
  }, [filtered])

  const navMonth = (dir) => {
    setViewMonth(prev => {
      let m = prev.month + dir, y = prev.year
      if (m < 0) { m = 11; y-- }
      if (m > 11) { m = 0; y++ }
      return { year: y, month: m }
    })
  }

  // Export Excel — with translated notes
  const exportExcel = async () => {
    setExporting(true)
    try {
      // Translate all notes for export
      const translatedNotes = await Promise.all(
        filtered.map(async (r) => {
          if (!r.note || !r.note.trim()) return ''
          const noteLang = r.note_lang || 'zh-TW'
          if (noteLang === lang) return r.note
          return await translateText(r.note, noteLang, lang)
        })
      )

      const data = filtered.map((r, i) => ({
        [t.date]: r.date,
        [t.category]: t.categories[r.category] || r.category,
        [t.amount]: r.type === 'expense' ? -r.amount : r.amount,
        [t.note]: translatedNotes[i] || r.note || '',
        [`${t.note} (${lang === 'zh-TW' ? '原文' : 'Asli'})`]: (r.note_lang && r.note_lang !== lang) ? r.note : '',
        [t.createdBy]: r.user_email || '',
      }))
      const ws = XLSX.utils.json_to_sheet(data)

      // Auto column width
      const colWidths = Object.keys(data[0] || {}).map(k => ({
        wch: Math.max(k.length * 2, ...data.map(d => String(d[k] || '').length * 1.5), 10)
      }))
      ws['!cols'] = colWidths

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, t.thisMonth)
      XLSX.writeFile(wb, `cashflow_${viewMonth.year}_${viewMonth.month + 1}.xlsx`)
    } catch (e) {
      console.error('Export error:', e)
    }
    setExporting(false)
  }

  if (!authChecked) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
    <div style={{ animation: 'pulse 1.5s infinite', fontSize: '2rem' }}>💰</div>
  </div>

  if (!user && !isDemoMode) return <AuthPage lang={lang} setLang={setLang} t={t} setUser={setUser} />

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {isDemoMode && <div className="demo-banner">⚡ {t.demoMode}</div>}
        
        <div className="header">
          <h1>💰 {t.appName}</h1>
          <div className="header-actions">
            <button className="icon-btn" onClick={exportExcel} title={t.exportExcel} disabled={exporting}>
              {exporting ? '⏳' : '📊'}
            </button>
            <button className="icon-btn" onClick={() => setShowSettings(true)} title={t.settings}>⚙️</button>
          </div>
        </div>

        <div className="month-nav fade-up">
          <button onClick={() => navMonth(-1)}>◀</button>
          <span>{viewMonth.year} {t.months[viewMonth.month]}</span>
          <button onClick={() => navMonth(1)}>▶</button>
        </div>

        <div className="summary fade-up stagger-1">
          <div className="balance-card">
            <div className="balance-label">{t.balance}</div>
            <div className="balance-amount">{fmtMoney(totals.balance, t.currencySymbol)}</div>
          </div>
          <div className="summary-row">
            <div className="summary-card income">
              <div className="label">▲ {t.totalIncome}</div>
              <div className="value">{fmtMoney(totals.income, t.currencySymbol)}</div>
            </div>
            <div className="summary-card expense">
              <div className="label">▼ {t.totalExpense}</div>
              <div className="value">{fmtMoney(totals.expense, t.currencySymbol)}</div>
            </div>
          </div>
        </div>

        <div className="records">
          {grouped.length === 0 ? (
            <div className="empty-state fade-up stagger-2">
              <div className="emoji">📝</div>
              <p>{t.noRecords}</p>
            </div>
          ) : grouped.map(([date, recs]) => (
            <div className="date-group fade-up stagger-2" key={date}>
              <div className="date-label">{date}</div>
              {recs.map(r => (
                <div className="record-item" key={r.id}
                  onClick={() => { setEditingRecord(r); setShowForm(true) }}>
                  <div className="record-icon">{categoryIcons[r.category] || '📌'}</div>
                  <div className="record-info">
                    <div className="record-cat">{t.categories[r.category] || r.category}</div>
                    {r.note && (
                      <div className="record-note">
                        {getNote(r)}
                        {isTranslated(r) && <span className="translated-badge">🌐</span>}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={`record-amount ${r.type}`}>
                      {r.type === 'expense' ? '-' : '+'}{fmtMoney(r.amount, t.currencySymbol)}
                    </div>
                    {r.user_email && r.user_email !== 'demo' && (
                      <div className="record-meta">{r.user_email.split('@')[0]}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <button className="fab" onClick={() => { setEditingRecord(null); setShowForm(true) }}>+</button>

        <div className={`overlay ${showForm ? 'open' : ''}`} onClick={() => { setShowForm(false); setEditingRecord(null) }} />
        <div className={`sheet ${showForm ? 'open' : ''}`}>
          <div className="sheet-handle" />
          <RecordForm t={t} lang={lang} record={editingRecord}
            onSave={handleSave}
            onDelete={(id) => setConfirmDelete(id)}
            onCancel={() => { setShowForm(false); setEditingRecord(null) }} />
        </div>

        <div className={`overlay ${showSettings ? 'open' : ''}`} onClick={() => setShowSettings(false)} />
        <div className={`sheet ${showSettings ? 'open' : ''}`}>
          <div className="sheet-handle" />
          <div className="sheet-title">{t.settings}</div>
          <div className="form-label">{t.chooseLanguage}</div>
          <div className="lang-picker">
            <button className={`lang-btn ${lang === 'zh-TW' ? 'active' : ''}`} onClick={() => setLang('zh-TW')}>
              <span className="flag">🇹🇼</span>繁體中文
            </button>
            <button className={`lang-btn ${lang === 'id' ? 'active' : ''}`} onClick={() => setLang('id')}>
              <span className="flag">🇮🇩</span>Bahasa Indonesia
            </button>
          </div>
          {!isDemoMode && user && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: '.78rem', color: 'var(--text3)', marginBottom: 8 }}>
                {user.email}
              </div>
              <button className="btn-secondary" onClick={async () => {
                await supabase.auth.signOut()
                setShowSettings(false)
              }}>{t.logout}</button>
            </div>
          )}
        </div>

        {confirmDelete && (
          <div className="confirm-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="confirm-box" onClick={e => e.stopPropagation()}>
              <p>{t.confirmDelete}</p>
              <div className="confirm-actions">
                <button className="no" onClick={() => setConfirmDelete(null)}>{t.no}</button>
                <button className="yes" onClick={() => handleDelete(confirmDelete)}>{t.yes}</button>
              </div>
            </div>
          </div>
        )}

        {exporting && (
          <div className="export-loading">
            <div className="export-loading-box">
              <div className="spinner">📊</div>
              <div>{lang === 'id' ? 'Menerjemahkan & mengekspor...' : '翻譯並匯出中...'}</div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Record Form ───
function RecordForm({ t, lang, record, onSave, onDelete, onCancel }) {
  const [type, setType] = useState(record?.type || 'expense')
  const [amount, setAmount] = useState(record?.amount?.toString() || '')
  const [category, setCategory] = useState(record?.category || 'food')
  const [note, setNote] = useState(record?.note || '')
  const [date, setDate] = useState(record?.date || today())

  const cats = type === 'expense' ? expenseCategories : incomeCategories

  useEffect(() => {
    if (!cats.includes(category)) setCategory(cats[0])
  }, [type])

  const handleSubmit = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return
    onSave({
      ...(record?.id ? { id: record.id } : {}),
      type, amount: Number(amount), category, note, date
    })
  }

  return (
    <div>
      <div className="sheet-title">{record ? t.edit : t.addRecord}</div>
      
      <div className="type-toggle">
        <button className={`type-btn expense ${type === 'expense' ? 'active' : ''}`}
          onClick={() => setType('expense')}>▼ {t.expense}</button>
        <button className={`type-btn income ${type === 'income' ? 'active' : ''}`}
          onClick={() => setType('income')}>▲ {t.income}</button>
      </div>

      <div className="form-group">
        <input className="form-input amount" type="number" inputMode="decimal"
          placeholder="0" value={amount}
          onChange={e => setAmount(e.target.value)} autoFocus />
      </div>

      <div className="form-group">
        <label className="form-label">{t.category}</label>
        <div className="cat-grid">
          {cats.map(c => (
            <button key={c} className={`cat-chip ${category === c ? 'active' : ''}`}
              onClick={() => setCategory(c)}>
              <span className="cat-icon">{categoryIcons[c]}</span>
              {t.categories[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t.date}</label>
        <input className="form-input" type="date" value={date}
          onChange={e => setDate(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">{t.note}</label>
        <input className="form-input" type="text"
          placeholder={lang === 'id' ? 'Tulis dalam bahasa Anda' : '用你的語言寫備註'}
          value={note} onChange={e => setNote(e.target.value)} />
      </div>

      <button className="btn-primary" onClick={handleSubmit}>{t.save}</button>
      {record && (
        <button className="btn-danger" onClick={() => onDelete(record.id)}>🗑️ {t.delete}</button>
      )}
      <button className="btn-secondary" onClick={onCancel}>{t.cancel}</button>
    </div>
  )
}

// ─── Auth Page ───
function AuthPage({ lang, setLang, t, setUser }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuth = async () => {
    setError('')
    setLoading(true)
    try {
      const fn = isSignUp ? supabase.auth.signUp : supabase.auth.signInWithPassword
      const { error: err } = await fn.call(supabase.auth, { email, password })
      if (err) setError(err.message)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="auth-page">
        <div className="auth-logo">💰</div>
        <div className="auth-title">{t.appName}</div>
        <div className="auth-sub">{isSignUp ? t.signUp : t.signIn}</div>

        <div className="auth-form">
          <div className="form-group">
            <input className="form-input" type="email" placeholder={t.email}
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <input className="form-input" type="password" placeholder={t.password}
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAuth()} />
          </div>
          <button className="btn-primary" onClick={handleAuth} disabled={loading}>
            {loading ? '...' : isSignUp ? t.signUp : t.signIn}
          </button>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-switch" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? t.switchToSignIn : t.switchToSignUp}
          </button>
        </div>

        <div className="lang-picker" style={{ marginTop: 24, maxWidth: 300 }}>
          <button className={`lang-btn ${lang === 'zh-TW' ? 'active' : ''}`} onClick={() => setLang('zh-TW')}>
            <span className="flag">🇹🇼</span>中文
          </button>
          <button className={`lang-btn ${lang === 'id' ? 'active' : ''}`} onClick={() => setLang('id')}>
            <span className="flag">🇮🇩</span>Indonesia
          </button>
        </div>
      </div>
    </>
  )
}
