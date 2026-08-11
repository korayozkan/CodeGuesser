/**
 * config.example.js — Yapılandırma Şablonu
 * ──────────────────────────────────────────────────────────────
 * Bu dosyayı kopyalayarak "config.js" adıyla kaydet:
 *
 *   cp js/config.example.js js/config.js
 *
 * Ardından kendi Supabase proje bilgilerinle doldur.
 * config.js dosyası .gitignore'a eklenmiştir — commit'lenmez.
 * ──────────────────────────────────────────────────────────────
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── Supabase Bağlantı Bilgileri ──────────────────────────────
// Supabase Dashboard → Settings → API bölümünden kopyala
export const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY_HERE';

// ─── Supabase İstemcisi ───────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken   : true,
        persistSession     : true,
        storage            : localStorage,
        storageKey         : 'codeguesser-auth',
        detectSessionInUrl : true,
    },
    realtime: {
        params: { eventsPerSecond: 10 },
    },
});

// ─── Oyun Sabitleri ───────────────────────────────────────────
export const INITIAL_LIVES             = 3;
export const INITIAL_TIME              = 15;
export const TIME_BONUS_ON_CORRECT     = 2;
export const MAX_TIME                  = 15;
export const URGENT_TIME_THRESHOLD     = 5;
export const STREAK_BONUS_TRIGGER      = 5;
export const BONUS_MULTIPLIER          = 3;

export const POINTS_PER_DIFFICULTY = {
    1: 10, 2: 20, 3: 35, 4: 55, 5: 80,
};

export const TITLE_THRESHOLDS = [
    { min: 0,     title: 'Çaylak' },
    { min: 100,   title: 'Stajyer' },
    { min: 300,   title: 'Junior Dev' },
    { min: 700,   title: 'Mid-Level Dev' },
    { min: 1500,  title: 'Senior Dev' },
    { min: 3000,  title: 'Tech Lead' },
    { min: 6000,  title: 'Architect' },
    { min: 10000, title: 'Code Wizard 🧙' },
];

export const DAILY_REWARD = { fifty: 1, freeze: 1, skip: 1 };

export const STORE_CATALOG = {
    jokers: [
        { id: 'joker_fifty_x3',  name: '50/50 ×3',            icon: '✂️', price: 150, type: 'joker', payload: { fifty: 3 } },
        { id: 'joker_freeze_x3', name: 'Dondur ×3',            icon: '🧊', price: 150, type: 'joker', payload: { freeze: 3 } },
        { id: 'joker_skip_x3',   name: 'Pas Geç ×3',           icon: '⏭️', price: 150, type: 'joker', payload: { skip: 3 } },
        { id: 'joker_bundle',    name: 'Tam Set (her biri ×5)', icon: '🎒', price: 600, type: 'joker', payload: { fifty: 5, freeze: 5, skip: 5 } },
    ],
    frames: [
        { id: 'frame_default', name: 'Varsayılan', icon: '⬜', price: 0,    type: 'frame' },
        { id: 'frame_silver',  name: 'Gümüş',      icon: '🥈', price: 300,  type: 'frame' },
        { id: 'frame_gold',    name: 'Altın',       icon: '🥇', price: 800,  type: 'frame' },
        { id: 'frame_neon',    name: 'Neon',         icon: '💜', price: 1200, type: 'frame' },
    ],
    themes: [
        { id: 'vscode-dark', name: 'VS Code Dark', icon: '🖤', price: 0,   type: 'theme' },
        { id: 'matrix',      name: 'Matrix',        icon: '💚', price: 500, type: 'theme' },
        { id: 'cyberpunk',   name: 'Cyberpunk',     icon: '💜', price: 900, type: 'theme' },
    ],
    effects: [
        { id: 'effect_default',   name: 'Varsayılan',  icon: '✨', price: 0,   type: 'effect' },
        { id: 'effect_confetti',  name: 'Konfeti',      icon: '🎉', price: 400, type: 'effect' },
        { id: 'effect_firework',  name: 'Havai Fişek', icon: '🎆', price: 700, type: 'effect' },
        { id: 'effect_lightning', name: 'Şimşek',       icon: '⚡', price: 600, type: 'effect' },
    ],
};
