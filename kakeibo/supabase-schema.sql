-- ================================================
-- CashFlow 記帳本 - Supabase 資料庫設定
-- 在 Supabase Dashboard > SQL Editor 中執行此腳本
-- ================================================

-- 1. 建立記帳紀錄主表
CREATE TABLE records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  note TEXT DEFAULT '',
  note_lang TEXT DEFAULT 'zh-TW',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 建立索引加速查詢
CREATE INDEX idx_records_date ON records (date DESC);
CREATE INDEX idx_records_user ON records (user_email);
CREATE INDEX idx_records_type ON records (type);

-- 3. 啟用 Row Level Security (RLS)
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- 4. RLS 政策 - 所有已登入用戶可讀取所有記錄（共享帳本）
CREATE POLICY "所有登入用戶可檢視" ON records
  FOR SELECT USING (auth.role() = 'authenticated');

-- 5. RLS 政策 - 所有已登入用戶可新增記錄
CREATE POLICY "所有登入用戶可新增" ON records
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 6. RLS 政策 - 僅記錄建立者可修改
CREATE POLICY "僅建立者可修改" ON records
  FOR UPDATE USING (auth.jwt() ->> 'email' = user_email);

-- 7. RLS 政策 - 僅記錄建立者可刪除
CREATE POLICY "僅建立者可刪除" ON records
  FOR DELETE USING (auth.jwt() ->> 'email' = user_email);

-- 8. 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_records
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 9. 啟用 Realtime（讓多人即時同步）
ALTER PUBLICATION supabase_realtime ADD TABLE records;

-- ================================================
-- 完成！接下來在 Supabase Dashboard 設定：
-- Authentication > Providers > 啟用 Email
-- ================================================
