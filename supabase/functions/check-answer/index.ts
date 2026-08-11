/**
 * Supabase Edge Function: check-answer
 * ─────────────────────────────────────────────────────────────
 * Kullanıcının cevabını sunucu tarafında doğrular.
 * correct_lang hiçbir zaman istemciye gönderilmez.
 *
 * Endpoint: POST /functions/v1/check-answer
 *
 * Request Body:
 *   { question_id: number, selected_lang: string }
 *
 * Response (doğru):
 *   { correct: true,  correct_lang: string }
 *
 * Response (yanlış):
 *   { correct: false, correct_lang: string }
 *
 * Güvenlik:
 *   - JWT zorunlu
 *   - Skor güncelleme bu fonksiyonda yapılmaz (game.js yönetir)
 *     çünkü skor zaten Supabase DB'de RLS ile korunuyor.
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders }  from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // ── 1. JWT doğrulama ───────────────────────────────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return _error('Yetkisiz istek.', 401);

        const supabaseUser = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
        );
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser(
            authHeader.replace('Bearer ', '')
        );
        if (authError || !user) return _error('Geçersiz token.', 401);

        // ── 2. İstek gövdesini parse et ────────────────────────
        const body = await req.json().catch(() => ({}));
        const questionId   : number = Number(body.question_id);
        const selectedLang : string = String(body.selected_lang ?? '').trim();

        if (!questionId || !selectedLang) {
            return _error('question_id ve selected_lang zorunlu.', 400);
        }

        // ── 3. DB'den correct_lang çek (service_role) ─────────
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SERVICE_ROLE_KEY')!,
        );

        const { data: question, error: dbError } = await supabaseAdmin
            .from('questions')
            .select('correct_lang')
            .eq('id', questionId)
            .single();

        if (dbError || !question) {
            return _error('Soru bulunamadı.', 404);
        }

        // ── 4. Karşılaştır ve sonucu döndür ───────────────────
        const isCorrect = question.correct_lang.toLowerCase() === selectedLang.toLowerCase();

        return new Response(
            JSON.stringify({
                correct      : isCorrect,
                correct_lang : question.correct_lang,   // Göstermek için (yanlışta doğru şıkkı vurgula)
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );

    } catch (err) {
        console.error('[check-answer] Beklenmeyen hata:', err);
        return _error('Sunucu hatası.', 500);
    }
});

function _error(message: string, status: number): Response {
    return new Response(
        JSON.stringify({ error: message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
    );
}
