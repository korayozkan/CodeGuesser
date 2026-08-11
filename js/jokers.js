/**
 * jokers.js
 * ──────────────────────────────────────────────────────────────
 * Üç joker mekaniğini yönetir:
 *   ✂️  50/50  — Yanlış şıklardan birini kaldırır
 *   🧊  Freeze — Sayacı 5 saniye dondurur
 *   ⏭️  Skip   — Soruyu can kaybetmeden geçer
 *
 * Joker stokları hiçbir zaman localStorage'da tutulmaz.
 * Tüm stok değişiklikleri Supabase üzerinden yapılır.
 * ──────────────────────────────────────────────────────────────
 */

import { supabase }              from './config.js';
import { getCurrentUser,
         getCurrentProfile,
         updateJokerStockUI }    from './auth.js';
import { showToast }             from './ui-utils.js';

// ─── Sabitler ──────────────────────────────────────────────────
/** Freeze jokeri kaç saniye dondurur */
const FREEZE_DURATION_SEC = 5;

// ─── DOM Referansları ──────────────────────────────────────────
const btnFifty  = document.getElementById('joker-fifty');
const btnFreeze = document.getElementById('joker-freeze');
const btnSkip   = document.getElementById('joker-skip');

const countFifty  = document.getElementById('joker-fifty-count');
const countFreeze = document.getElementById('joker-freeze-count');
const countSkip   = document.getElementById('joker-skip-count');

// ─── Modül Durumu ──────────────────────────────────────────────
/** Oyun modülünden enjekte edilen callback'ler */
let _callbacks = {
    pauseTimer  : null,   // () → void
    resumeTimer : null,   // () → void
    loadNext    : null,   // () → void
    getOptions  : null,   // () → HTMLElement[]   (şık butonları)
    getCurrentQ : null,   // () → Question
};

/** Freeze aktif mi? (çift kullanımı engeller) */
let freezeActive = false;

/** Freeze sayaç timer ID */
let freezeTimerId = null;

// ─── Başlatma ──────────────────────────────────────────────────

/**
 * Joker modülünü başlatır. Oyun ekranı açıldığında çağrılır.
 * @param {Object} callbacks - Oyun modülünden gelen callback fonksiyonları
 */
export function initJokers(callbacks) {
    _callbacks = { ..._callbacks, ...callbacks };

    btnFifty.addEventListener('click',  useFiftyFifty);
    btnFreeze.addEventListener('click', useFreeze);
    btnSkip.addEventListener('click',   useSkip);

    // İlk stok değerlerini UI'a yaz
    syncJokerUI();
}

/**
 * Oyun bittiğinde veya ekran değiştiğinde temizleme yapar.
 */
export function cleanupJokers() {
    if (freezeTimerId) clearTimeout(freezeTimerId);
    freezeActive = false;
    document.body.classList.remove('freeze-active');
    btnFreeze.classList.remove('active-freeze');
}

/**
 * Profildeki güncel joker stoklarını buton sayaçlarına yazar.
 */
export function syncJokerUI() {
    const jokers = getCurrentProfile()?.jokers ?? { fifty: 0, freeze: 0, skip: 0 };
    _setCount(countFifty,  jokers.fifty  ?? 0);
    _setCount(countFreeze, jokers.freeze ?? 0);
    _setCount(countSkip,   jokers.skip   ?? 0);

    // Stoku 0 olan jokerler pasif görünür
    btnFifty.disabled  = (jokers.fifty  ?? 0) <= 0;
    btnFreeze.disabled = (jokers.freeze ?? 0) <= 0 || freezeActive;
    btnSkip.disabled   = (jokers.skip   ?? 0) <= 0;
}

// ─── Joker Uygulamaları ────────────────────────────────────────

/**
 * 50/50 — Yanlış şıklardan birini (rastgele) kaldırır.
 * Doğru şık asla kaldırılmaz.
 */
