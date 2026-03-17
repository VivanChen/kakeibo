# 💰 CashFlow 記帳本

多語言（繁體中文 + 印尼文）簡易記帳軟體，支援多人共同編輯、手機優先操作、Excel 匯出。

## 🏗️ 架構

```
前端 (Netlify)          後端 (Supabase 免費方案)
┌──────────────┐       ┌─────────────────────────┐
│  React 18    │       │  PostgreSQL 資料庫        │
│  + Vite      │◄─────►│  + Row Level Security    │
│  + SheetJS   │  API  │  + Realtime 即時訂閱      │
│  (xlsx 匯出)  │       │  + 內建 Email 認證        │
└──────────────┘       └─────────────────────────┘
   Netlify CDN             Supabase Free Tier
   (免費)                   (免費，50K MAU)
```

### 為什麼選 Supabase？

| 考量 | Supabase | Firebase | 純 localStorage |
|------|----------|----------|----------------|
| 多人共享 | ✅ Realtime | ✅ | ❌ |
| SQL 查詢 | ✅ PostgreSQL | ❌ NoSQL | ❌ |
| 免費額度 | 500MB + 50K MAU | 1GB + 50K/日 | 無限但不共享 |
| 權限控制 | ✅ RLS | ✅ Rules | ❌ |
| 部署到 Netlify | ✅ 完美搭配 | ✅ | ✅ |

## 🚀 快速部署

### 第一步：設定 Supabase

1. 到 [supabase.com](https://supabase.com) 免費註冊
2. 建立新專案
3. 到 **SQL Editor** 執行 `supabase-schema.sql` 裡的所有 SQL
4. 到 **Authentication > Providers** 確認 Email 已啟用
5. 到 **Settings > API** 複製 `Project URL` 和 `anon public key`

### 第二步：部署到 Netlify

1. 把程式碼推到 GitHub
2. 到 [netlify.com](https://netlify.com) 連結 GitHub repo
3. 設定：
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. 在 **Environment variables** 加入：
   - `VITE_SUPABASE_URL` = 你的 Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 anon key
5. Deploy!

### 本地開發

```bash
# 安裝
npm install

# 複製環境變數
cp .env.example .env
# 編輯 .env 填入你的 Supabase 設定

# 啟動（不設定 env 會進入展示模式）
npm run dev
```

## 📱 功能一覽

- ✅ **中文 / 印尼文** 一鍵切換
- ✅ **手機優先** 響應式設計，支援 PWA
- ✅ **多人共享** Supabase Realtime 即時同步
- ✅ **匯出 Excel** 按月匯出 .xlsx 檔案
- ✅ **收支分類** 預設 14 種分類 + emoji 圖示
- ✅ **月份瀏覽** 左右切換月份檢視
- ✅ **展示模式** 不接 Supabase 也能用（localStorage）
- ✅ **權限控制** 所有人可看，只有建立者能改/刪

## 🔐 安全設計

- Supabase RLS 確保資料權限
- anon key 只有讀取權限，寫入需登入
- Email + Password 認證
- 每筆記錄綁定 user_email

## 📂 專案結構

```
kakeibo/
├── index.html              # 入口 HTML
├── netlify.toml             # Netlify SPA 設定
├── package.json
├── vite.config.js
├── supabase-schema.sql      # 資料庫建表 SQL
├── .env.example             # 環境變數範例
├── public/
│   └── manifest.json        # PWA 設定
└── src/
    ├── main.jsx             # React 入口
    ├── App.jsx              # 主程式（所有 UI）
    ├── supabase.js          # Supabase 連線
    └── i18n.js              # 多語言翻譯
```
