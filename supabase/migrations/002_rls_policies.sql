-- ============================================================
-- CodeGuesser - Row Level Security (RLS) Politikaları
-- ============================================================

-- RLS'yi tüm tablolarda etkinleştir
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES politikaları
-- ============================================================

-- Herkes profilleri okuyabilir (lider tablosu, düello için gerekli)
CREATE POLICY "profiles_select_all"
    ON public.profiles FOR SELECT
    USING (true);

-- Sadece kendi profilini güncelleyebilirsin
CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Insert sadece tetikleyici (handle_new_user) üzerinden olur
-- Doğrudan istemci insert'ini engelle
CREATE POLICY "profiles_insert_trigger_only"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================================
-- LEADERBOARD politikaları
-- ============================================================

-- Herkes lider tablosunu okuyabilir
CREATE POLICY "leaderboard_select_all"
    ON public.leaderboard FOR SELECT
    USING (true);

-- Sadece kendi sıralamasını güncelleyebilirsin
CREATE POLICY "leaderboard_update_own"
    ON public.leaderboard FOR UPDATE
    USING (auth.uid() = user_id);

-- Insert sadece tetikleyici üzerinden
CREATE POLICY "leaderboard_insert_trigger_only"
    ON public.leaderboard FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- DUELS politikaları
-- ============================================================

-- Katılımcı oyuncular düello verisini okuyabilir
CREATE POLICY "duels_select_participants"
    ON public.duels FOR SELECT
    USING (
        auth.uid() = player1_id
        OR auth.uid() = player2_id
        -- 'waiting' durumdaki odalar herkese görünür (katılım için)
        OR status = 'waiting'
    );

-- Sadece player1 oda oluşturabilir
CREATE POLICY "duels_insert_player1"
    ON public.duels FOR INSERT
    WITH CHECK (auth.uid() = player1_id);

-- Katılımcılar güncelleme yapabilir (skor, durum)
CREATE POLICY "duels_update_participants"
    ON public.duels FOR UPDATE
    USING (
        auth.uid() = player1_id
        OR auth.uid() = player2_id
    );

-- ============================================================
-- QUESTIONS politikaları
-- ============================================================

-- Tüm giriş yapmış kullanıcılar soruları okuyabilir
CREATE POLICY "questions_select_authenticated"
    ON public.questions FOR SELECT
    TO authenticated
    USING (true);

-- Sorular yalnızca Supabase Dashboard / servis rolüyle eklenir
-- (İstemci tarafından insert/update/delete yasak)
