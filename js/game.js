/**
 * game.js
 * ──────────────────────────────────────────────────────────────
 * Oyunun merkezi döngüsünü yönetir:
 *   - Zamanlayıcı (setInterval, 1 saniyelik tick)
 *   - Can sistemi
 *   - Puan ve seri (streak) hesaplama
 *   - Soru akışı ve bonus soru tetikleyicisi
 *   - Oyun bitiş mantığı ve Supabase skor kaydı
 * ──────────────────────────────────────────────────────────────
 */

import {
    supabase,
    INITIAL_LIVES,
    INITIAL_TIME,
    TIME_BONUS_ON_CORRECT,
    MAX_TIME,
    URGENT_TIME_THRESHOLD,
    STREAK_BONUS_TRIGGER,
    BONUS_MULTIPLIER,
    POINTS_PER_DIFFICULTY,
    TITLE_THRESHOLDS,
} from './config.js';

import {
    getNextQuestion,
    checkAnswer,
    resetQuestions,
    getDifficulty,
    registerCorrectAnswer,
} from './questions.js';

import {
    initJokers,
    cleanupJokers,
    syncJokerUI,
} from './jokers.js';

import {
    showToast,
    showAnswerEffect,
    updateDifficultyStars,
    getDifficultyText,
    getTitleForScore,
    openModal,
    closeModal,
} from './ui-utils.js';

import { getCurrentUser, getCurrentProfile, showScreen } from './auth.js';

// ─── DOM Referansları ──────────────────────────────────────────
const gameScreen       = document.getElementById('game-screen');
const menuScreen       = document.getElementById('menu-screen');

const livesDisplay     = document.getElementById('lives-display');
const scoreDisplay     = document.getElementById('score-display');
const streakDisplay    = document.getElementById('streak-display');
const timerFill        = document.getElementById('timer-fill');
const timerText        = document.getElementById('timer-text');
const difficultyStars  = document.getElementById('difficulty-stars');
const questionNumber   = document.getElementById('question-number');
const questionDiffText = document.getElementById('question-difficulty-text');
const codeSnippet      = document.getElementById('code-snippet');
const optionsContainer = document.getElementById('options-container');
const optionButtons    = Array.from(document.querySelectorAll('.btn-option'));

const btnQuit          = document.getElementById('btn-quit-game');
const btnPlayAgain     = document.getElementById('btn-play-again');
const btnGoMenu        = document.getElementById('btn-go-menu');
const btnStartGame     = document.getElementById('btn-start-game');

// Oyun sonu modal elementleri
const finalScore     = document.getElementById('final-score');
const finalQuestions = document.getElementById('final-questions');
const finalStreak    = document.getElementById('final-streak');
const finalTitle     = document.getElementById('final-title');
const gameOverIcon   = document.getElementById('game-over-icon');

// Bonus modal
const btnStartBonus  = document.getElementById('btn-start-bonus');

// ─── Oyun Durumu ───────────────────────────────────────────────
/**
 * Tüm oyun durumu tek bir nesnede toplanır.
 * Bu sayede sıfırlama (reset) tek bir fonksiyon çağrısıyla yapılır.
 */
let state = _createInitialState();

function _createInitialState() {
    return {
        lives           : INITIAL_LIVES,
        score           : 0,
        streak          : 0,          // Ardışık doğru sayısı
        maxStreak       : 0,          // Bu oyundaki en uzun seri
        questionsAnswered: 0,
        timeRemaining   : INITIAL_TIME,
        currentQuestion : null,
        isAnswerLocked  : false,      // Şık tıklandıktan sonra kilitle
        isBonusQuestion : false,      // Bonus soru bayrağı
        pendingDifficulty: false,     // Zorluk artışı bekleniyor mu
        timerId         : null,       // setInterval ID
        isRunning       : false,
    };
}

// ─── Dışa Açık API ─────────────────────────────────────────────

/** Duel modülünün erişmesi için mevcut skoru döner */
export const getScore    = () => state.score;
export const getIsRunning = () => state.isRunning;

// ─── Başlatma ──────────────────────────────────────────────────

/**
 * Oyun modülünü ilk sayfa yüklemesinde başlatır.
 * Buton event listener'larını bağlar.
 */
