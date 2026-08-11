/**
 * auth.js
 * ──────────────────────────────────────────────────────────────
 * Google ve GitHub OAuth akışlarını yönetir.
 * Oturum değişikliklerini dinleyerek ilgili ekranları gösterir/gizler.
 * Profil verilerini Supabase'den çekerek UI'yı günceller.
 * ──────────────────────────────────────────────────────────────
 */

import { supabase }            from './config.js';
import { showToast }           from './ui-utils.js';
import { applyTheme }          from './store.js';
import { initLeaderboard }     from './leaderboard.js';

// ─── DOM Referansları ──────────────────────────────────────────
const authScreen   = document.getElementById('auth-screen');
const menuScreen   = document.getElementById('menu-screen');
const gameScreen   = document.getElementById('game-screen');
const duelScreen   = document.getElementById('duel-screen');

const btnLoginGithub = document.getElementById('btn-login-github');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLogout      = document.getElementById('btn-logout');

// Profil UI elementleri
const elUsername  = document.getElementById('profile-username');
const elTitle     = document.getElementById('profile-title');
const elMaxScore  = document.getElementById('profile-max-score');
const elInitials  = document.getElementById('profile-initials');
const elAvatar    = document.getElementById('profile-avatar');
const elStockFifty  = document.getElementById('stock-fifty');
const elStockFreeze = document.getElementById('stock-freeze');
const elStockSkip   = document.getElementById('stock-skip');

// ─── Mevcut Kullanıcı (modül genelinde erişilebilir) ──────────
let currentUser    = null;
let currentProfile = null;

/**
 * Dışarıya açık kullanıcı getter'ları.
 * Diğer modüller bu fonksiyonları import ederek kullanıcıya erişir.
 */
export const getCurrentUser    = () => currentUser;
export const getCurrentProfile = () => currentProfile;

// ─── Ekran Yönetimi ────────────────────────────────────────────

/**
 * Tüm ekranları gizler, belirtilen ekranı gösterir.
 * @param {HTMLElement} screenEl - Gösterilecek ekran elementi
 */
export function showScreen(screenEl) {
    [authScreen, menuScreen, gameScreen, duelScreen].forEach(s => {
        s.classList.remove('active');
    });
    screenEl.classList.add('active');
}

// ─── OAuth Giriş İşlemleri ────────────────────────────────────

/**
 * GitHub OAuth akışını başlatır.
 * Supabase, kullanıcıyı GitHub'a yönlendirir;
 * geri döndüğünde onAuthStateChange tetiklenir.
 */
async function loginWithGitHub() {
    btnLoginGithub.disabled = true;
    const { error } = await supabase.auth.signInWithOAuth({
        provider : 'github',
        options  : {
            redirectTo: window.location.origin + window.location.pathname,
        },
    });

    if (error) {
        showToast('GitHub girişi başarısız: ' + error.message, 'error');
        btnLoginGithub.disabled = false;
    }
    // Başarılıysa sayfa yönlendirilir, disabled durumu önemli değil
}

/**
 * Google OAuth akışını başlatır.
 */
async function loginWithGoogle() {
    btnLoginGoogle.disabled = true;
    const { error } = await supabase.auth.signInWithOAuth({
        provider : 'google',
        options  : {
            redirectTo: window.location.origin + window.location.pathname,
        },
    });

    if (error) {
        showToast('Google girişi başarısız: ' + error.message, 'error');
        btnLoginGoogle.disabled = false;
    }
}

/**
 * Oturumu kapatır ve auth ekranına döner.
 */
async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        showToast('Çıkış yapılamadı: ' + error.message, 'error');
        return;
    }
    currentUser    = null;
    currentProfile = null;
    showScreen(authScreen);
    showToast('Çıkış yapıldı.', 'info');
}

// ─── Profil Yükleme ────────────────────────────────────────────

/**
 * Kullanıcının profilini Supabase'den çeker ve UI'ı günceller.
 * @param {string} userId - auth.users UUID
 */
