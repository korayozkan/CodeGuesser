/**
 * store.js
 * ──────────────────────────────────────────────────────────────
 * Mağaza modalını yönetir:
 *   - Joker satın alma (Supabase profiles.jokers güncelleme)
 *   - Kozmetik satın alma (frames, efektler)
 *   - Tema satın alma & anlık uygulama
 *   - Günlük ödül sistemi (24 saatte bir)
 *   - Unvan hesaplama ve gösterimi
 *
 * Kozmetik sahipliği ve aktif tema Supabase'de saklanır.
 * localStorage yalnızca şu an etkin temanın hızlı okunması için
 * kullanılır (hile yapılamaz, görsel tercih).
 * ──────────────────────────────────────────────────────────────
 */

import { supabase, STORE_CATALOG, DAILY_REWARD } from './config.js';
import { showToast }                              from './ui-utils.js';
import { getCurrentUser, getCurrentProfile,
         updateJokerStockUI }              from './auth.js';
import { openModal }                              from './ui-utils.js';

// ─── DOM Referansları ──────────────────────────────────────────
const btnOpenStore     = document.getElementById('btn-open-store');
const storeGrid        = document.getElementById('store-grid');
const storeTabs        = document.querySelectorAll('[data-store-tab]');
const balanceEl        = document.getElementById('store-balance-value');
const btnDailyReward   = document.getElementById('btn-daily-reward');

// ─── Modül Durumu ──────────────────────────────────────────────
/** Aktif mağaza sekmesi */
let activeStoreTab = 'jokers';

// ─── Başlatma ──────────────────────────────────────────────────

/**
 * Mağaza modülünü başlatır.
 * Buton event listener'larını bağlar.
 */
export function initStore() {
    // Mağaza aç butonu
    btnOpenStore.addEventListener('click', () => {
        openModal('store-modal');
        _renderStoreTab(activeStoreTab);
        _updateBalanceUI();
    });

    // Mağaza sekmeleri
    storeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            storeTabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            activeStoreTab = tab.dataset.storeTab;
            _renderStoreTab(activeStoreTab);
        });
    });

    // Günlük ödül butonu
    btnDailyReward.addEventListener('click', claimDailyReward);

    // Sayfa yüklendiğinde günlük ödül butonunun durumunu ayarla
    _updateDailyRewardButton();
}

// ─── Tema Uygulama ─────────────────────────────────────────────

/**
 * Belirtilen temayı <body> sınıfıyla anında uygular.
 * Diğer modüllerden (auth.js) profil yüklendiğinde çağrılır.
 * @param {string} themeId - 'vscode-dark' | 'matrix' | 'cyberpunk'
 */
export function applyTheme(themeId) {
    const valid = ['vscode-dark', 'matrix', 'cyberpunk'];
    const theme = valid.includes(themeId) ? themeId : 'vscode-dark';

    // Önceki tema sınıflarını temizle
    document.body.classList.remove(...valid.map(t => `theme-${t}`));
    document.body.classList.add(`theme-${theme}`);

    // Hızlı erişim için localStorage'a sadece tema tercihini yaz (güvenli)
    localStorage.setItem('codeguesser-theme', theme);
}

// ─── Günlük Ödül ───────────────────────────────────────────────

/**
 * Günlük ödülü talep eder.
 * Son 24 saat içinde ödül alındıysa reddeder.
 */
export async function claimDailyReward() {
    const user    = getCurrentUser();
    const profile = getCurrentProfile();
    if (!user || !profile) return;

    // Son talep zamanını kontrol et
    const lastClaim = profile.daily_reward_claimed_at
        ? new Date(profile.daily_reward_claimed_at)
        : null;

    if (lastClaim) {
        const hoursSince = (Date.now() - lastClaim.getTime()) / 3600000;
        if (hoursSince < 24) {
            const remaining = Math.ceil(24 - hoursSince);
            showToast(`⏳ Günlük ödülü ${remaining} saat sonra alabilirsin.`, 'info');
            return;
        }
    }

    // Yeni joker stoklarını hesapla
    const currentJokers = profile.jokers ?? { fifty: 0, freeze: 0, skip: 0 };
    const updatedJokers = {
        fifty  : (currentJokers.fifty  ?? 0) + DAILY_REWARD.fifty,
        freeze : (currentJokers.freeze ?? 0) + DAILY_REWARD.freeze,
        skip   : (currentJokers.skip   ?? 0) + DAILY_REWARD.skip,
    };

    // Supabase güncelleme
    const { error } = await supabase
        .from('profiles')
        .update({
            jokers                  : updatedJokers,
            daily_reward_claimed_at : new Date().toISOString(),
        })
        .eq('id', user.id);

    if (error) {
        showToast('Ödül alınamadı: ' + error.message, 'error');
        return;
    }

    // Yerel profil ve UI güncelle
    updateJokerStockUI(updatedJokers);
    profile.daily_reward_claimed_at = new Date().toISOString();

    showToast(
        `🎁 Günlük ödül alındı! +${DAILY_REWARD.fifty} ✂️ +${DAILY_REWARD.freeze} 🧊 +${DAILY_REWARD.skip} ⏭️`,
        'success',
        5000
    );

    _updateDailyRewardButton();
}

