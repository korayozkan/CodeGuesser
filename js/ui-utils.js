/**
 * ui-utils.js
 * ──────────────────────────────────────────────────────────────
 * Uygulama genelinde kullanılan saf UI yardımcı fonksiyonları.
 * Hiçbir Supabase veya oyun mantığı içermez.
 * ──────────────────────────────────────────────────────────────
 */

const toastContainer = document.getElementById('toast-container');

/**
 * Ekranda toast bildirimi gösterir.
 * @param {string} message   - Bildirim metni
 * @param {'info'|'success'|'error'} type - Bildirim türü (opsiyonel, default: 'info')
 * @param {number} duration  - Gösterim süresi ms (opsiyonel, default: 3500)
 */
export function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');

    toastContainer.appendChild(toast);

    // Belirtilen süre sonunda çıkış animasyonu + DOM'dan kaldır
    setTimeout(() => {
        toast.classList.add('toast--out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

/**
 * Doğru/yanlış cevap görsel efektini oynatır.
 * @param {boolean} isCorrect
 */
export function showAnswerEffect(isCorrect) {
    const el   = document.getElementById('answer-effect');
    const icon = document.getElementById('answer-effect-icon');

    icon.textContent = isCorrect ? '✅' : '❌';
    el.classList.remove('hidden');

    // Animasyon bitince gizle
    setTimeout(() => el.classList.add('hidden'), 500);
}

/**
 * Bir modali gösterir.
 * @param {string} modalId - Modal elementinin id'si
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

/**
 * Bir modali gizler.
 * @param {string} modalId
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

/**
 * Zorluk yıldızlarını günceller (1–5 arası).
 * @param {number} level - 1–5 arası zorluk seviyesi
 */
export function updateDifficultyStars(level) {
    const stars = document.querySelectorAll('.difficulty-stars .star');
    stars.forEach((star, i) => {
        star.classList.toggle('active', i < level);
    });
}

/**
 * Zorluk seviyesinin Türkçe metnini döner.
 * @param {number} level
 * @returns {string}
 */
export function getDifficultyText(level) {
    const map = { 1: 'Kolay', 2: 'Orta', 3: 'Zor', 4: 'Uzman', 5: 'Efsane' };
    return map[level] ?? 'Bilinmiyor';
}

/**
 * Puandan unvan hesaplar.
 * @param {number} score
 * @param {Array}  thresholds - TITLE_THRESHOLDS dizisi (config.js'den)
 * @returns {string} unvan metni
 */
export function getTitleForScore(score, thresholds) {
    let title = thresholds[0].title;
    for (const entry of thresholds) {
        if (score >= entry.min) title = entry.title;
        else break;
    }
    return title;
}

/**
 * Saniyeyi MM:SS biçiminde döner (opsiyonel kullanım).
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

/**
 * Bir diziyi Fisher-Yates algoritmasıyla karıştırır.
 * (Sorular ve şıklar için kullanılır — pure function, side-effect yok)
 * @param {Array} arr
 * @returns {Array} Yeni karışık dizi (orijinali değiştirmez)
 */
export function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
