/**
 * Supabase Edge Function: get-question
 * ─────────────────────────────────────────────────────────────
 * Güvenli soru servisi. İstemci bu endpoint'i çağırır;
 * soru bankasına doğrudan erişemez.
 *
 * İstemci → Edge Function → Supabase DB (service_role)
 *
 * Endpoint: POST /functions/v1/get-question
 *
 * Request Body:
 *   { difficulty: number (1-5), seen_ids: number[] }
 *
 * Response:
 *   { id, code_snippet, options: string[], difficulty }
 *   NOT: correct_lang döndürülmez — sadece check-answer'da kontrol edilir
 *
 * Güvenlik:
 *   - JWT zorunlu (Authorization: Bearer <token>)
 *   - correct_lang istemciye hiç gönderilmez
 *   - Soru seçimi sunucuda rastgele yapılır
 * ─────────────────────────────────────────────────────────────
 */

import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders }   from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {

    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // ── 1. JWT doğrulama ───────────────────────────────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return _error('Yetkisiz istek.', 401);
        }

        // Kullanıcı token'ını doğrula (anon client ile)
        const supabaseUser = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
        );
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !user) {
            return _error('Geçersiz token.', 401);
        }

        // ── 2. İstek gövdesini parse et ────────────────────────
        const body = await req.json().catch(() => ({}));
        const difficulty : number   = Number(body.difficulty) || 1;
        const seenIds    : number[] = Array.isArray(body.seen_ids) ? body.seen_ids : [];

        // Zorluk aralığı kontrolü
        if (difficulty < 1 || difficulty > 5) {
            return _error('Geçersiz zorluk seviyesi (1-5 arası olmalı).', 400);
        }

        // ── 3. Sunucu tarafında soru çek (service_role) ────────
        // Önce SERVICE_ROLE_KEY, yoksa SUPABASE_SERVICE_ROLE_KEY'i dene
        const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')
                        ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!serviceKey) {
            console.error('[get-question] SERVICE_ROLE_KEY secret tanımlı değil!');
            return _error('Sunucu yapılandırma hatası: SERVICE_ROLE_KEY eksik.', 500);
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            serviceKey,
        );

        // Görülmemiş soruları filtrele
        let query = supabaseAdmin
            .from('questions')
            .select('id, code_snippet, correct_lang, options, difficulty')
            .eq('difficulty', difficulty);

        if (seenIds.length > 0) {
            query = query.not('id', 'in', `(${seenIds.join(',')})`);
        }

        // Sunucuda rastgele sırayla limit 10 çek, içinden 1 seç
        const { data: pool, error: dbError } = await query.limit(10);

        if (dbError) {
            console.error('[get-question] DB hatası:', dbError.message);
            return _error('Soru getirilemedi.', 500);
        }

        // Havuz boşsa (tüm sorular görüldü) — aynı zorluktan tekrar al
        let candidates = pool ?? [];
        if (candidates.length === 0) {
            const { data: fallback } = await supabaseAdmin
                .from('questions')
                .select('id, code_snippet, correct_lang, options, difficulty')
                .eq('difficulty', difficulty)
                .limit(10);
            candidates = fallback ?? [];
        }

        // Hâlâ boşsa farklı zorluk dene
        if (candidates.length === 0) {
            const { data: anyQ } = await supabaseAdmin
                .from('questions')
                .select('id, code_snippet, correct_lang, options, difficulty')
                .limit(5);
            candidates = anyQ ?? [];
        }

        if (candidates.length === 0) {
            return _error('Soru bulunamadı.', 404);
        }

        // Rastgele bir soru seç
        const question = candidates[Math.floor(Math.random() * candidates.length)];

        // ── 4. Şıkları karıştır ────────────────────────────────
        const shuffledOptions = _shuffleArray([...question.options]);

        // ── 5. correct_lang GÖNDERİLMEZ ───────────────────────
        // Sadece istemcinin görmesi gereken alanlar döndürülür.
        // Doğruluk kontrolü check-answer edge function'da yapılır.
        return new Response(
            JSON.stringify({
                id           : question.id,
                code_snippet : question.code_snippet,
                options      : shuffledOptions,
                difficulty   : question.difficulty,
            }),
            {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
                status: 200,
            }
        );

    } catch (err) {
        console.error('[get-question] Beklenmeyen hata:', err);
        return _error('Sunucu hatası.', 500);
    }
});

// ── Yardımcı: Fisher-Yates karıştırma ─────────────────────────
function _shuffleArray<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ── Yardımcı: Hata yanıtı ─────────────────────────────────────
function _error(message: string, status: number): Response {
    return new Response(
        JSON.stringify({ error: message }),
        {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status,
        }
    );
}
