-- ============================================================
-- CodeGuesser - Veritabanı Şeması
-- ============================================================

-- Kullanıcı profilleri tablosu
-- Supabase Auth kullanıcısıyla 1:1 ilişki kurar
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username      TEXT UNIQUE NOT NULL,
    score         INTEGER NOT NULL DEFAULT 0,
    title         TEXT NOT NULL DEFAULT 'Çaylak',
    -- Jokerler JSON: { "fifty": 2, "freeze": 1, "skip": 3 }
    jokers        JSONB NOT NULL DEFAULT '{"fifty": 1, "freeze": 1, "skip": 1}'::jsonb,
    -- Açılmış kozmetikler dizisi: ['frame_gold', 'theme_matrix']
    unlocked_cosmetics TEXT[] NOT NULL DEFAULT '{}',
    active_theme  TEXT NOT NULL DEFAULT 'vscode-dark',
    active_frame  TEXT NOT NULL DEFAULT 'default',
    daily_reward_claimed_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lider tablosu (en yüksek skorlar)
CREATE TABLE IF NOT EXISTS public.leaderboard (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    username   TEXT NOT NULL,
    max_score  INTEGER NOT NULL DEFAULT 0,
    title      TEXT NOT NULL DEFAULT 'Çaylak',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Düello odaları tablosu
CREATE TABLE IF NOT EXISTS public.duels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player2_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    p1_score    INTEGER NOT NULL DEFAULT 0,
    p2_score    INTEGER NOT NULL DEFAULT 0,
    -- status: 'waiting' | 'active' | 'finished'
    status      TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished')),
    -- Her iki oyuncunun aynı soru setini oynaması için seed
    question_seed INTEGER,
    winner_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Soru bankası tablosu
CREATE TABLE IF NOT EXISTS public.questions (
    id          BIGSERIAL PRIMARY KEY,
    code_snippet TEXT NOT NULL,         -- Gösterilecek 1 satırlık kod
    correct_lang TEXT NOT NULL,         -- Doğru dil: 'python', 'javascript', 'rust' vb.
    options      TEXT[] NOT NULL,       -- 3 seçenek: ['python','javascript','rust']
    difficulty   INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tetikleyici: profiles.updated_at otomatik güncelle
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_duels_updated_at
    BEFORE UPDATE ON public.duels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Tetikleyici: Yeni kullanıcı kaydında otomatik profil oluştur
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    suffix         INTEGER := 0;
BEGIN
    -- Email veya provider metadata'dan kullanıcı adı türet
    base_username := COALESCE(
        NEW.raw_user_meta_data->>'user_name',   -- GitHub
        NEW.raw_user_meta_data->>'name',         -- Google
        SPLIT_PART(NEW.email, '@', 1)
    );

    -- Benzersiz kullanıcı adı garantisi
    final_username := base_username;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
        suffix := suffix + 1;
        final_username := base_username || suffix::TEXT;
    END LOOP;

    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, final_username);

    INSERT INTO public.leaderboard (user_id, username, max_score)
    VALUES (NEW.id, final_username, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- İndeksler - Sorgu performansı
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leaderboard_max_score ON public.leaderboard(max_score DESC);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty   ON public.questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_duels_status           ON public.duels(status);
CREATE INDEX IF NOT EXISTS idx_duels_player1          ON public.duels(player1_id);