export async function loadProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('username, score, title, jokers, active_theme, active_frame')
        .eq('id', userId)
        .single();

    if (error) {
        showToast('Profil yüklenemedi: ' + error.message, 'error');
        return null;
    }

    currentProfile = data;
    renderProfileUI(data);
    applyTheme(data.active_theme);   // Temayı hemen uygula
    return data;
}

/**
 * Profil bilgilerini menü ekranındaki UI elementlerine yazar.
 * @param {Object} profile - profiles tablosundan gelen satır
 */
function renderProfileUI(profile) {
    const { username, score, title, jokers, active_frame } = profile;

    // Kullanıcı adı ve unvan
    elUsername.textContent = username;
    elTitle.textContent    = title;

    // En yüksek skor — leaderboard tablosundan da çekilebilir
    // Burada profiles.score kullanılır (toplam birikimli)
    elMaxScore.textContent = score.toLocaleString('tr-TR');

    // Avatar baş harfleri
    elInitials.textContent = username.slice(0, 2).toUpperCase();

    // Avatar çerçevesi — önceki çerçeve sınıfını temizle, yenisini ekle
    elAvatar.className = 'avatar frame-' + (active_frame || 'default');

    // Joker stok göstergesi
    elStockFifty.textContent  = jokers?.fifty  ?? 0;
    elStockFreeze.textContent = jokers?.freeze ?? 0;
    elStockSkip.textContent   = jokers?.skip   ?? 0;
}

/**
 * Joker stoklarını UI'da günceller (oyun sırasında joker kullanıldığında).
 * @param {Object} jokers - { fifty, freeze, skip }
 */
export function updateJokerStockUI(jokers) {
    elStockFifty.textContent  = jokers?.fifty  ?? 0;
    elStockFreeze.textContent = jokers?.freeze ?? 0;
    elStockSkip.textContent   = jokers?.skip   ?? 0;

    // currentProfile'i de güncelle (diğer modüllerin okuması için)
    if (currentProfile) currentProfile.jokers = jokers;
}

// ─── Auth Durumu Dinleyicisi ───────────────────────────────────

/**
 * Auth modülünü başlatır.
 * onAuthStateChange ile oturum olaylarını dinler:
 *  - SIGNED_IN  → profil yükle, menü ekranını göster
 *  - SIGNED_OUT → auth ekranını göster
 *  - TOKEN_REFRESHED → kullanıcıyı sessizce güncelle
 */
export function initAuth() {
    // Buton event listener'ları
    btnLoginGithub.addEventListener('click', loginWithGitHub);
    btnLoginGoogle.addEventListener('click', loginWithGoogle);
    btnLogout.addEventListener('click', logout);

    // Modal kapatma butonları (delegated)
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.modal;
            const modal   = document.getElementById(modalId);
            if (modal) modal.classList.add('hidden');
        });
    });

    // Modal backdrop tıklamasıyla kapat
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
                modal.classList.add('hidden');
            }
        });
    });

    // Supabase oturum değişikliklerini dinle
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            currentUser = session.user;

            // Profil yükle ve menüyü göster
            const profile = await loadProfile(session.user.id);
            if (profile) {
                showScreen(menuScreen);
                initLeaderboard(session.user.id);   // Realtime lider tablosu başlat
            }

        } else if (event === 'SIGNED_OUT') {
            currentUser    = null;
            currentProfile = null;
            showScreen(authScreen);
        }
    });

    // Sayfa yüklendiğinde mevcut oturumu kontrol et
    _checkExistingSession();
}

/**
 * Sayfa yüklendiğinde zaten aktif bir oturum var mı kontrol eder.
 * OAuth callback sonrası hash fragment'i de işler.
 * @private
 */
async function _checkExistingSession() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        currentUser = session.user;
        const profile = await loadProfile(session.user.id);
        if (profile) {
            showScreen(menuScreen);
            initLeaderboard(session.user.id);
        }
    } else {
        // Oturum yoksa auth ekranını göster
        showScreen(authScreen);
    }
}
