/**
 * duel.js
 * ──────────────────────────────────────────────────────────────
 * 1v1 Düello sistemini yönetir:
 *   - Oda oluşturma (player1)
 *   - Link ile katılım (player2)
 *   - Supabase Realtime ile canlı skor senkronizasyonu
 *   - URL parametresinden otomatik oda katılımı
 *   - Oyun bitişinde kazanan belirleme ve Supabase güncelleme
 *
 * Düello Akışı:
 *   1. player1 oda oluşturur → status: 'waiting'
 *   2. player2 link/ID ile katılır → status: 'active'
 *   3. Her oyuncu aynı soru setini (seed ile) cevaplar
 *   4. Birisi 3 can bitirince veya tüm sorular tükenince biter
 *   5. status: 'finished', winner_id güncellenir
 * ──────────────────────────────────────────────────────────────
 */

import { supabase }                         from './config.js';
import { showToast }                        from './ui-utils.js';
import { getCurrentUser, getCurrentProfile,
         showScreen }                       from './auth.js';
import { getDuelQuestions }                 from './questions.js';
import {
    INITIAL_LIVES, INITIAL_TIME, MAX_TIME,
    URGENT_TIME_THRESHOLD, TIME_BONUS_ON_CORRECT,
    POINTS_PER_DIFFICULTY,
} from './config.js';
import { updateDifficultyStars, getDifficultyText } from './ui-utils.js';

// ─── DOM Referansları ──────────────────────────────────────────
const menuScreen       = document.getElementById('menu-screen');
const duelScreen       = document.getElementById('duel-screen');
const gameScreen       = document.getElementById('game-screen');

// Lobi
const btnCreateDuel    = document.getElementById('btn-create-duel');
const btnJoinDuel      = document.getElementById('btn-join-duel');
const btnLeaveDuel     = document.getElementById('btn-leave-duel');
const btnCopyLink      = document.getElementById('btn-copy-duel-link');
const duelIdInput      = document.getElementById('duel-id-input');
const duelLinkInput    = document.getElementById('duel-link-input');
const duelWaiting      = document.getElementById('duel-waiting');
const duelJoinSection  = document.getElementById('duel-join-section');
const btnStartDuel     = document.getElementById('btn-start-duel');

// Oyun alanı (düello HUD)
const duelGameArea     = document.getElementById('duel-game-area');
const duelP1Name       = document.getElementById('duel-p1-name');
const duelP1Score      = document.getElementById('duel-p1-score');
const duelP2Name       = document.getElementById('duel-p2-name');
const duelP2Score      = document.getElementById('duel-p2-score');

// Oyun ekranındaki ortak elementler (düello modunda da kullanılır)
const codeSnippet      = document.getElementById('code-snippet');
const optionButtons    = Array.from(document.querySelectorAll('.btn-option'));
const timerFill        = document.getElementById('timer-fill');
const timerText        = document.getElementById('timer-text');
const livesDisplay     = document.getElementById('lives-display');
const scoreDisplay     = document.getElementById('score-display');
const streakDisplay    = document.getElementById('streak-display');
const questionNumber   = document.getElementById('question-number');

// ─── Modül Durumu ──────────────────────────────────────────────
let duelState = _createDuelState();

function _createDuelState() {
    return {
        duelId          : null,
        isPlayer1       : false,
        opponentId      : null,
        opponentName    : 'Rakip',
        questions       : [],       // Seed ile üretilen soru listesi
        currentQIndex   : 0,
        myScore         : 0,
        myLives         : INITIAL_LIVES,
        timeRemaining   : INITIAL_TIME,
        timerId         : null,
        isAnswerLocked  : false,
        isRunning       : false,
        channel         : null,     // Realtime kanal
    };
}

// ─── Başlatma ──────────────────────────────────────────────────

/**
 * Düello modülünü başlatır.
 * Sayfa yüklendiğinde URL'de duel_id varsa otomatik katılım dener.
 */
export function initDuel() {
    btnStartDuel?.addEventListener('click', () => {
        showScreen(duelScreen);
        _checkUrlForDuelId();
    });

    btnCreateDuel.addEventListener('click',  createDuel);
    btnJoinDuel.addEventListener('click',    () => joinDuel(duelIdInput.value.trim()));
    btnLeaveDuel.addEventListener('click',   leaveDuel);
    btnCopyLink.addEventListener('click',    _copyDuelLink);

    // Düello cevap handler'ı burada BAĞLANMAZ.
    // game.js zaten tüm .btn-option butonlarına listener ekliyor.
    // duelState.isRunning kontrolü ile düello modunda doğru handler çalışır.
    // Tek bir listener, iki farklı state nesnesi kontrol ediyor — çakışma yok.

    // Sayfa yüklendiğinde URL'deki duel_id parametresini kontrol et
    _checkUrlForDuelId();
}

