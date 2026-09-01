/* ═══════════════════════════════════════════════
   MUSIC PLAYER — player.js
═══════════════════════════════════════════════ */

const audio       = document.getElementById('audioPlayer');
const playerBar   = document.getElementById('playerBar');
const playPauseBtn= document.getElementById('playPauseBtn');
const playIcon    = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');
const volumeBar   = document.getElementById('volumeBar');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl   = document.getElementById('totalTime');
const playerTitle   = document.getElementById('playerTitle');
const playerArtist  = document.getElementById('playerArtist');
const playerCoverWrap = document.getElementById('playerCoverWrap');

let currentIdx = -1;
let isPlaying  = false;
let repeat     = false;

function setupTextMarquee(el) {
  if (!el || !(el instanceof HTMLElement)) return;

  const text = (el.textContent || '').trim();
  if (!text) return;

  const hasMarquee = el.classList.contains('text-marquee');
  if (!hasMarquee) {
    el.classList.add('text-marquee');
  }

  const currentTrack = el.querySelector('.marquee-track');
  if (currentTrack) {
    currentTrack.remove();
  }

  const overflow = el.scrollWidth > el.clientWidth + 1;
  el.dataset.marquee = overflow ? 'active' : 'inactive';

  if (!overflow) {
    el.textContent = text;
    return;
  }

  const track = document.createElement('div');
  track.className = 'marquee-track';
  track.innerHTML = `
    <span class="marquee-item">${text}</span>
    <span class="marquee-item" aria-hidden="true">${text}</span>
  `;
  el.textContent = '';
  el.appendChild(track);
}

function initTextMarquee(selector) {
  document.querySelectorAll(selector).forEach(el => setupTextMarquee(el));
}

function updatePlayerTitle(song) {
  if (!playerTitle) return;
  playerTitle.textContent = song.title || '—';
  setupTextMarquee(playerTitle);
}

window.addEventListener('load', () => {
  initTextMarquee('.song-title, .pl-song-title, .player-meta .title');
  if (playerTitle) setupTextMarquee(playerTitle);
});

// SVG icons
const ICON_PLAY  = '<path d="M8 5v14l11-7z"/>';
const ICON_PAUSE = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
const ICON_REPEAT = '<path d="M7 7h9.17L14.59 5.41 16 4l4 4-4 4-1.41-1.41L16.17 9H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5zm10 10H7.83l1.58 1.59L8 20l-4-4 4-4 1.41 1.41L7.83 15H17a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5z"/>';

// ── Phát bài hát theo index ────────────────────
function playSong(idx) {
  if (idx < 0 || idx >= SONGS.length) return;

  const song = SONGS[idx];

  // Cập nhật card active
  document.querySelectorAll('.song-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.pl-song-row').forEach(row => row.classList.remove('playing'));
  const card = document.querySelector(`.song-card[data-idx="${idx}"]`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const row = document.querySelector(`.pl-song-row[data-idx="${idx}"]`);
  if (row) row.classList.add('playing');

  // Load audio
  audio.src = song.src;
  audio.load();
  audio.play().catch(e => console.warn('Autoplay blocked:', e));
  isPlaying = true;
  currentIdx = idx;

  // Cập nhật UI player bar
  playerBar.classList.add('visible');
  updatePlayerTitle(song);
  playerArtist.textContent = song.artist;
  updatePlayIcon();
  updateCover(song.image);

  // Tiêu đề tab
  document.title = `▶ ${song.title} — ${song.artist}`;

  // Cập nhật thông báo trên điện thoại (lock screen / notification bar)
  updateMediaSession(song);
}

// ── Media Session: hiện banner bài hát trên thanh thông báo điện thoại ──
function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title:  song.title  || 'Đang phát',
    artist: song.artist || '',
    album:  song.album  || 'Tâm Music',
    artwork: song.image ? [
      { src: song.image, sizes: '96x96',   type: 'image/png' },
      { src: song.image, sizes: '128x128', type: 'image/png' },
      { src: song.image, sizes: '192x192', type: 'image/png' },
      { src: song.image, sizes: '256x256', type: 'image/png' },
      { src: song.image, sizes: '384x384', type: 'image/png' },
      { src: song.image, sizes: '512x512', type: 'image/png' }
    ] : []
  });
}

// Điều khiển từ thanh thông báo / tai nghe
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play',  () => togglePlay());
  navigator.mediaSession.setActionHandler('pause', () => togglePlay());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
  navigator.mediaSession.setActionHandler('nexttrack',     () => nextSong());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime != null && audio.duration) {
      audio.currentTime = details.seekTime;
    }
  });
}

