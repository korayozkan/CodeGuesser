/**
 * questions.js
 * ──────────────────────────────────────────────────────────────
 * Soru bankasını Supabase'den çeker, zorluk artış algoritmasını
 * yönetir ve oyuna hazır soru nesneleri sağlar.
 *
 * Zorluk Artış Mantığı:
 *   - Her DIFFICULTY_STEP_INTERVAL doğru cevapta zorluk 1 artar.
 *   - Maksimum zorluk 5'tir.
 *   - Aynı soru aynı oyun içinde iki kez gelmez (seen seti ile).
 * ──────────────────────────────────────────────────────────────
 */

import { supabase }  from './config.js';
import { shuffle }   from './ui-utils.js';

// ─── Sabitler ──────────────────────────────────────────────────
/** Kaç doğru cevapta bir zorluk seviyesi artar */
const DIFFICULTY_STEP_INTERVAL = 3;

/** Bir önbellekte tutulacak maksimum soru sayısı */
const CACHE_SIZE = 20;

// ─── Modül durumu ──────────────────────────────────────────────
/** Tüm çekilen sorular önbelleği { zorluk → Question[] } */
const questionCache = { 1: [], 2: [], 3: [], 4: [], 5: [] };

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
    // Önbelleği koru — Supabase'e gereksiz istek atmamak için
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
        return true;   // Zorluk arttı
    }
    return false;
}

/**
 * Mevcut zorluk seviyesine uygun bir sonraki soruyu döner.
 * Önce önbellekten alır; önbellekte uygun soru yoksa Supabase'den çeker.
 *
 * @returns {Promise<Question|null>}
 *   Question: { id, code_snippet, correct_lang, options: string[], difficulty }
 *   Uygun soru bulunamazsa null döner.
 */
export async function getNextQuestion() {
    // Önbellekten görülmemiş soru bul
    const cached = _pickFromCache(currentDifficulty);
    if (cached) return cached;

    // Önbellekte yok → Supabase'den çek
    await _fetchQuestions(currentDifficulty);

    // Tekrar dene
    const afterFetch = _pickFromCache(currentDifficulty);
    if (afterFetch) return afterFetch;

    // Bu seviyede soru kalmadıysa bir alt seviyeden al (fallback)
    return _fallbackQuestion();
}

/**
 * Düello modunda belirli bir seed ile tekrarlanabilir soru listesi üretir.
 * İki oyuncu aynı seed'i kullanarak aynı soruları alır.
 *
 * @param {number} seed  - Düello odası ID'sinden türetilen sayı
 * @param {number} count - Kaç soru çekilecek
 * @returns {Promise<Question[]>}
 */
export async function getDuelQuestions(seed, count = 15) {
    // Tüm zorluk seviyelerinden eşit dağılımlı soru çek
    const { data, error } = await supabase
        .from('questions')
        .select('id, code_snippet, correct_lang, options, difficulty')
        .order('id', { ascending: true })
        .limit(count * 3);   // Fazla çek, seed ile filtrele

    if (error || !data) return [];

    // Seed tabanlı deterministik karıştırma (LCG algoritması)
    const shuffled = _seededShuffle(data, seed);
    return shuffled.slice(0, count).map(_normalizeQuestion);
}

// ─── Özel Yardımcı Fonksiyonlar ────────────────────────────────

/**
 * Belirtilen zorluk önbelleğinden görülmemiş bir soru döner.
 * Uygun soru yoksa null döner.
 * @private
 */
function _pickFromCache(difficulty) {
    const pool = questionCache[difficulty];
    const unseen = pool.filter(q => !seenIds.has(q.id));
    if (unseen.length === 0) return null;

    // Rastgele seç
    const question = unseen[Math.floor(Math.random() * unseen.length)];
    seenIds.add(question.id);
    return question;
}

/**
 * Supabase'den belirtilen zorlukta CACHE_SIZE kadar soru çeker
 * ve önbelleğe ekler.
 * @private
 */
async function _fetchQuestions(difficulty) {
    const { data, error } = await supabase
        .from('questions')
        .select('id, code_snippet, correct_lang, options, difficulty')
        .eq('difficulty', difficulty)
        .limit(CACHE_SIZE);

    if (error || !data) {
        console.warn(`[questions] Zorluk ${difficulty} için soru çekilemedi:`, error?.message);
        return;
    }

    // Önbelleğe ekle (tekrar ekleme yapma)
    const existingIds = new Set(questionCache[difficulty].map(q => q.id));
    const newQuestions = data
        .filter(q => !existingIds.has(q.id))
        .map(_normalizeQuestion);

    questionCache[difficulty].push(...newQuestions);
}

/**
 * Mevcut zorlukta soru bulunamazsa, düşük zorluktan rastgele soru döner.
 * Tüm seviyeler boşsa null döner.
 * @private
 */
function _fallbackQuestion() {
    for (let lvl = currentDifficulty - 1; lvl >= 1; lvl--) {
        const q = _pickFromCache(lvl);
        if (q) return q;
    }
    return null;
}

/**
 * Ham Supabase satırını uygulama formatına normalize eder.
 * - options dizisini karıştırır (her görüntülemede farklı sıra)
 * @param {Object} row - Supabase sorgu satırı
 * @returns {Question}
 * @private
 */
function _normalizeQuestion(row) {
    return {
        id           : row.id,
        code_snippet : row.code_snippet,
        correct_lang : row.correct_lang,
        options      : shuffle(row.options),   // Şıkları karıştır
        difficulty   : row.difficulty,
    };
}

/**
 * Seed tabanlı deterministik dizi karıştırma — LCG (Linear Congruential Generator).
 * Aynı seed → aynı sıra garantisi verir.
 * Düello modunda her iki oyuncunun aynı soruları sırayla görmesini sağlar.
 *
 * @param {Array}  arr
 * @param {number} seed
 * @returns {Array}
 * @private
 */
function _seededShuffle(arr, seed) {
    const copy = [...arr];
    let s = seed;

    // LCG parametreleri (Numerical Recipes)
    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;

    const rand = () => {
        s = (a * s + c) % m;
        return s / m;
    };

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