// ─── Mağaza Render ─────────────────────────────────────────────

/**
 * Belirtilen sekmedeki ürünleri storeGrid'e render eder.
 * @param {string} tab - 'jokers' | 'frames' | 'themes' | 'effects'
 * @private
 */
function _renderStoreTab(tab) {
    storeGrid.innerHTML = '';
    const items = STORE_CATALOG[tab] ?? [];

    items.forEach(item => {
        const card = _buildStoreCard(item);
        storeGrid.appendChild(card);
    });
}

/**
 * Tek bir mağaza ürün kartı oluşturur.
 * @param {Object} item - STORE_CATALOG içindeki ürün nesnesi
 * @returns {HTMLElement}
 * @private
 */
function _buildStoreCard(item) {
    const profile     = getCurrentProfile();
    const owned       = _isOwned(item, profile);
    const isEquipped  = _isEquipped(item, profile);

    const card = document.createElement('div');
    card.className = 'store-item';
    if (owned)      card.classList.add('owned');
    if (isEquipped) card.classList.add('equipped');

    const priceText  = item.price === 0 ? 'Ücretsiz' : `${item.price} 💎`;
    const priceClass = item.price === 0 ? 'store-item__price free' : 'store-item__price';

    let btnLabel    = 'Satın Al';
    let btnDisabled = '';
    if (owned && item.type !== 'joker') {
        btnLabel    = isEquipped ? '✓ Takılı' : 'Tak';
        btnDisabled = isEquipped ? 'disabled' : '';
    }

    /* Law #13 Connectedness: fiyat + buton tek footer bileşeni */
    card.innerHTML = `
        <div class="store-item__body">
            <span class="store-item__icon">${item.icon}</span>
            <span class="store-item__name">${_escHtml(item.name)}</span>
        </div>
        <div class="store-item__footer">
            <span class="${priceClass}">${priceText}</span>
            <button class="store-item__btn" ${btnDisabled}>${btnLabel}</button>
        </div>
    `;

    card.querySelector('.store-item__btn').addEventListener('click', () => _handlePurchase(item, card));
    return card;
}

/**
 * Satın alma / takma işlemini yönetir.
 * @param {Object}      item - Ürün nesnesi
 * @param {HTMLElement} card - Ürün kartı elementi
 * @private
 */
async function _handlePurchase(item, card) {
    const user    = getCurrentUser();
    const profile = getCurrentProfile();
    if (!user || !profile) return;

    const owned = _isOwned(item, profile);

    if (owned && item.type !== 'joker') {
        // Kozmetik zaten sahip → tak/değiştir
        await _equipCosmetic(item, profile, user.id);
        return;
    }

    // Bakiye kontrolü (jokerler dahil)
    if (item.price > 0 && (profile.score ?? 0) < item.price) {
        showToast(`Yetersiz puan! Gereken: ${item.price} 💎`, 'error');
        return;
    }

    // Satın alma onayı
    const confirmed = item.price > 0
        ? confirm(`"${item.name}" için ${item.price} puan harcamak istiyor musun?`)
        : true;

    if (!confirmed) return;

    card.querySelector('.store-item__btn').disabled = true;

    if (item.type === 'joker') {
        await _purchaseJoker(item, profile, user.id);
    } else {
        await _purchaseCosmetic(item, profile, user.id);
    }

    // Kartı güncelle
    _refreshCard(card, item);
    _updateBalanceUI();
}

/**
 * Joker satın alma işlemi.
 * @private
 */
async function _purchaseJoker(item, profile, userId) {
    const newScore   = (profile.score ?? 0) - item.price;
    const current    = profile.jokers ?? { fifty: 0, freeze: 0, skip: 0 };
    const newJokers  = { ...current };

    // item.payload'daki joker miktarlarını ekle
    Object.entries(item.payload).forEach(([type, amount]) => {
        newJokers[type] = (newJokers[type] ?? 0) + amount;
    });

    const { error } = await supabase
        .from('profiles')
        .update({ jokers: newJokers, score: newScore })
        .eq('id', userId);

    if (error) {
        showToast('Satın alma başarısız: ' + error.message, 'error');
        return;
    }

    // Yerel güncelleme
    profile.jokers = newJokers;
    profile.score  = newScore;
    updateJokerStockUI(newJokers);

    showToast(`✅ ${item.name} satın alındı!`, 'success');
}

