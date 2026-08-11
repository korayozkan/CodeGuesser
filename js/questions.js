/**
 * questions.js
 * ──────────────────────────────────────────────────────────────
 * Soru bankasına istemci tarafından doğrudan erişilmez.
 * Tüm soru çekme ve cevap doğrulama işlemleri Supabase Edge
 * Function'lar üzerinden yapılır:
 *
 *   GET  soru   → Edge Function: get-question
 *   POST cevap  → Edge Function: check-answer
 *
 * Bu sayede:
 *   - correct_lang hiçbir zaman tarayıcıya gelmez
 *   - Soru bankası istemciden tamamen gizlenir
 *   - RLS'de questions tablosu istemciye kapalıdır
 * ──────────────────────────────────────────────────────────────
 */

import { supabase, SUPABASE_URL } from './config.js';
import { shuffle }                from './ui-utils.js';

// ─── Edge Function URL'leri ────────────────────────────────────
// SUPABASE_URL örn: https://thvzcnmiwekudevxjnfg.supabase.co
const EDGE_BASE        = `${SUPABASE_URL}/functions/v1`;
const GET_QUESTION_URL = `${EDGE_BASE}/get-question`;
const CHECK_ANSWER_URL = `${EDGE_BASE}/check-answer`;

// ─── Sabitler ──────────────────────────────────────────────────
/** Kaç doğru cevapta bir zorluk seviyesi artar */
const DIFFICULTY_STEP_INTERVAL = 3;

// ─── Modül Durumu ──────────────────────────────────────────────
/** Bu oyun oturumunda gösterilen soru id'leri */
const seenIds = new Set();

/** Mevcut zorluk seviyesi (1–5) */
let currentDifficulty = 1;

/** Bu zorluk seviyesinde kaç doğru cevap verildi */
let correctInLevel = 0;

// ─── Dışa Açık API ─────────────────────────────────────────────

/**
 * Soru motorunu sıfırlar. Her yeni oyun başında çağrılır.
 */
export function resetQuestions() {
    seenIds.clear();
    currentDifficulty = 1;
    correctInLevel    = 0;
}

/**
 * Mevcut zorluk seviyesini döner.
 * @returns {number} 1–5
 */
export function getDifficulty() {
    return currentDifficulty;
}

/**
 * Oyuncunun doğru cevap verdiğini bildirir.
 * Gerekirse zorluk seviyesini artırır.
 * @returns {boolean} Zorluk arttıysa true
 */
export function registerCorrectAnswer() {
    correctInLevel++;
    if (correctInLevel >= DIFFICULTY_STEP_INTERVAL && currentDifficulty < 5) {
        currentDifficulty++;
        correctInLevel = 0;
        return true;
    }
    return false;
}

/**
 * Edge Function'dan bir sonraki soruyu çeker.
 * correct_lang sunucuda kalır, istemciye gelmez.
 *
 * @returns {Promise<Question|null>}
 *   Question: { id, code_snippet, options: string[], difficulty }
 */
export async function getNextQuestion() {
    const token = await _getToken();
    if (!token) {
        console.error('[questions] Oturum tokeni alınamadı.');
        return null;
    }

    const response = await fetch(GET_QUESTION_URL, {
        method  : 'POST',
        headers : {
            'Content-Type'  : 'application/json',
            'Authorization' : `Bearer ${token}`,
        },
        body: JSON.stringify({
            difficulty : currentDifficulty,
            seen_ids   : [...seenIds],      // Görülen soruları gönder (tekrar gelmesin)
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[questions] get-question hatası:', err.error ?? response.status);
        return null;
    }

    const question = await response.json();

    // Görüldü olarak işaretle
    seenIds.add(question.id);

    return question;   // { id, code_snippet, options, difficulty }
}

/**
 * Seçilen cevabı Edge Function üzerinden sunucuda doğrular.
 * correct_lang asla istemci tarafında kontrol edilmez.
 *
 * @param {number} questionId   - Soru ID'si
 * @param {string} selectedLang - Seçilen dil
 * @returns {Promise<{ correct: boolean, correct_lang: string } | null>}
 */
export async function checkAnswer(questionId, selectedLang) {
    const token = await _getToken();
    if (!token) return null;

    const response = await fetch(CHECK_ANSWER_URL, {
        method  : 'POST',
        headers : {
            'Content-Type'  : 'application/json',
            'Authorization' : `Bearer ${token}`,
        },
        body: JSON.stringify({
            question_id   : questionId,
            selected_lang : selectedLang,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[questions] check-answer hatası:', err.error ?? response.status);
        return null;
    }

    return await response.json();   // { correct, correct_lang }
}

/**
 * Düello modunda seed ile soru listesi çeker.
 * Her çağrı get-question'ı kullanır; seed client'ta LCG ile uygulanır.
 * (Sunucu sıralamayı bilmez — sadece görülmemiş sorular gelir)
 *
 * @param {number} seed
 * @param {number} count
 * @returns {Promise<Question[]>}
 */
export async function getDuelQuestions(seed, count = 15) {
    const questions = [];
    const localSeen = new Set();

    for (let i = 0; i < count; i++) {
        const token = await _getToken();
        if (!token) break;

        // Zorluk: ilk 5 kolay, ortа karışık, son 5 zor
        const difficulty = i < 5 ? 1 : i < 10 ? 3 : 5;

        const response = await fetch(GET_QUESTION_URL, {
            method  : 'POST',
            headers : {
                'Content-Type'  : 'application/json',
                'Authorization' : `Bearer ${token}`,
            },
            body: JSON.stringify({
                difficulty,
                seen_ids: [...localSeen],
            }),
        });

        if (!response.ok) break;

        const q = await response.json();
        localSeen.add(q.id);
        questions.push(q);
    }

    // Seed ile deterministik sıralama (iki oyuncunun aynı sırayı görmesi için)
    return _seededShuffle(questions, seed);
}

// ─── Özel Yardımcı Fonksiyonlar ────────────────────────────────

/**
 * Mevcut oturum JWT token'ını döner.
 * @returns {Promise<string|null>}
 * @private
 */
async function _getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

/**
 * Seed tabanlı LCG karıştırma — düello senkronizasyonu için.
 * @private
 */
function _seededShuffle(arr, seed) {
    const copy = [...arr];
    let s = seed;
    const a = 1664525, c = 1013904223, m = 2 ** 32;
    const rand = () => { s = (a * s + c) % m; return s / m; };

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