// ── Cập nhật ảnh bìa trong player ─────────────
function updateCover(imgSrc) {
  if (imgSrc) {
    playerCoverWrap.innerHTML = `<img class="player-cover" src="${imgSrc}" alt="cover">`;
  } else {
    playerCoverWrap.innerHTML = `<div class="player-cover-placeholder">🎵</div>`;
  }
}

// ── Play / Pause ───────────────────────────────
function togglePlay() {
  if (currentIdx === -1 && SONGS.length > 0) {
    playSong(0);
    return;
  }
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    document.title = document.title.replace('▶ ', '⏸ ');
  } else {
    audio.play();
    isPlaying = true;
    document.title = document.title.replace('⏸ ', '▶ ');
  }
  updatePlayIcon();
}

function updatePlayIcon() {
  // 1. Cập nhật TẤT CẢ các nút Play/Pause ở thanh Player dưới đáy (cả bản Desktop lẫn Mobile)
  const playerIcons = document.querySelectorAll('.ctrl-btn.play-pause svg');
  playerIcons.forEach(svg => {
    svg.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
  });

  // 2. Đưa toàn bộ icon trên danh sách bài hát về trạng thái Play (tam giác)
  const listIcons = document.querySelectorAll('.song-play-icon svg');
  listIcons.forEach(svg => {
    svg.innerHTML = ICON_PLAY;
  });

  // 3. Nếu đang phát nhạc, tìm bài hát đang "active" và đổi thành Pause (2 vạch)
  if (isPlaying) {
    const activeSongIcon = document.querySelector('.song-card.active .song-play-icon svg');
    if (activeSongIcon) {
      activeSongIcon.innerHTML = ICON_PAUSE;
    }
  }

  document.querySelectorAll('.song-card, .pl-song-row').forEach(item => {
    item.classList.toggle('is-playing', isPlaying && (
      item.classList.contains('active') || item.classList.contains('playing')
    ));
  });
}

function toggleRepeat() {
  repeat = !repeat;
  document.querySelectorAll('.repeat-btn').forEach(button => {
    button.classList.toggle('active', repeat);
    button.setAttribute('aria-pressed', String(repeat));
  });
}

// ── Bài trước / Bài sau ────────────────────────
function prevSong() {
  if (SONGS.length === 0) return;
  const idx = currentIdx <= 0 ? SONGS.length - 1 : currentIdx - 1;
  playSong(idx);
}

function nextSong() {
  if (SONGS.length === 0) return;
  const idx = (currentIdx + 1) % SONGS.length;
  playSong(idx);
}

// ── Seek ──────────────────────────────────────
function seekTo(val) {
  if (!audio.duration) return;
  audio.currentTime = (val / 100) * audio.duration;
}

// ── Volume ────────────────────────────────────
function setVolume(val) {
  audio.volume = val;
}

// ── Format thời gian (giây → m:ss) ───────────
function formatTime(sec) {
  if (isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Events ────────────────────────────────────

// Cập nhật progress bar liên tục
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressBar.value = pct;
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

// Khi load xong metadata
audio.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(audio.duration);
  progressBar.value = 0;
});

// Phát lại bài hiện tại hoặc chuyển sang bài tiếp theo khi kết thúc
audio.addEventListener('ended', () => {
  if (repeat) {
    audio.currentTime = 0;
    progressBar.value = 0;
    currentTimeEl.textContent = '0:00';
    audio.play().catch(e => console.warn('Replay blocked:', e));
  } else {
    nextSong();
  }
});

// Đồng bộ trạng thái play/pause từ audio element
audio.addEventListener('play',  () => {
  isPlaying = true;
  updatePlayIcon();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  isPlaying = false;
  updatePlayIcon();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

// Cập nhật vị trí phát để thanh thông báo hiện đúng tiến trình bài hát
audio.addEventListener('loadedmetadata', () => {
  if ('mediaSession' in navigator && audio.duration) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: 0
      });
    } catch (e) { /* một số trình duyệt không hỗ trợ, bỏ qua */ }
  }
});

// ── Keyboard shortcuts ────────────────────────
document.addEventListener('keydown', (e) => {
  // Bỏ qua nếu đang focus vào input
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowRight') {
    nextSong();
  } else if (e.code === 'ArrowLeft') {
    prevSong();
  }
});