async function useFiftyFifty() {
    const question = _callbacks.getCurrentQ?.();
    if (!question) return;

    const options = _callbacks.getOptions?.();
    if (!options || options.length === 0) return;

    // Zaten devre dışı/kaldırılmış şıkları filtrele
    const wrongOptions = options.filter(btn =>
        btn.dataset.lang !== question.correct_lang &&
        !btn.classList.contains('eliminated') &&
        !btn.disabled
    );

    if (wrongOptions.length === 0) {
        showToast('Kaldırılacak yanlış şık kalmadı.', 'info');
        return;
    }

    // Stok kontrolü & Supabase güncellemesi
    const success = await _consumeJoker('fifty');
    if (!success) return;

    // Rastgele bir yanlış şıkkı kaldır
    const target = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    target.classList.add('eliminated');
    target.disabled = true;

    showToast('50/50 kullanıldı! Bir yanlış şık kaldırıldı.', 'info');
}

/**
 * Freeze — Zamanlayıcıyı FREEZE_DURATION_SEC saniye dondurur.
 * Süre boyunca buz efekti CSS sınıfı eklenir.
 */
async function useFreeze() {
    if (freezeActive) {
        showToast('Zaten dondurulmuş!', 'info');
        return;
    }

    const success = await _consumeJoker('freeze');
    if (!success) return;

    // Zamanlayıcıyı durdur
    _callbacks.pauseTimer?.();
    freezeActive = true;

    // Görsel efektler
    document.body.classList.add('freeze-active');
    btnFreeze.classList.add('active-freeze');
    btnFreeze.disabled = true;

    showToast(`⏸ Sayaç ${FREEZE_DURATION_SEC} saniye donduruldu!`, 'info');

    // FREEZE_DURATION_SEC sonra zamanlayıcıyı devam ettir
    freezeTimerId = setTimeout(() => {
        _callbacks.resumeTimer?.();
        freezeActive = false;
        document.body.classList.remove('freeze-active');
        btnFreeze.classList.remove('active-freeze');
        // Stok yenilenmediği sürece buton pasif kalır
        syncJokerUI();
        showToast('❄ Dondurma bitti, süre devam ediyor!', 'info');
    }, FREEZE_DURATION_SEC * 1000);
}

/**
 * Skip — Mevcut soruyu can ve puan kaybetmeden geçer.
 */
async function useSkip() {
    const success = await _consumeJoker('skip');
    if (!success) return;

    showToast('⏭ Soru atlandı!', 'info');
    _callbacks.loadNext?.();
}

// ─── Stok Yönetimi (Supabase) ──────────────────────────────────

/**
 * Supabase'de joker stokunu 1 azaltır.
 * Yerel profil ve UI'ı da günceller.
 * Stok yoksa false döner.
 *
 * @param {'fifty'|'freeze'|'skip'} type
 * @returns {Promise<boolean>}
 * @private
 */
async function _consumeJoker(type) {
    const user    = getCurrentUser();
    const profile = getCurrentProfile();

    if (!user || !profile) {
        showToast('Oturum bulunamadı.', 'error');
        return false;
    }

    const currentStock = profile.jokers?.[type] ?? 0;
    if (currentStock <= 0) {
        showToast(`${_jokerName(type)} stokun tükendi!`, 'error');
        syncJokerUI();
        return false;
    }

    // Yeni joker nesnesi (immutable güncelleme)
    const updatedJokers = {
        ...profile.jokers,
        [type]: currentStock - 1,
    };

    // Supabase'e yaz (RLS: sadece kendi satırı güncellenebilir)
    const { error } = await supabase
        .from('profiles')
        .update({ jokers: updatedJokers })
        .eq('id', user.id);

    if (error) {
        showToast('Joker kullanılamadı: ' + error.message, 'error');
        return false;
    }

    // Yerel profil ve UI'ı güncelle
    updateJokerStockUI(updatedJokers);
    syncJokerUI();
    return true;
}

// ─── Yardımcı Fonksiyonlar ─────────────────────────────────────

/**
 * Sayaç elementinin textContent'ini günceller
 * ve görsel olarak uyarı verir (0 ise kırmızı).
 * @private
 */
function _setCount(el, count) {
    el.textContent = count;
    el.style.background = count <= 0 ? '#666' : '';
}

/**
 * Joker tipi için Türkçe isim döner.
 * @private
 */
function _jokerName(type) {
    return { fifty: '50/50', freeze: 'Dondur', skip: 'Pas Geç' }[type] ?? type;
}