/**
 * Kozmetik (çerçeve, tema, efekt) satın alma.
 * @private
 */
async function _purchaseCosmetic(item, profile, userId) {
    const newScore    = (profile.score ?? 0) - item.price;
    const cosmetics   = [...(profile.unlocked_cosmetics ?? [])];
    if (!cosmetics.includes(item.id)) cosmetics.push(item.id);

    const update = { unlocked_cosmetics: cosmetics, score: newScore };

    const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', userId);

    if (error) {
        showToast('Satın alma başarısız: ' + error.message, 'error');
        return;
    }

    profile.unlocked_cosmetics = cosmetics;
    profile.score               = newScore;

    showToast(`✅ ${item.name} açıldı! Şimdi takabilirsin.`, 'success');

    // Satın alındıktan sonra otomatik tak
    await _equipCosmetic(item, profile, userId);
}

/**
 * Kozmetiği profile uygular.
 * @private
 */
async function _equipCosmetic(item, profile, userId) {
    const updateData = {};

    if (item.type === 'theme') {
        updateData.active_theme = item.id;
    } else if (item.type === 'frame') {
        updateData.active_frame = item.id;
    } else if (item.type === 'effect') {
        updateData.active_effect = item.id;
    }

    const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

    if (error) {
        showToast('Uygulama başarısız: ' + error.message, 'error');
        return;
    }

    // Yerel profil güncelle
    Object.assign(profile, updateData);

    // Temayı anında uygula
    if (item.type === 'theme') {
        applyTheme(item.id);
        showToast(`🎨 ${item.name} teması uygulandı!`, 'success');
    } else {
        showToast(`✨ ${item.name} takıldı!`, 'success');
    }

    // Tüm kartları yenile (equipped durumu değişti)
    _renderStoreTab(activeStoreTab);
}

// ─── Yardımcı Fonksiyonlar ─────────────────────────────────────

/**
 * Kullanıcının ürüne sahip olup olmadığını kontrol eder.
 * Ücretsiz ürünler her zaman sahip sayılır.
 * @private
 */
function _isOwned(item, profile) {
    if (item.price === 0) return true;
    return (profile?.unlocked_cosmetics ?? []).includes(item.id);
}

/**
 * Ürünün şu an takılı (aktif) olup olmadığını kontrol eder.
 * @private
 */
function _isEquipped(item, profile) {
    if (!profile) return false;
    if (item.type === 'theme')  return profile.active_theme  === item.id;
    if (item.type === 'frame')  return profile.active_frame  === item.id;
    if (item.type === 'effect') return profile.active_effect === item.id;
    return false;
}

/**
 * Tek bir kartın içeriğini (owned/equipped durumu) yeniler.
 * @private
 */
function _refreshCard(card, item) {
    const profile    = getCurrentProfile();
    const owned      = _isOwned(item, profile);
    const isEquipped = _isEquipped(item, profile);
    const btn        = card.querySelector('.store-item__btn');

    card.classList.toggle('owned',    owned);
    card.classList.toggle('equipped', isEquipped);

    if (owned && item.type !== 'joker') {
        btn.textContent = isEquipped ? '✓ Takılı' : 'Tak';
        btn.disabled    = isEquipped;
    } else {
        btn.disabled = false;
    }
}

/**
 * Bakiye göstergesini günceller.
 * @private
 */
function _updateBalanceUI() {
    const score = getCurrentProfile()?.score ?? 0;
    balanceEl.textContent = score.toLocaleString('tr-TR');
}

/**
 * Günlük ödül butonunun aktif/pasif durumunu günceller.
 * @private
 */
function _updateDailyRewardButton() {
    const profile   = getCurrentProfile();
    const lastClaim = profile?.daily_reward_claimed_at
        ? new Date(profile.daily_reward_claimed_at)
        : null;

    if (!lastClaim) {
        btnDailyReward.disabled     = false;
        btnDailyReward.title        = 'Günlük ödülünü al!';
        return;
    }

    const hoursSince = (Date.now() - lastClaim.getTime()) / 3600000;

    if (hoursSince >= 24) {
        btnDailyReward.disabled = false;
        btnDailyReward.title    = 'Günlük ödülünü al!';
    } else {
        const remaining = Math.ceil(24 - hoursSince);
        btnDailyReward.disabled = true;
        btnDailyReward.title    = `${remaining} saat sonra tekrar alabilirsin`;
        btnDailyReward.textContent = `⏳ ${remaining}s sonra`;
    }
}

/**
 * XSS önlemi.
 * @private
 */
function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