export function initGame() {
    // Ana menüdeki "Oyna" butonu
    btnStartGame.addEventListener('click', startGame);

    // Oyundan çık
    btnQuit.addEventListener('click', () => {
        if (confirm('Oyundan çıkmak istediğine emin misin? İlerleme kaydedilmeyecek.')) {
            _endGame(false);
        }
    });

    // Oyun sonu modalı — Tekrar oyna
    btnPlayAgain.addEventListener('click', () => {
        closeModal('game-over-modal');
        startGame();
    });

    // Oyun sonu modalı — Ana menü
    btnGoMenu.addEventListener('click', () => {
        closeModal('game-over-modal');
        showScreen(menuScreen);
    });

    // Bonus soru başlat
    btnStartBonus.addEventListener('click', () => {
        closeModal('bonus-modal');
        _loadQuestion(true);   // isBonusQuestion = true
    });
}

/**
 * Yeni bir oyun başlatır.
 * Durumu sıfırlar, soruları temizler ve ilk soruyu yükler.
 */
export async function startGame() {
    // Önceki oyunu temizle
    _stopTimer();
    cleanupJokers();
    state = _createInitialState();
    state.isRunning = true;

    // Soru motorunu sıfırla
    resetQuestions();

    // Ekranı göster
    showScreen(gameScreen);

    // UI başlat
    _renderLives();
    _updateScoreUI(0);
    _updateStreakUI(0);
    _updateTimerUI(INITIAL_TIME);
    updateDifficultyStars(1);

    // Joker modülünü başlat (callback'ler enjekte et)
    initJokers({
        pauseTimer  : _pauseTimer,
        resumeTimer : _resumeTimer,
        loadNext    : () => _loadQuestion(false),
        getOptions  : () => optionButtons,
        getCurrentQ : () => state.currentQuestion,
    });
    syncJokerUI();

    // İlk soruyu yükle
    await _loadQuestion(false);
}

// ─── Soru Yükleme ──────────────────────────────────────────────

/**
 * Bir sonraki soruyu Supabase'den çeker ve ekrana yazar.
 * @param {boolean} isBonusOverride - true ise bu soru bonus sorudur
 */
async function _loadQuestion(isBonusOverride) {
    _stopTimer();
    state.isAnswerLocked  = false;
    state.isBonusQuestion = isBonusOverride;

    // Tüm şık butonlarını sıfırla
    _resetOptionButtons();

    const question = await getNextQuestion();

    // Soru bulunamazsa (edge case)
    if (!question) {
        showToast('Soru yüklenemedi, oyun bitiyor.', 'error');
        await _endGame(true);
        return;
    }

    state.currentQuestion = question;
    state.questionsAnswered++;

    // Kodu ekrana yaz
    codeSnippet.textContent = question.code_snippet;

    // Şık butonlarını doldur
    question.options.forEach((lang, i) => {
        optionButtons[i].textContent    = lang;
        optionButtons[i].dataset.lang   = lang;
        optionButtons[i].style.display  = '';
        optionButtons[i].disabled       = false;
    });

    // Soru sayacı ve zorluk göstergesi
    const difficulty = getDifficulty();
    questionNumber.textContent   = `Soru #${state.questionsAnswered}`;
    questionDiffText.textContent = state.isBonusQuestion
        ? '⚡ BONUS'
        : getDifficultyText(difficulty);

    updateDifficultyStars(difficulty);

    // Bonus soruda başlık animasyonu
    if (state.isBonusQuestion) {
        codeSnippet.parentElement.style.border = '2px solid var(--accent-secondary)';
    } else {
        codeSnippet.parentElement.style.border = '';
    }

    // Zamanlayıcıyı yeniden başlat
    state.timeRemaining = INITIAL_TIME;
    _startTimer();
}

// ─── Cevap Değerlendirme ───────────────────────────────────────

/**
 * Seçilen şık butonuna tıklandığında çağrılır.
 * Cevap doğruluğu sunucu tarafında (check-answer Edge Function) kontrol edilir.
 * @param {MouseEvent} e
 */
async function _handleOptionClick(e) {
    if (state.isAnswerLocked || !state.isRunning) return;
    state.isAnswerLocked = true;

    _stopTimer();

    const selectedLang = e.currentTarget.dataset.lang;
    const questionId   = state.currentQuestion.id;

    // Tüm butonları geçici olarak kilitle (sunucu cevabını beklerken)
    optionButtons.forEach(btn => { btn.disabled = true; });

    // ── Sunucuda cevabı doğrula ─────────────────────────────────
    const result = await checkAnswer(questionId, selectedLang);

    // Sunucu cevap veremezse (ağ hatası vb.) can düş, devam et
    if (!result) {
        showToast('Sunucuya ulaşılamadı, can kaybedildi.', 'error');
        _processWrongAnswer();
        if (state.lives <= 0) { await _endGame(true); return; }
        setTimeout(() => _loadQuestion(false), 1000);
        return;
    }

    const isCorrect   = result.correct;
    const correctLang = result.correct_lang;   // Sunucudan geldi

    // Doğru/yanlış görsel geri bildirimi
    _highlightAnswer(e.currentTarget, isCorrect, correctLang);
    showAnswerEffect(isCorrect);

    if (isCorrect) {
        await _processCorrectAnswer();
    } else {
        _processWrongAnswer();
    }

    if (state.lives <= 0) {
        await _endGame(true);
        return;
    }

    setTimeout(async () => {
        if (!state.isRunning) return;
        if (state.streak > 0 && state.streak % STREAK_BONUS_TRIGGER === 0 && !state.isBonusQuestion) {
            openModal('bonus-modal');
            return;
        }
        await _loadQuestion(false);
    }, 1000);
}

