/**
 * main.js — Uygulama giriş noktası (Entry Point)
 * ──────────────────────────────────────────────────────────────
 * Tüm modülleri import eder ve init fonksiyonlarını çağırır.
 * index.html sadece bu tek dosyayı yükler.
 *
 * Yükleme sırası önemlidir:
 *   1. config.js  → supabase istemcisi (diğerleri buna bağımlı)
 *   2. auth.js    → oturum başlar, profil yüklenir, ekranlar yönetilir
 *   3. game.js    → buton listener'ları bağlanır
 *   4. store.js   → mağaza, tema, günlük ödül
 *   5. duel.js    → düello lobi ve realtime
 *   6. leaderboard.js → auth içinden çağrılır, burada sadece import
 * ──────────────────────────────────────────────────────────────
 */

import { initAuth }  from './auth.js';
import { initGame }  from './game.js';
import { initStore } from './store.js';
import { initDuel }  from './duel.js';

/**
 * DOM tamamen hazır olduğunda başlat.
 * Modüller bağımsız init fonksiyonlarına sahip olduğundan
 * sıralı çağrı yeterlidir.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Önce game ve store init edilir (listener bağlanır ama henüz UI görünmez)
    initGame();
    initStore();
    initDuel();

    // Auth en son: oturum kontrolü yapar ve doğru ekranı gösterir.
    // initLeaderboard, auth başarılı olunca içeriden çağrılır.
    initAuth();
});