// ─── Oda Oluşturma ─────────────────────────────────────────────

/**
 * Yeni bir düello odası oluşturur (player1).
 * Supabase'e yeni satır ekler, status: 'waiting'.
 */
export async function createDuel() {
    const user = getCurrentUser();
    if (!user) { showToast('Önce giriş yapmalısın.', 'error'); return; }

    btnCreateDuel.disabled = true;

    // Benzersiz soru seed'i üret
    const seed = Math.floor(Math.random() * 9_000_000) + 1_000_000;

    const { data, error } = await supabase
        .from('duels')
        .insert({
            player1_id    : user.id,
            status        : 'waiting',
            question_seed : seed,
        })
        .select('id')
        .single();

    if (error || !data) {
        showToast('Oda oluşturulamadı: ' + (error?.message ?? 'Bilinmeyen hata'), 'error');
        btnCreateDuel.disabled = false;
        return;
    }

    duelState.duelId    = data.id;
    duelState.isPlayer1 = true;

    // Bağlantı linkini göster
    const duelLink = `${window.location.origin}${window.location.pathname}?duel_id=${data.id}`;
    duelLinkInput.value = duelLink;
    duelJoinSection.classList.add('hidden');
    duelWaiting.classList.remove('hidden');

    showToast('Oda oluşturuldu! Link kopyalandı.', 'success');
    _copyToClipboard(duelLink);

    // Rakip katılımını Realtime ile bekle
    _subscribeToRoom(data.id);
}

/**
 * Mevcut bir düello odasına katılır (player2).
 * @param {string} duelId - Düello UUID'si
 */