/**
 * Doğru cevap mantığı — puan, süre bonusu ve zorluk artışı.
 * @private
 */
async function _processCorrectAnswer() {
    const difficulty = getDifficulty();
    const basePoints = POINTS_PER_DIFFICULTY[difficulty] ?? 10;
    const multiplier = state.isBonusQuestion ? BONUS_MULTIPLIER : 1;
    const earned     = basePoints * multiplier;

    // Puan ekle
    state.score  += earned;
    state.streak++;
    if (state.streak > state.maxStreak) state.maxStreak = state.streak;

    // Süre bonusu (MAX_TIME tavanını aşamaz)
    state.timeRemaining = Math.min(state.timeRemaining + TIME_BONUS_ON_CORRECT, MAX_TIME);

    // UI güncelle
    _updateScoreUI(state.score);
    _updateStreakUI(state.streak);

    // Zorluk artış kontrolü
    const leveledUp = registerCorrectAnswer();
    if (leveledUp) {
        showToast(`🔼 Zorluk arttı! Seviye ${getDifficulty()}`, 'success');
    }

    if (state.isBonusQuestion) {
        showToast(`⚡ BONUS! +${earned} puan!`, 'success');
    }
}

/**
 * Yanlış cevap mantığı — can düşürme ve seri sıfırlama.
 * @private
 */
function _processWrongAnswer() {
    state.lives--;
    state.streak = 0;

    _renderLives();
    _updateStreakUI(0);

    if (state.lives > 0) {
        showToast(`❤️ ${state.lives} can kaldı!`, 'error');
    }
}

// ─── Zamanlayıcı ───────────────────────────────────────────────

/**
 * 1 saniyelik interval başlatır.
 * Her tick'te timeRemaining azaltılır, UI güncellenir.
 * @private
 */
function _startTimer() {
    _stopTimer();   // Önceki varsa temizle
    _updateTimerUI(state.timeRemaining);

    state.timerId = setInterval(async () => {
        if (!state.isRunning) return;

        state.timeRemaining--;
        _updateTimerUI(state.timeRemaining);

        if (state.timeRemaining <= 0) {
            _stopTimer();
            // Süre bitti — can düş, seri sıfırla
            _processWrongAnswer();
            showToast('⏰ Süre doldu!', 'error');

            if (state.lives <= 0) {
                await _endGame(true);
            } else {
                // 1 saniye bekle sonra sıradaki soruya geç
                setTimeout(() => _loadQuestion(false), 1000);
            }
        }
    }, 1000);
}

/** Zamanlayıcıyı durdurur (clearInterval). */
function _stopTimer() {
    if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
    }
}

/** Zamanlayıcıyı duraklatır (Freeze joker için). */
export function _pauseTimer() {
    _stopTimer();
}

/** Zamanlayıcıyı kaldığı yerden devam ettirir (Freeze sonrası). */
export function _resumeTimer() {
    _startTimer();
}

// ─── Oyun Sonu ─────────────────────────────────────────────────

/**
 * Oyunu bitirir, skoru Supabase'e kaydeder ve sonuç modalını gösterir.
 * @param {boolean} showModal - true ise game-over-modal açılır
 * @private
 */
async function _endGame(showModal) {
    state.isRunning = false;
    _stopTimer();
    cleanupJokers();

    // Skoru Supabase'e kaydet
    await _saveScore();

    if (!showModal) return;

    // Unvan hesapla
    const newTitle = getTitleForScore(state.score, TITLE_THRESHOLDS);

    // Oyun sonu modalını doldur
    gameOverIcon.textContent      = state.lives <= 0 ? '💀' : '🏁';
    finalScore.textContent        = state.score.toLocaleString('tr-TR');
    finalQuestions.textContent    = state.questionsAnswered;
    finalStreak.textContent       = `${state.maxStreak}🔥`;
    finalTitle.textContent        = newTitle;

    openModal('game-over-modal');
}

