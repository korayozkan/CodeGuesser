/**
 * leaderboard.js
 * ──────────────────────────────────────────────────────────────
 * Lider tablosunu Supabase'den çeker ve ekrana render eder.
 * Supabase Realtime ile leaderboard tablosunu dinler:
 *   - Başka bir oyuncu sıralamayı değiştirdiğinde Toast bildirim
 *   - Mevcut kullanıcının sırası değiştiğinde özel bildirim
 *
 * Sekmeler:
 *   - "Tüm Zamanlar" → leaderboard.max_score DESC, ilk 50 kayıt
 *   - "Bu Hafta"     → updated_at son 7 gün, ilk 50 kayıt
 * ──────────────────────────────────────────────────────────────
 */

import { supabase }    from './config.js';
import { showToast }   from './ui-utils.js';
import { openModal }   from './ui-utils.js';

// ─── DOM Referansları ──────────────────────────────────────────
const btnOpenLeaderboard = document.getElementById('btn-open-leaderboard');
const leaderboardModal   = document.getElementById('leaderboard-modal');
const podiumEl           = document.getElementById('leaderboard-podium');
const listEl             = document.getElementById('leaderboard-list');
const myRankRow          = document.getElementById('my-rank-row');
const myRankNumber       = document.getElementById('my-rank-number');
const tabs               = leaderboardModal.querySelectorAll('[data-tab]');

// ─── Modül Durumu ──────────────────────────────────────────────
/** Realtime kanal referansı — cleanup için saklanır */
let realtimeChannel = null;

/** Aktif sekme */
let activeTab = 'alltime';

/** Oturum açmış kullanıcının ID'si */
let currentUserId = null;

/** Son bilinen sıra (bildirim karşılaştırması için) */
let lastKnownRank = null;

// ─── Başlatma ──────────────────────────────────────────────────

/**
 * Leaderboard modülünü başlatır.
 * Auth tamamlandıktan sonra çağrılır.
 * @param {string} userId - Oturum açmış kullanıcının UUID'si
 */
export function initLeaderboard(userId) {
    // Zaten başlatıldıysa sadece userId güncelle, listener/kanal tekrar açma
    if (currentUserId) {
        currentUserId = userId;
        return;
    }

    currentUserId = userId;

    // Lider tablosu aç butonu — tek seferlik listener
    btnOpenLeaderboard.addEventListener('click', () => {
        openModal('leaderboard-modal');
        _loadLeaderboard(activeTab);
    });

    // Sekme değiştirme
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            activeTab = tab.dataset.tab;
            _loadLeaderboard(activeTab);
        });
    });

    // Realtime aboneliği başlat
    _subscribeRealtime();
}

/**
 * Realtime aboneliğini temizler (kullanıcı oturumu kapattığında).
 */
export function cleanupLeaderboard() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

// ─── Veri Çekme ────────────────────────────────────────────────

/**
 * Lider tablosunu Supabase'den çeker ve render eder.
 * @param {'alltime'|'weekly'} tab
 * @private
 */
async function _loadLeaderboard(tab) {
    // Yükleniyor durumu
    listEl.innerHTML = '<li class="leaderboard-loading">Yükleniyor...</li>';
    podiumEl.innerHTML = '';
    myRankRow.classList.add('hidden');

    let query = supabase
        .from('leaderboard')
        .select('user_id, username, max_score, title')
        .order('max_score', { ascending: false })
        .limit(50);

    // Haftalık sekmede son 7 günü filtrele
    if (tab === 'weekly') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('updated_at', weekAgo);
    }

    const { data, error } = await query;

    if (error) {
        listEl.innerHTML = `<li class="leaderboard-loading">Yüklenemedi: ${error.message}</li>`;
        return;
    }

    if (!data || data.length === 0) {
        listEl.innerHTML = '<li class="leaderboard-loading">Henüz kayıt yok.</li>';
        return;
    }

    // Podyum (ilk 3)
    _renderPodium(data.slice(0, 3));

    // Liste (4. sıradan itibaren)
    _renderList(data, 4);

    // Kullanıcının kendi sırası
    _renderMyRank(data);
}

// ─── Render Fonksiyonları ──────────────────────────────────────

/**
 * İlk 3 oyuncuyu podyum olarak render eder.
 * @param {Array} top3
 * @private
 */
function _renderPodium(top3) {
    // Podyum sırası: 2. | 1. | 3.  (görsel hiyerarşi)
    const ORDER = [1, 0, 2];
    const MEDALS = ['🥇', '🥈', '🥉'];

    podiumEl.innerHTML = '';

    ORDER.forEach(idx => {
        if (!top3[idx]) return;
        const entry = top3[idx];
        const rank  = idx + 1;

        const item = document.createElement('div');
        item.className = `podium-item podium-item--${rank}`;

        item.innerHTML = `
            <span class="podium-rank">${MEDALS[idx]}</span>
            <span class="podium-name" title="${_escHtml(entry.username)}">${_escHtml(entry.username)}</span>
            <span class="podium-score">${entry.max_score.toLocaleString('tr-TR')}</span>
        `;

        // Kendi satırını vurgula
        if (entry.user_id === currentUserId) {
            item.style.outline = '2px solid var(--accent-primary)';
            item.style.borderRadius = 'var(--radius-md)';
        }

        podiumEl.appendChild(item);
    });
}