export async function joinDuel(duelId) {
    if (!duelId) {
        showToast('Geçerli bir Düello ID gir.', 'error');
        return;
    }

    const user = getCurrentUser();
    if (!user) { showToast('Önce giriş yapmalısın.', 'error'); return; }

    btnJoinDuel.disabled = true;

    // Odayı getir
    const { data: duel, error } = await supabase
        .from('duels')
        .select('*')
        .eq('id', duelId)
        .single();

    if (error || !duel) {
        showToast('Oda bulunamadı.', 'error');
        btnJoinDuel.disabled = false;
        return;
    }

    if (duel.status !== 'waiting') {
        showToast('Bu oda artık katılıma açık değil.', 'error');
        btnJoinDuel.disabled = false;
        return;
    }

    if (duel.player1_id === user.id) {
        showToast('Kendi odana katılamazsın!', 'error');
        btnJoinDuel.disabled = false;
        return;
    }

    // Odaya katıl → status: 'active'
    const { error: updateError } = await supabase
        .from('duels')
        .update({ player2_id: user.id, status: 'active' })
        .eq('id', duelId);

    if (updateError) {
        showToast('Katılım başarısız: ' + updateError.message, 'error');
        btnJoinDuel.disabled = false;
        return;
    }

    duelState.duelId    = duelId;
    duelState.isPlayer1 = false;
    duelState.opponentId = duel.player1_id;

    // Rakip adını profil tablosundan çek
    const { data: oppProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', duel.player1_id)
        .single();

    duelState.opponentName = oppProfile?.username ?? 'Rakip';

    showToast(`⚔️ Düello başlıyor! Rakip: ${duelState.opponentName}`, 'success');

    // Realtime kanalına abone ol ve oyunu başlat
    _subscribeToRoom(duelId);
    await _startDuelGame(duel.question_seed);
}

// ─── Oyun Başlatma (Düello) ────────────────────────────────────

/**
 * Düello oyununu başlatır.
 * Seed ile soru listesini üretir ve game-screen'e geçer.
 * @param {number} seed
 * @private
 */
async function _startDuelGame(seed) {
    duelState = {
        ..._createDuelState(),
        duelId       : duelState.duelId,
        isPlayer1    : duelState.isPlayer1,
        opponentId   : duelState.opponentId,
        opponentName : duelState.opponentName,
        channel      : duelState.channel,
        isRunning    : true,
    };

    // Düello modu aktif — game.js'teki şık listener'ları bu handler'a iletilir
    window.__duelActive      = true;
    window.__duelOptionClick = _handleDuelOptionClick;

    // Seed ile deterministik soru listesi
    duelState.questions = await getDuelQuestions(seed, 15);

    if (duelState.questions.length === 0) {
        showToast('Sorular yüklenemedi.', 'error');
        return;
    }

    // Oyun ekranına geç
    showScreen(gameScreen);
    _updateDuelHUD();

    await _loadDuelQuestion();
}

// ─── Soru Yükleme (Düello) ────────────────────────────────────

/**
 * Düello soru listesindeki sıradaki soruyu yükler.
 * @private
 */
async function _loadDuelQuestion() {
    _stopDuelTimer();
    duelState.isAnswerLocked = false;

    // Soru listesi bitti mi?
    if (duelState.currentQIndex >= duelState.questions.length) {
        await _endDuel('questions_exhausted');
        return;
    }

    const question = duelState.questions[duelState.currentQIndex];
    duelState.currentQIndex++;

    // UI güncelle
    codeSnippet.textContent = question.code_snippet;
    questionNumber.textContent = `Soru #${duelState.currentQIndex}`;

    // Şık butonlarını doldur
    optionButtons.forEach((btn, i) => {
        const lang = question.options[i];
        btn.textContent   = lang ?? '';
        btn.dataset.lang  = lang ?? '';
        btn.style.display = lang ? '' : 'none';
        btn.disabled      = !lang;
        btn.className     = 'btn btn-option';
    });

    // Zorluk göstergesi
    updateDifficultyStars(question.difficulty);

    // Zamanlayıcıyı başlat
    duelState.timeRemaining = INITIAL_TIME;
    _startDuelTimer(question);
}

// ─── Cevap Değerlendirme (Düello) ─────────────────────────────

/**
 * Düello modunda şık tıklandığında çağrılır.
 * (initDuel'de optionButtons'a bağlanır, game.js ile çakışmamak için
 *  duelState.isRunning kontrolü yapılır.)
 */
async function _handleDuelOptionClick(e) {
    if (!duelState.isRunning || duelState.isAnswerLocked) return;
    duelState.isAnswerLocked = true;
    _stopDuelTimer();

    const selected  = e.currentTarget.dataset.lang;
    const question  = duelState.questions[duelState.currentQIndex - 1];
    const isCorrect = selected === question.correct_lang;

    // Görsel geri bildirim
    optionButtons.forEach(b => { b.disabled = true; });
    if (isCorrect) {
        e.currentTarget.classList.add('correct');
        const pts = POINTS_PER_DIFFICULTY[question.difficulty] ?? 10;
        duelState.myScore += pts;
        duelState.timeRemaining = Math.min(
            duelState.timeRemaining + TIME_BONUS_ON_CORRECT, MAX_TIME
        );
    } else {
        e.currentTarget.classList.add('wrong');
        const correctBtn = optionButtons.find(b => b.dataset.lang === question.correct_lang);
        if (correctBtn) correctBtn.classList.add('correct');
        duelState.myLives--;
        _renderDuelLives();
    }

    // Skoru Supabase'e gönder (Realtime ile rakip görür)
    await _syncMyScore();
    _updateDuelHUD();

    // Can bitti mi?
    if (duelState.myLives <= 0) {
        setTimeout(() => _endDuel('lives_out'), 800);
        return;
    }

    // 1 saniye sonra sonraki soruya geç
    setTimeout(() => _loadDuelQuestion(), 1000);
}

// ─── Zamanlayıcı (Düello) ─────────────────────────────────────

/**
 * Düello zamanlayıcısını başlatır.
 * @param {Object} question - Aktif soru nesnesi
 * @private
 */
function _startDuelTimer(question) {
    _stopDuelTimer();
    _updateDuelTimerUI(duelState.timeRemaining);

    duelState.timerId = setInterval(async () => {
        if (!duelState.isRunning) { _stopDuelTimer(); return; }

        duelState.timeRemaining--;
        _updateDuelTimerUI(duelState.timeRemaining);

        if (duelState.timeRemaining <= 0) {
            _stopDuelTimer();
            duelState.myLives--;
            _renderDuelLives();
            showToast('⏰ Süre doldu!', 'error');

            if (duelState.myLives <= 0) {
                await _endDuel('lives_out');
            } else {
                setTimeout(() => _loadDuelQuestion(), 800);
            }
        }
    }, 1000);
}

function _stopDuelTimer() {
    if (duelState.timerId) {
        clearInterval(duelState.timerId);
        duelState.timerId = null;
    }
}

// ─── Realtime Senkronizasyonu ──────────────────────────────────

/**
 * Düello odasındaki değişiklikleri Realtime ile dinler.
 * player1: rakibin katılımını bekler, katılınca oyunu başlatır.
 * player2: zaten katılmış olarak oyuna başlar.
 * @param {string} duelId
 * @private
 */
function _subscribeToRoom(duelId) {
    // Önceki kanalı temizle
    if (duelState.channel) {
        supabase.removeChannel(duelState.channel);
    }

    duelState.channel = supabase
        .channel(`duel:${duelId}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'duels', filter: `id=eq.${duelId}` },
            async (payload) => {
                const updated = payload.new;

                // player1: rakip katıldıysa oyunu başlat
                if (
                    duelState.isPlayer1 &&
                    updated.status === 'active' &&
                    updated.player2_id
                ) {
                    // Rakip adını çek
                    const { data: opp } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('id', updated.player2_id)
                        .single();

                    duelState.opponentId   = updated.player2_id;
                    duelState.opponentName = opp?.username ?? 'Rakip';

                    duelWaiting.classList.add('hidden');
                    showToast(`⚔️ ${duelState.opponentName} katıldı! Başlıyor...`, 'success');

                    await _startDuelGame(updated.question_seed);
                }

                // Rakip skoru güncellendi → HUD yenile
                if (updated.status === 'active') {
                    _updateOpponentScoreUI(updated);
                }

                // Rakip oyunu bitirdiyse
                if (updated.status === 'finished') {
                    _handleDuelFinished(updated);
                }
            }
        )
        .subscribe();
}

/**
 * Kendi skorumu Supabase'e yazar.
 * Realtime aracılığıyla rakibe iletilir.
 * @private
 */
async function _syncMyScore() {
    if (!duelState.duelId) return;

    const user     = getCurrentUser();
    const scoreCol = duelState.isPlayer1 ? 'p1_score' : 'p2_score';

    await supabase
        .from('duels')
        .update({ [scoreCol]: duelState.myScore })
        .eq('id', duelState.duelId);
}

// ─── Oyun Sonu (Düello) ────────────────────────────────────────

/**
 * Düello oyununu bitirir.
 * Sadece oyunu bitiren taraf (kendi canları biten ya da sorular biten)
 * Supabase'i günceller.
 * @param {'lives_out'|'questions_exhausted'} reason
 * @private
 */
async function _endDuel(reason) {
    duelState.isRunning = false;
    _stopDuelTimer();

    // Son skoru kaydet
    await _syncMyScore();

    // Supabase'den güncel düello satırını çek
    const { data: duel } = await supabase
        .from('duels')
        .select('p1_score, p2_score, player1_id, player2_id, status')
        .eq('id', duelState.duelId)
        .single();

    if (!duel || duel.status === 'finished') return;

    // Kazananı belirle
    const user = getCurrentUser();
    const myFinalScore  = duelState.myScore;
    const oppFinalScore = duelState.isPlayer1 ? duel.p2_score : duel.p1_score;

    let winnerId = null;
    if (myFinalScore > oppFinalScore)      winnerId = user.id;
    else if (oppFinalScore > myFinalScore) winnerId = duelState.opponentId;
    // Berabere → winner_id null kalır

    // Düello odasını kapat
    await supabase
        .from('duels')
        .update({ status: 'finished', winner_id: winnerId })
        .eq('id', duelState.duelId);

    _showDuelResult(myFinalScore, oppFinalScore, winnerId, user.id);
}

/**
 * Karşı tarafın bitirdiği düellonun sonucunu gösterir.
 * @param {Object} updatedDuel - Realtime'dan gelen güncel satır
 * @private
 */
function _handleDuelFinished(updatedDuel) {
    if (!duelState.isRunning) return;   // Biz de zaten bitmişiz

    duelState.isRunning = false;
    _stopDuelTimer();

    const user          = getCurrentUser();
    const myScore       = duelState.myScore;
    const opponentScore = duelState.isPlayer1
        ? updatedDuel.p2_score
        : updatedDuel.p1_score;

    _showDuelResult(myScore, opponentScore, updatedDuel.winner_id, user.id);
}

/**
 * Düello sonuç Toast'ını gösterir.
 * @private
 */
function _showDuelResult(myScore, oppScore, winnerId, myId) {
    const isWinner = winnerId === myId;
    const isDraw   = winnerId === null;

    let msg;
    if (isDraw)      msg = `🤝 Berabere! ${myScore} - ${oppScore}`;
    else if (isWinner) msg = `🏆 Kazandın! ${myScore} - ${oppScore}`;
    else               msg = `😔 Kaybettin. ${myScore} - ${oppScore}`;

    showToast(msg, isDraw ? 'info' : isWinner ? 'success' : 'error', 6000);

    // 3 saniye sonra menüye dön
    setTimeout(() => {
        _cleanupDuel();
        showScreen(menuScreen);
    }, 3000);
}

// ─── UI Güncellemeleri ─────────────────────────────────────────

/**
 * Düello HUD'undaki isimleri ve skorları günceller.
 * @private
 */
function _updateDuelHUD() {
    const user = getCurrentUser();
    const profile = getCurrentProfile();

    duelP1Name.textContent  = duelState.isPlayer1
        ? (profile?.username ?? 'Sen')
        : duelState.opponentName;

    duelP2Name.textContent  = duelState.isPlayer1
        ? duelState.opponentName
        : (profile?.username ?? 'Sen');

    duelP1Score.textContent = duelState.isPlayer1
        ? duelState.myScore
        : '?';

    duelP2Score.textContent = duelState.isPlayer1
        ? '?'
        : duelState.myScore;

    // Ana skor göstergesini de güncelle
    scoreDisplay.textContent = duelState.myScore.toLocaleString('tr-TR');
}

/**
 * Realtime güncellemesinden rakip skorunu HUD'a yazar.
 * @param {Object} updatedDuel
 * @private
 */
function _updateOpponentScoreUI(updatedDuel) {
    const oppScore = duelState.isPlayer1
        ? updatedDuel.p2_score
        : updatedDuel.p1_score;

    if (duelState.isPlayer1) {
        duelP2Score.textContent = oppScore ?? '?';
    } else {
        duelP1Score.textContent = oppScore ?? '?';
    }
}

/**
 * Düello canlarını game-screen'deki kalp ikonlarıyla gösterir.
 * @private
 */
function _renderDuelLives() {
    const hearts = livesDisplay.querySelectorAll('.heart');
    hearts.forEach((heart, i) => {
        heart.classList.toggle('lost', i >= duelState.myLives);
    });
}

/**
 * Zamanlayıcı UI'ını günceller.
 * @private
 */
function _updateDuelTimerUI(seconds) {
    const pct = (seconds / MAX_TIME) * 100;
    timerFill.style.width = `${Math.max(pct, 0)}%`;
    timerText.textContent = Math.max(seconds, 0);
    timerFill.classList.toggle('urgent', seconds <= URGENT_TIME_THRESHOLD);
}

// ─── Temizleme & Yardımcı ─────────────────────────────────────

/**
 * Düellodan çıkılırken kaynakları temizler.
 */
export function leaveDuel() {
    _cleanupDuel();
    showScreen(menuScreen);
}

/**
 * @private
 */
function _cleanupDuel() {
    _stopDuelTimer();

    // Düello modu bayrağını temizle — game.js normal moda döner
    window.__duelActive      = false;
    window.__duelOptionClick = null;

    if (duelState.channel) {
        supabase.removeChannel(duelState.channel);
    }

    // Odayı 'finished' olarak işaretle (biri ayrılırsa)
    if (duelState.duelId && duelState.isRunning) {
        supabase
            .from('duels')
            .update({ status: 'finished' })
            .eq('id', duelState.duelId)
            .then(() => {});
    }

    duelState = _createDuelState();

    // Düello lobi UI'ını sıfırla
    duelWaiting.classList.add('hidden');
    duelJoinSection.classList.remove('hidden');
    btnCreateDuel.disabled = false;
    btnJoinDuel.disabled   = false;
    duelIdInput.value      = '';
}

/**
 * URL'deki ?duel_id= parametresini kontrol eder.
 * Varsa otomatik düello ekranını açar ve katılım dener.
 * @private
 */
function _checkUrlForDuelId() {
    const params = new URLSearchParams(window.location.search);
    const duelId = params.get('duel_id');

    if (duelId) {
        // URL'den parametreyi temizle (history API ile)
        window.history.replaceState({}, '', window.location.pathname);

        showScreen(duelScreen);
        joinDuel(duelId);
    }
}

/**
 * Panoya kopyalar.
 * @param {string} text
 * @private
 */
async function _copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Fallback: execCommand (eski tarayıcılar)
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }
}

/**
 * Düello linkini panoya kopyalar (buton handler).
 * @private
 */
async function _copyDuelLink() {
    if (!duelLinkInput.value) return;
    await _copyToClipboard(duelLinkInput.value);
    showToast('Link kopyalandı! 📋', 'success');
}