/**
 * Oyun skorunu Supabase'e kaydeder.
 * Hem profiles.score hem leaderboard.max_score güncellenir.
 * Kritik oyun verisi sadece Supabase'de tutulur.
 * @private
 */
async function _saveScore() {
    const user = getCurrentUser();
    if (!user || state.score === 0) return;

    const profile  = getCurrentProfile();
    const newTotal = (profile?.score ?? 0) + state.score;
    const newTitle = getTitleForScore(newTotal, TITLE_THRESHOLDS);

    // profiles tablosunu güncelle
    await supabase
        .from('profiles')
        .update({
            score : newTotal,
            title : newTitle,
        })
        .eq('id', user.id);

    // leaderboard: max_score'u güncelle (sadece daha yüksekse)
    const { data: lbRow } = await supabase
        .from('leaderboard')
        .select('max_score')
        .eq('user_id', user.id)
        .single();

    const currentMax = lbRow?.max_score ?? 0;
    if (newTotal > currentMax) {
        await supabase
            .from('leaderboard')
            .update({
                max_score  : newTotal,
                title      : newTitle,
                updated_at : new Date().toISOString(),
            })
            .eq('user_id', user.id);
    }
}

// ─── UI Render Fonksiyonları ───────────────────────────────────

/**
 * Can kalplerinini günceller.
 * Kaybedilen canlar grileşir.
 * @private
 */
function _renderLives() {
    const hearts = livesDisplay.querySelectorAll('.heart');
    hearts.forEach((heart, i) => {
        heart.classList.toggle('lost', i >= state.lives);
    });
}

/**
 * Skor göstergesini günceller.
 * @param {number} score
 * @private
 */
function _updateScoreUI(score) {
    scoreDisplay.textContent = score.toLocaleString('tr-TR');
}

/**
 * Seri (streak) göstergesini günceller.
 * @param {number} streak
 * @private
 */
function _updateStreakUI(streak) {
    streakDisplay.textContent = streak > 0 ? `${streak}🔥` : '0';
    // 5'in katlarında vurgu
    streakDisplay.classList.toggle('streak-milestone', streak > 0 && streak % STREAK_BONUS_TRIGGER === 0);
}

/**
 * Zamanlayıcı çubuğunu ve metin sayacını günceller.
 * 5 saniyenin altında "urgent" (kırmızı) stili uygular.
 * @param {number} seconds
 * @private
 */
function _updateTimerUI(seconds) {
    const pct = (seconds / MAX_TIME) * 100;
    timerFill.style.width = `${Math.max(pct, 0)}%`;
    timerText.textContent = Math.max(seconds, 0);

    timerFill.classList.toggle('urgent', seconds <= URGENT_TIME_THRESHOLD);
}

/**
 * Şık butonlarını başlangıç durumuna döndürür.
 * (correct/wrong/eliminated sınıflarını temizler)
 * @private
 */
function _resetOptionButtons() {
    optionButtons.forEach(btn => {
        btn.className    = 'btn btn-option';
        btn.disabled     = false;
        btn.textContent  = '';
        btn.dataset.lang = '';
        btn.style.display = '';
    });
}

/**
 * Tıklanan butonu ve doğru butonu vurgular.
 * @param {HTMLElement} clicked   - Tıklanan buton
 * @param {boolean}     isCorrect
 * @param {string}      correctLang
 * @private
 */
function _highlightAnswer(clicked, isCorrect, correctLang) {
    // Tüm butonları pasifleştir
    optionButtons.forEach(btn => { btn.disabled = true; });

    if (isCorrect) {
        clicked.classList.add('correct');
    } else {
        clicked.classList.add('wrong');
        // Doğru şıkkı yeşil göster
        const correctBtn = optionButtons.find(b => b.dataset.lang === correctLang);
        if (correctBtn) correctBtn.classList.add('correct');
    }
}

// ─── Event Listener Bağlama ────────────────────────────────────
// Şık butonlarına tek bir merkezi tıklama listener'ı bağlanır.
// Her handler kendi state.isRunning / duelState.isRunning kontrolü
// yaparak yalnızca aktif moda ait mantığı çalıştırır.
// duel.js, bu listener üzerinden _handleDuelOptionClick'i dışa açar.
optionButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Düello modu aktifse duel handler'ına ilet
        if (window.__duelActive) {
            window.__duelOptionClick?.(e);
        } else {
            _handleOptionClick(e);
        }
    });
});