/**
 * 4. sıradan itibaren liste olarak render eder.
 * @param {Array}  data       - Tüm sıralama verisi
 * @param {number} startRank  - Kaçıncı sıradan başlanacak (genellikle 4)
 * @private
 */
function _renderList(data, startRank) {
    listEl.innerHTML = '';

    const subset = data.slice(startRank - 1);   // 0-indexed

    if (subset.length === 0) {
        listEl.innerHTML = '<li class="leaderboard-loading">—</li>';
        return;
    }

    subset.forEach((entry, i) => {
        const rank = i + startRank;
        const li   = document.createElement('li');
        li.className = 'leaderboard-item';
        if (entry.user_id === currentUserId) li.classList.add('is-current-user');

        li.innerHTML = `
            <span class="lb-rank">#${rank}</span>
            <span class="lb-name">${_escHtml(entry.username)}</span>
            <span class="lb-title">${_escHtml(entry.title)}</span>
            <span class="lb-score">${entry.max_score.toLocaleString('tr-TR')}</span>
        `;

        listEl.appendChild(li);
    });
}

/**
 * Kullanıcının kendi sırasını alt barda gösterir.
 * @param {Array} data - Tüm sıralama verisi
 * @private
 */
function _renderMyRank(data) {
    const myIndex = data.findIndex(e => e.user_id === currentUserId);

    if (myIndex === -1) {
        myRankRow.classList.add('hidden');
        return;
    }

    const myRank = myIndex + 1;
    myRankNumber.textContent = `#${myRank}`;
    myRankRow.classList.remove('hidden');

    // Sıra değişimini sakla (bildirim için)
    lastKnownRank = myRank;
}

// ─── Realtime Aboneliği ────────────────────────────────────────

/**
 * leaderboard tablosundaki UPDATE olaylarını Supabase Realtime ile dinler.
 * Bir oyuncu skoru değiştiğinde Toast bildirimi gösterir.
 * Mevcut kullanıcının sırası düştüyse özel uyarı verir.
 * @private
 */
function _subscribeRealtime() {
    // Önceki kanalı temizle
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
        .channel('public:leaderboard')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'leaderboard' },
            async (payload) => {
                const updated = payload.new;

                // Kendi güncellemelerimizi sessizce yoksay
                // (skoru biz kaydettiğimizde tekrar bildirim çıkmasın)
                if (updated.user_id === currentUserId) {
                    // Yine de modal açıksa tabloyu yenile
                    if (!leaderboardModal.classList.contains('hidden')) {
                        await _loadLeaderboard(activeTab);
                    }
                    return;
                }

                // Başka biri skoru güncelledi → bildirim
                showToast(
                    `🏆 ${_escHtml(updated.username)} sıralamayı güncelledi! (${updated.max_score.toLocaleString('tr-TR')} puan)`,
                    'info',
                    4000
                );

                // Modal açıksa tabloyu canlı olarak yenile
                if (!leaderboardModal.classList.contains('hidden')) {
                    await _loadLeaderboard(activeTab);
                }

                // Kullanıcının sırası değişti mi kontrol et
                await _checkRankChange();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('[leaderboard] Realtime bağlantısı aktif.');
            }
        });
}

/**
 * Kullanıcının mevcut sırasını yeniden çeker ve öncekiyle karşılaştırır.
 * Sıra düştüyse uyarı toast'ı gösterir.
 * @private
 */
async function _checkRankChange() {
    if (!currentUserId || lastKnownRank === null) return;

    const { data } = await supabase
        .from('leaderboard')
        .select('user_id')
        .order('max_score', { ascending: false })
        .limit(200);

    if (!data) return;

    const newIndex = data.findIndex(e => e.user_id === currentUserId);
    if (newIndex === -1) return;

    const newRank = newIndex + 1;

    if (newRank > lastKnownRank) {
        showToast(
            `📉 Sıralaman değişti! Artık #${newRank}. sıradasın. (Önceki: #${lastKnownRank})`,
            'error',
            5000
        );
    } else if (newRank < lastKnownRank) {
        showToast(
            `📈 Tebrikler! #${newRank}. sıraya yükseldin!`,
            'success',
            5000
        );
    }

    lastKnownRank = newRank;
}

// ─── Yardımcı ──────────────────────────────────────────────────

/**
 * XSS önlemi için HTML özel karakterlerini escape eder.
 * @param {string} str
 * @returns {string}
 * @private
 */
function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
