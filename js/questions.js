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

// ─── Edge Function URL'leri ────────────────────────────────────
const EDGE_BASE        = `${SUPABASE_URL}/functions/v1`;
const GET_QUESTION_URL = `${EDGE_BASE}/get-question`;
const CHECK_ANSWER_URL = `${EDGE_BASE}/check-answer`;

// ─── Sabitler ──────────────────────────────────────────────────
const DIFFICULTY_STEP_INTERVAL = 3;
/** Arka planda önceden kaç soru yüklensin */
const PREFETCH_SIZE = 5;

// ─── Modül Durumu ──────────────────────────────────────────────
const seenIds = new Set();
let currentDifficulty = 1;
let correctInLevel    = 0;

/** Ön yüklenmiş soru kuyruğu — kullanıcı beklemeden alır */
const questionQueue = [];

/** Şu an arka planda prefetch yapılıyor mu */
let isPrefetching = false;

// ─── Dışa Açık API ─────────────────────────────────────────────

export function resetQuestions() {
    seenIds.clear();
    currentDifficulty = 1;
    correctInLevel    = 0;
    questionQueue.length = 0;
    isPrefetching     = false;
}

export function getDifficulty() { return currentDifficulty; }

export function registerCorrectAnswer() {
    correctInLevel++;
    if (correctInLevel >= DIFFICULTY_STEP_INTERVAL && currentDifficulty < 5) {
        currentDifficulty++;
        correctInLevel = 0;
        // Zorluk değişti — kuyruktaki soruları temizle (yanlış zorluk olabilir)
        questionQueue.length = 0;
        return true;
    }
    return false;
}

/**
 * Bir sonraki soruyu döner.
 * Önce önbellekten alır (0ms), kuyruk boşsa Edge Function'dan çeker.
 */
export async function getNextQuestion() {
    // Kuyrukta hazır soru var mı?
    if (questionQueue.length > 0) {
        const q = questionQueue.shift();
        // Arka planda yeni sorular yükle
        _prefetchQuestions();
        return q;
    }

    // Kuyruk boş — doğrudan çek (ilk soru veya prefetch yetişmedi)
    const token = await _getToken();
    if (!token) { console.error('[questions] Token alınamadı.'); return null; }

    const q = await _fetchOne(token, currentDifficulty, [...seenIds]);
    if (q) {
        seenIds.add(q.id);
        // Arka planda sonraki soruları hazırla
        _prefetchQuestions();
    }
    return q;
}

export async function checkAnswer(questionId, selectedLang) {
    const token = await _getToken();
    if (!token) return null;

    const response = await fetch(CHECK_ANSWER_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body   : JSON.stringify({ question_id: questionId, selected_lang: selectedLang }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[questions] check-answer hatası:', err.error ?? response.status);
        return null;
    }
    return response.json();
}

export async function getDuelQuestions(seed, count = 15) {
    const questions  = [];
    const localSeen  = new Set();
    const token      = await _getToken();
    if (!token) return [];

    for (let i = 0; i < count; i++) {
        const difficulty = i < 5 ? 1 : i < 10 ? 3 : 5;
        const q = await _fetchOne(token, difficulty, [...localSeen]);
        if (!q) break;
        localSeen.add(q.id);
        questions.push(q);
    }
    return _seededShuffle(questions, seed);
}

// ─── Özel Yardımcı Fonksiyonlar ────────────────────────────────

/**
 * Arka planda PREFETCH_SIZE kadar soru yükler ve kuyruğa ekler.
 * Oyun başlangıcında da dışarıdan çağrılabilmesi için export edildi.
 */
export async function _prefetchQuestions() {
    if (isPrefetching) return;
    if (questionQueue.length >= PREFETCH_SIZE) return;

    isPrefetching = true;
    const token = await _getToken();
    if (!token) { isPrefetching = false; return; }

    const needed = PREFETCH_SIZE - questionQueue.length;
    const allSeen = new Set([...seenIds, ...questionQueue.map(q => q.id)]);

    // Paralel fetch — tek tek değil aynı anda
    const fetches = Array.from({ length: needed }, () =>
        _fetchOne(token, currentDifficulty, [...allSeen])
    );

    const results = await Promise.all(fetches);
    for (const q of results) {
        if (q && !allSeen.has(q.id)) {
            allSeen.add(q.id);
            questionQueue.push(q);
        }
    }

    isPrefetching = false;
}

/**
 * Edge Function'dan tek soru çeker.
 */
async function _fetchOne(token, difficulty, seenArr) {
    try {
        const response = await fetch(GET_QUESTION_URL, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body   : JSON.stringify({ difficulty, seen_ids: seenArr }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('[questions] get-question hatası:', err.error ?? response.status);
            return null;
        }
        const q = await response.json();
        return q;
    } catch (err) {
        console.error('[questions] fetch hatası:', err);
        return null;
    }
}

async function _getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

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
