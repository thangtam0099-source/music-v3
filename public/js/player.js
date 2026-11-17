/* ═══════════════════════════════════════════════════════════════════════
   TÂM MUSIC — MASTER AUDIO ENGINE & APP CONTROLLER (player.js v4.0)
   - Continuous playback across page transitions (SPA / PJAX)
   - Responsive persistent desktop player & mobile mini-player
   - Full-screen Now Playing modal with ambient artwork lighting
   - Queue drawer, Lyrics drawer, Marquee animations
   - MediaSession API, keyboard shortcuts, volume & seek controls
   - Liked songs persistence & Theme management
═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── DOM ELEMENTS ────────────────────────────────────────────────
  const audio = document.getElementById('audioPlayer');
  const playerBar = document.getElementById('playerBar');
  const mobileMiniPlayer = document.getElementById('mobileMiniPlayer');
  const nowPlayingModal = document.getElementById('nowPlayingModal');
  const queueCurrentTrack = document.getElementById('queueCurrentTrack');

  // Desktop Controls
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const progressBar = document.getElementById('progressBar');
  const progressFillTrack = document.getElementById('progressFillTrack');
  const volumeBar = document.getElementById('volumeBar');
  const volumeFillTrack = document.getElementById('volumeFillTrack');
  const volumeIcon = document.getElementById('volumeIcon');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');
  const playerTitle = document.getElementById('playerTitle');
  const playerArtist = document.getElementById('playerArtist');
  const playerCoverWrap = document.getElementById('playerCoverWrap');
  const playerLikeBtn = document.getElementById('playerLikeBtn');

  // Mobile Mini Player
  const miniPlayerTitle = document.getElementById('miniPlayerTitle');
  const miniPlayerArtist = document.getElementById('miniPlayerArtist');
  const miniPlayerCover = document.getElementById('miniPlayerCover');
  const miniPlayIcon = document.getElementById('miniPlayIcon');
  const miniProgressLine = document.getElementById('miniPlayerProgressLine');

  // Modal Controls
  const modalPlayIcon = document.getElementById('modalPlayIcon');
  const modalProgressBar = document.getElementById('modalProgressBar');
  const modalProgressFill = document.getElementById('modalProgressFillTrack');
  const modalCurrentTime = document.getElementById('modalCurrentTime');
  const modalTotalTime = document.getElementById('modalTotalTime');
  const nowPlayingTitle = document.getElementById('nowPlayingTitle');
  const nowPlayingArtist = document.getElementById('nowPlayingArtist');
  const nowPlayingArtCard = document.getElementById('nowPlayingArtCard');
  const nowPlayingBackdrop = document.getElementById('nowPlayingBackdrop');
  const modalLikeBtn = document.getElementById('modalLikeBtn');
  const modalPlayPauseBtn = document.getElementById('modalPlayPauseBtn');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let requestedArtwork;
  let artworkRequest;
  let artworkLayers = [];
  let artworkAnimations = [];
  let nowPlayingTrigger;

  // ── PLAYBACK STATE ──────────────────────────────────────────────
  let currentIdx = -1;
  let isPlaying = false;
  let repeatMode = 0; // 0 = off, 1 = repeat one (bỏ lặp lại toàn bộ)
  let isShuffled = false;
  let previousVolume = 1;
  let isMuted = false;
  let currentTrackData = null;

  // Local likes set
  let likedSongIds = new Set();
  try {
    const savedLikes = JSON.parse(localStorage.getItem('tam_music_likes') || '[]');
    if (Array.isArray(savedLikes)) likedSongIds = new Set(savedLikes.map(Number));
  } catch (e) {
    likedSongIds = new Set();
  }

  // Icons
  const SVG_PLAY = '<path d="M8 5v14l11-7z"/>';
  const SVG_PAUSE = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

  // ── THEME CONTROLLER ───────────────────────────────────────────
  function initTheme() {
    const savedTheme = localStorage.getItem('tam_music_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(currentTheme);

    const toggleBtn = document.getElementById('themeToggleBtn');
    const quickBtn = document.getElementById('quickThemeBtn');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }
    if (quickBtn) {
      quickBtn.addEventListener('click', toggleTheme);
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tam_music_theme', theme);

    const stateText = document.getElementById('themeStateText');
    if (stateText) {
      stateText.textContent = theme === 'light' ? 'Chế độ sáng' : 'Chế độ tối';
    }

    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0b0f17');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  // ── TEXT DISPLAY HELPER ────────────────────────────────────────
  function refreshAllMarquees() {
    // Native CSS ellipsis handles responsive text overflow seamlessly
  }

  // ── TOAST NOTIFICATION SYSTEM ──────────────────────────────────
  function showToast(message, isError = false) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `app-toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.innerHTML = `
      <span class="toast-icon">${isError ? '⚠️' : '✓'}</span>
      <span class="toast-msg">${message}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }
  window.showToast = showToast;

  // ── LIKED SONGS CONTROLLER ─────────────────────────────────────
  function saveLikes() {
    try {
      localStorage.setItem('tam_music_likes', JSON.stringify(Array.from(likedSongIds)));
    } catch (e) {}
    updateLikedBadge();
    syncLikeButtons();
  }

  function updateLikedBadge() {
    const badge = document.getElementById('likedCountBadge');
    if (badge) badge.textContent = likedSongIds.size;
  }

  function toggleCardLike(btn, songId) {
    const id = Number(songId);
    if (likedSongIds.has(id)) {
      likedSongIds.delete(id);
      showToast('Đã xóa khỏi bài hát yêu thích');
    } else {
      likedSongIds.add(id);
      showToast('❤️ Đã thêm vào bài hát yêu thích');
      btn.classList.add('heart-pop');
      setTimeout(() => btn.classList.remove('heart-pop'), 400);
    }
    saveLikes();
  }
  window.toggleCardLike = toggleCardLike;

  function toggleCurrentSongLike() {
    if (!currentTrackData) return;
    const id = Number(currentTrackData.id);
    if (likedSongIds.has(id)) {
      likedSongIds.delete(id);
      showToast('Đã xóa khỏi bài hát yêu thích');
    } else {
      likedSongIds.add(id);
      showToast('❤️ Đã thêm vào bài hát yêu thích');
    }
    saveLikes();
  }
  window.toggleCurrentSongLike = toggleCurrentSongLike;

  function syncLikeButtons() {
    const isCurrentLiked = currentTrackData && likedSongIds.has(Number(currentTrackData.id));

    if (playerLikeBtn) {
      playerLikeBtn.classList.toggle('active', !!isCurrentLiked);
      playerLikeBtn.setAttribute('aria-pressed', String(!!isCurrentLiked));
    }
    if (modalLikeBtn) {
      modalLikeBtn.classList.toggle('active', !!isCurrentLiked);
      modalLikeBtn.setAttribute('aria-pressed', String(!!isCurrentLiked));
    }

    document.querySelectorAll('.card-like-btn, .like-btn').forEach(btn => {
      const card = btn.closest('[data-song-id]');
      if (card) {
        const id = Number(card.dataset.songId);
        btn.classList.toggle('active', likedSongIds.has(id));
      }
    });
  }

  function filterLikedSongs() {
    navigateToUrl('/favorites');
  }
  window.filterLikedSongs = filterLikedSongs;

  // ── CORE PLAYBACK LOGIC ────────────────────────────────────────
  function playSong(idx) {
    const songList = window.SONGS || [];
    if (!songList.length || idx < 0 || idx >= songList.length) return;

    currentIdx = idx;
    const song = songList[idx];
    currentTrackData = song;

    // Load audio source
    if (audio.src !== song.src) {
      audio.src = song.src;
      audio.load();
    }

    audio.play().then(() => {
      isPlaying = true;
      updatePlayIcons();
    }).catch(err => {
      console.warn('[Audio] Autoplay blocked or load failed:', err);
      isPlaying = false;
      updatePlayIcons();
    });

    // Update Player Bar visibility
    if (playerBar) playerBar.classList.add('visible');
    if (mobileMiniPlayer) mobileMiniPlayer.classList.add('visible');

    // Update Metadata
    updatePlayerMeta(song);
    updateCover(song.image);
    syncActiveCards(idx);
    syncLikeButtons();
    updateMediaSession(song);
    updateQueueDrawer();

    document.title = `▶ ${song.title} — ${song.artist} | Tâm Music`;
  }
  window.playSong = playSong;

  function togglePlay() {
    const songList = window.SONGS || [];
    if (currentIdx === -1 && songList.length > 0) {
      playSong(0);
      return;
    }

    if (!audio.src && songList.length > 0) {
      playSong(currentIdx >= 0 ? currentIdx : 0);
      return;
    }

    if (audio.paused) {
      audio.play().then(() => {
        isPlaying = true;
        updatePlayIcons();
      }).catch(e => console.warn(e));
    } else {
      audio.pause();
      isPlaying = false;
      updatePlayIcons();
    }
  }
  window.togglePlay = togglePlay;

  function prevSong() {
    const songList = window.SONGS || [];
    if (!songList.length) return;

    // If played more than 3 seconds, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const nextIdx = currentIdx <= 0 ? songList.length - 1 : currentIdx - 1;
    playSong(nextIdx);
  }
  window.prevSong = prevSong;

  function nextSong() {
    const songList = window.SONGS || [];
    if (!songList.length) return;

    let nextIdx = 0;
    if (isShuffled) {
      nextIdx = Math.floor(Math.random() * songList.length);
      if (nextIdx === currentIdx && songList.length > 1) {
        nextIdx = (nextIdx + 1) % songList.length;
      }
    } else {
      nextIdx = (currentIdx + 1) % songList.length;
    }

    playSong(nextIdx);
  }
  window.nextSong = nextSong;

  function playAll() {
    const songList = window.SONGS || [];
    if (!songList.length) {
      showToast('Danh sách bài hát trống', true);
      return;
    }
    if (isShuffled) {
      isShuffled = false;
      const shuffleBtn = document.getElementById('shuffleBtn');
      const modalShuffleBtn = document.getElementById('modalShuffleBtn');
      [shuffleBtn, modalShuffleBtn].forEach(btn => {
        if (btn) {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }
    playSong(0);
  }
  window.playAll = playAll;

  function shufflePlay() {
    const songList = window.SONGS || [];
    if (!songList.length) {
      showToast('Danh sách bài hát trống', true);
      return;
    }
    if (!isShuffled) {
      isShuffled = true;
      const shuffleBtn = document.getElementById('shuffleBtn');
      const modalShuffleBtn = document.getElementById('modalShuffleBtn');
      [shuffleBtn, modalShuffleBtn].forEach(btn => {
        if (btn) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        }
      });
    }
    const randIdx = Math.floor(Math.random() * songList.length);
    playSong(randIdx);
  }
  window.shufflePlay = shufflePlay;

  function seekTo(val) {
    if (!audio.duration) return;
    const time = (val / 100) * audio.duration;
    audio.currentTime = time;
    updateProgressUI(time, audio.duration);
  }
  window.seekTo = seekTo;

  function setVolume(val) {
    const num = Math.max(0, Math.min(1, parseFloat(val)));
    audio.volume = num;
    if (num > 0) {
      isMuted = false;
      previousVolume = num;
    }
    updateVolumeUI(num);
  }
  window.setVolume = setVolume;

  function toggleMute() {
    if (isMuted || audio.volume === 0) {
      isMuted = false;
      audio.volume = previousVolume > 0 ? previousVolume : 0.8;
    } else {
      previousVolume = audio.volume;
      isMuted = true;
      audio.volume = 0;
    }
    updateVolumeUI(audio.volume);
  }
  window.toggleMute = toggleMute;

  function toggleRepeat() {
    repeatMode = repeatMode === 0 ? 1 : 0; // 0: off, 1: repeat current song

    const desktopBtn = document.getElementById('repeatBtn');
    const modalBtn = document.getElementById('modalRepeatBtn');
    const badge = document.getElementById('repeatOneBadge');
    const modalBadge = document.getElementById('modalRepeatOneBadge');

    [desktopBtn, modalBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('active', repeatMode === 1);
      btn.classList.toggle('repeat-one', repeatMode === 1);
      btn.setAttribute('aria-pressed', String(repeatMode === 1));
    });

    if (badge) {
      badge.style.display = repeatMode === 1 ? 'inline-flex' : 'none';
    }
    if (modalBadge) {
      modalBadge.style.display = repeatMode === 1 ? 'inline-flex' : 'none';
    }

    showToast(repeatMode === 1 ? '🔁 Lặp lại bài hát hiện tại' : '➡️ Tắt lặp lại');
  }
  window.toggleRepeat = toggleRepeat;

  function toggleShuffle() {
    isShuffled = !isShuffled;
    const shuffleBtn = document.getElementById('shuffleBtn');
    const modalShuffleBtn = document.getElementById('modalShuffleBtn');

    [shuffleBtn, modalShuffleBtn].forEach(btn => {
      if (btn) {
        btn.classList.toggle('active', isShuffled);
        btn.setAttribute('aria-pressed', String(isShuffled));
      }
    });

    showToast(isShuffled ? '🔀 Đã bật phát ngẫu nhiên' : '➡️ Phát tuần tự');
  }
  window.toggleShuffle = toggleShuffle;

  // ── UI SYNCHRONIZATION HELPERS ──────────────────────────────────
  function updatePlayIcons() {
    const icon = isPlaying ? SVG_PAUSE : SVG_PLAY;
    queueCurrentTrack?.classList.toggle('is-playing', isPlaying && !!currentTrackData);

    if (playIcon) playIcon.innerHTML = icon;
    if (miniPlayIcon) miniPlayIcon.innerHTML = icon;
    if (modalPlayIcon) modalPlayIcon.innerHTML = icon;
    if (modalPlayPauseBtn) {
      modalPlayPauseBtn.setAttribute('aria-label', isPlaying ? 'Tạm dừng' : 'Phát nhạc');
    }

    // List and Grid Card icons
    document.querySelectorAll('.song-interactive-card, .track-list-row').forEach(card => {
      const cardIdx = Number(card.dataset.idx);
      const isCurrent = cardIdx === currentIdx;
      card.classList.toggle('is-playing', isCurrent && isPlaying);
      card.classList.toggle('active', isCurrent);
    });
  }

  function syncActiveCards(idx) {
    document.querySelectorAll('.song-interactive-card, .track-list-row').forEach(card => {
      const cardIdx = Number(card.dataset.idx);
      card.classList.toggle('active', cardIdx === idx);
    });
  }

  function updatePlayerMeta(song) {
    if (!song) return;
    const title = song.title || '—';
    const artist = song.artist || '—';

    // Desktop Player Bar
    if (playerTitle) {
      playerTitle.textContent = title;
      playerTitle.setAttribute('title', title);
    }
    if (playerArtist) {
      playerArtist.textContent = artist;
      playerArtist.setAttribute('title', artist);
    }

    // Mobile Mini Player
    if (miniPlayerTitle) {
      miniPlayerTitle.textContent = title;
      miniPlayerTitle.setAttribute('title', title);
    }
    if (miniPlayerArtist) {
      miniPlayerArtist.textContent = artist;
      miniPlayerArtist.setAttribute('title', artist);
    }

    // Expanded Now Playing Modal
    if (nowPlayingTitle) {
      nowPlayingTitle.textContent = title;
      nowPlayingTitle.setAttribute('title', title);
    }
    if (nowPlayingArtist) {
      nowPlayingArtist.textContent = artist;
      nowPlayingArtist.setAttribute('title', artist);
    }
  }

  function updateCover(imgSrc) {
    const markup = imgSrc
      ? `<img class="player-cover-img" src="${imgSrc}" alt="Ảnh bài hát">`
      : `<div class="player-cover-placeholder">🎵</div>`;

    if (playerCoverWrap) playerCoverWrap.innerHTML = markup;
    if (miniPlayerCover) miniPlayerCover.innerHTML = markup;

    if (nowPlayingModal?.classList.contains('open')) updateNowPlayingArtwork(imgSrc);
  }

  function finishArtworkTransition() {
    artworkAnimations.forEach(animation => animation.cancel());
    artworkAnimations = [];
    [nowPlayingArtCard, nowPlayingBackdrop].forEach(container => {
      container.querySelectorAll('img').forEach(image => {
        if (!artworkLayers.includes(image)) image.remove();
      });
    });
  }

  function renderNowPlayingArtwork(cover) {
    finishArtworkTransition();
    const previousLayers = artworkLayers;
    artworkLayers = [];
    nowPlayingModal.style.removeProperty('--np-accent');
    nowPlayingModal.style.removeProperty('--np-haze');

    if (cover) {
      cover.className = 'now-playing-large-art';
      cover.alt = 'Bìa bài hát';
      const background = cover.cloneNode();
      background.className = '';
      background.alt = '';
      nowPlayingArtCard.append(cover);
      nowPlayingBackdrop.append(background);
      artworkLayers = [cover, background];
      updateArtworkAccent(cover);
    }

    if (reducedMotion.matches) {
      previousLayers.forEach(layer => layer.remove());
      return;
    }

    const options = { duration: 280, easing: 'ease-out' };
    artworkAnimations = previousLayers.map((layer, index) => {
      const animation = layer.animate(
        [{ opacity: index === 0 ? 1 : 0.78 }, { opacity: 0 }],
        { ...options, fill: 'forwards' }
      );
      animation.onfinish = () => {
        layer.remove();
        animation.cancel();
      };
      return animation;
    });
    artworkLayers.forEach((layer, index) => {
      const frames = index === 0
        ? [{ opacity: 0, transform: 'scale(1.035)' }, { opacity: 1, transform: 'scale(1)' }]
        : [{ opacity: 0 }, { opacity: 0.78 }];
      artworkAnimations.push(layer.animate(frames, options));
    });
  }

  function updateArtworkAccent(image) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 12;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    try {
      context.drawImage(image, 0, 0, 12, 12);
      const pixels = context.getImageData(0, 0, 12, 12).data;
      let red = 0, green = 0, blue = 0, total = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const spread = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
          - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
        const weight = spread * pixels[i + 3];
        red += pixels[i] * weight;
        green += pixels[i + 1] * weight;
        blue += pixels[i + 2] * weight;
        total += weight;
      }
      if (!total) return;
      const color = [red, green, blue].map(channel => Math.round(channel / total)).join(' ');
      nowPlayingModal.style.setProperty('--np-accent', `color-mix(in srgb, rgb(${color}) 32%, #fff4e6)`);
      nowPlayingModal.style.setProperty('--np-haze', `color-mix(in srgb, rgb(${color}) 66%, #847762)`);
    } catch {
      // Artwork without CORS permission still supplies the backdrop.
    }
  }

  function updateNowPlayingArtwork(src) {
    const url = src || '';
    if (url === requestedArtwork) return;
    requestedArtwork = url;
    if (artworkRequest) artworkRequest.abort();
    artworkRequest = null;
    if (!url) {
      renderNowPlayingArtwork(null);
      return;
    }

    const request = new AbortController();
    artworkRequest = request;
    const load = useCors => {
      const cover = new Image();
      cover.decoding = 'async';
      if (useCors) cover.crossOrigin = 'anonymous';
      cover.addEventListener('load', () => {
        artworkRequest = null;
        renderNowPlayingArtwork(cover);
      }, { once: true, signal: request.signal });
      cover.addEventListener('error', () => {
        if (useCors) {
          load(false);
        } else {
          artworkRequest = null;
          renderNowPlayingArtwork(null);
        }
      }, { once: true, signal: request.signal });
      cover.src = url;
    };
    const isRemote = /^https?:\/\/|^\/\//i.test(url)
      && URL.canParse(url, location.href)
      && new URL(url, location.href).origin !== location.origin;
    load(isRemote);
  }

  function updateProgressUI(currentTime, duration) {
    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Desktop
    if (progressBar) progressBar.value = percent;
    if (progressFillTrack) progressFillTrack.style.width = `${percent}%`;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);

    // Mobile Mini
    if (miniProgressLine) miniProgressLine.style.width = `${percent}%`;

    // Modal
    if (modalProgressBar) modalProgressBar.value = percent;
    if (modalProgressFill) modalProgressFill.style.width = `${percent}%`;
    if (modalCurrentTime) modalCurrentTime.textContent = formatTime(currentTime);
    if (modalTotalTime) modalTotalTime.textContent = formatTime(duration);
  }

  function updateVolumeUI(val) {
    if (volumeBar) volumeBar.value = val;
    if (volumeFillTrack) volumeFillTrack.style.width = `${val * 100}%`;

    if (volumeIcon) {
      if (val === 0 || isMuted) {
        volumeIcon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        `;
      } else if (val < 0.5) {
        volumeIcon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        `;
      } else {
        volumeIcon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        `;
      }
    }
  }

  function formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── MEDIASESSION API (LOCK SCREEN & SYSTEM CONTROLS) ────────────
  function updateMediaSession(song) {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || 'Tâm Music',
        artist: song.artist || '',
        album: song.album || 'Tâm Music Streaming',
        artwork: song.image ? [
          { src: song.image, sizes: '96x96', type: 'image/jpeg' },
          { src: song.image, sizes: '192x192', type: 'image/jpeg' },
          { src: song.image, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });
    } catch (e) {}
  }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextSong());
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (details.seekTime != null && audio.duration) {
          audio.currentTime = details.seekTime;
        }
      });
    } catch (e) {}
  }

  // ── AUDIO ELEMENT EVENTS ───────────────────────────────────────
  audio.addEventListener('timeupdate', () => {
    updateProgressUI(audio.currentTime, audio.duration);
  });

  audio.addEventListener('loadedmetadata', () => {
    updateProgressUI(0, audio.duration);
    if ('mediaSession' in navigator && audio.duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: 0
        });
      } catch (e) {}
    }
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    updatePlayIcons();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    updatePlayIcons();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });

  audio.addEventListener('ended', () => {
    if (repeatMode === 1) {
      // Lặp lại bài hát hiện tại
      audio.currentTime = 0;
      audio.play().catch(e => console.warn(e));
    } else {
      // Off: phát tiếp nếu chưa đến cuối danh sách (không lặp lại toàn bộ)
      const songList = window.SONGS || [];
      if (currentIdx < songList.length - 1) {
        nextSong();
      } else {
        isPlaying = false;
        updatePlayIcons();
      }
    }
  });

  audio.addEventListener('error', e => {
    console.warn('[Audio] Source playback error:', e);
    showToast('⚠️ Không thể phát file nhạc này. Đang chuyển bài tiếp theo...', true);
    setTimeout(() => nextSong(), 1500);
  });

  // ── MODAL & DRAWERS CONTROLS ───────────────────────────────────
  function openNowPlayingModal() {
    if (!nowPlayingModal || nowPlayingModal.classList.contains('open')) return;
    nowPlayingTrigger = document.activeElement;
    nowPlayingModal.classList.add('open');
    document.body.classList.add('modal-open');
    updateNowPlayingArtwork(currentTrackData?.image);
    nowPlayingModal.querySelector('.now-playing-dismiss-btn').focus({ preventScroll: true });
  }
  window.openNowPlayingModal = openNowPlayingModal;

  function closeNowPlayingModal() {
    if (!nowPlayingModal?.classList.contains('open')) return;
    nowPlayingModal.classList.remove('open');
    document.body.classList.remove('modal-open');
    if (artworkRequest) {
      artworkRequest.abort();
      artworkRequest = null;
      requestedArtwork = undefined;
    }
    finishArtworkTransition();
    window.closePlaylistPopup?.();
    nowPlayingTrigger?.focus({ preventScroll: true });
    nowPlayingTrigger = null;
  }
  window.closeNowPlayingModal = closeNowPlayingModal;

  window.openNowPlayingPlaylist = function (trigger) {
    window.openAddToPlaylistFromPlayer?.(trigger, currentTrackData);
  };

  function toggleQueueDrawer() {
    const drawer = document.getElementById('queueDrawer');
    const backdrop = document.getElementById('drawerBackdrop');

    if (drawer) {
      const isOpen = drawer.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('open', isOpen);
      if (isOpen) updateQueueDrawer();
    }
  }
  window.toggleQueueDrawer = toggleQueueDrawer;

  function closeQueueDrawer() {
    const drawer = document.getElementById('queueDrawer');
    if (drawer) drawer.classList.remove('open');
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.classList.remove('open');
  }
  window.closeQueueDrawer = closeQueueDrawer;

  function closeAllDrawers() {
    closeQueueDrawer();
  }
  window.closeAllDrawers = closeAllDrawers;

  function updateQueueDrawer() {
    const list = window.SONGS || [];
    const container = document.getElementById('queueListContainer');
    const countEl = document.getElementById('queueCount');
    const currTitle = document.getElementById('queueCurrentTitle');
    const currArtist = document.getElementById('queueCurrentArtist');

    if (countEl) countEl.textContent = `${list.length} bài hát`;

    if (currTitle) {
      currTitle.textContent = currentTrackData ? currentTrackData.title || '—' : 'Chưa có bài hát đang phát';
      currTitle.title = currentTrackData?.title || '';
    }
    if (currArtist) {
      currArtist.textContent = currentTrackData?.artist || '';
      currArtist.title = currArtist.textContent;
    }

    if (!container) return;

    if (!list.length) {
      container.innerHTML = '<div class="queue-empty">Danh sách phát trống</div>';
      return;
    }

    container.innerHTML = list.map((song, idx) => `
      <div class="queue-item-row ${idx === currentIdx ? 'active' : ''}" onclick="playSong(${idx})">
        <span class="queue-item-num">${idx + 1}</span>
        <div class="queue-item-art">
          ${song.image ? `<img src="${song.image}" alt="">` : '🎵'}
        </div>
        <div class="queue-item-details">
          <span class="queue-item-title">${song.title}</span>
          <span class="queue-item-artist">${song.artist}</span>
        </div>
        ${idx === currentIdx ? '<span class="queue-active-dot">●</span>' : ''}
      </div>
    `).join('');
  }

  // ── KEYBOARD SHORTCUTS ─────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.code === 'Escape' && nowPlayingModal?.classList.contains('open')) {
      const popup = document.querySelector('.now-playing-playlist.open');
      if (popup) {
        window.closePlaylistPopup?.();
        nowPlayingModal.querySelector('.add-btn').focus();
      } else if (document.getElementById('queueDrawer')?.classList.contains('open')) {
        closeQueueDrawer();
      } else {
        closeNowPlayingModal();
      }
      return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (e.code === 'Space') {
      if (e.target.closest('#nowPlayingModal button')) return;
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      nextSong();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      prevSong();
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'KeyL') {
      toggleCurrentSongLike();
    } else if (e.code === 'Escape') {
      closeNowPlayingModal();
      closeAllDrawers();
    }
  });

  // ── UNINTERRUPTED AUDIO SPA / PJAX NAVIGATION ──────────────────
  function setupSpaNavigation() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      // Only handle internal app navigation
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      // Let auth and admin routes navigate normally
      if (
        url.pathname.startsWith('/admin') ||
        url.pathname === '/login' ||
        url.pathname === '/register' ||
        url.pathname === '/logout'
      ) {
        return;
      }

      e.preventDefault();
      navigateToUrl(url.pathname + url.search);
    });

    window.addEventListener('popstate', e => {
      loadPageContent(window.location.pathname + window.location.search, false);
    });
  }

  function navigateToUrl(path) {
    window.history.pushState(null, '', path);
    loadPageContent(path, true);
  }

  async function loadPageContent(urlPath, scrollToTop) {
    try {
      const resp = await fetch(urlPath, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!resp.ok) {
        window.location.href = urlPath;
        return;
      }

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const newMain = doc.querySelector('#mainContent');
      const currentMain = document.querySelector('#mainContent');

      if (newMain && currentMain) {
        currentMain.innerHTML = newMain.innerHTML;
        document.title = doc.title;

        // Extract new SONGS array if provided
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(s => {
          if (s.textContent.includes('window.SONGS =')) {
            try {
              eval(s.textContent);
            } catch (err) {}
          }
        });

        // Update active navigation links
        updateNavPills(urlPath);
        syncLikeButtons();
        syncActiveCards(currentIdx);
        refreshAllMarquees();

        if (scrollToTop) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        window.location.href = urlPath;
      }
    } catch (err) {
      window.location.href = urlPath;
    }
  }

  function updateNavPills(path) {
    const pathname = path.split('?')[0];

    document.querySelectorAll('[data-nav]').forEach(el => {
      const navTarget = el.dataset.nav;
      let isActive = false;
      if (navTarget === 'home' && pathname === '/') isActive = true;
      else if (navTarget === 'albums' && pathname.startsWith('/albums')) isActive = true;
      else if (navTarget === 'playlists' && pathname.startsWith('/playlists')) isActive = true;

      el.classList.toggle('active', isActive);
    });
  }

  // ── DYNAMIC TIME-OF-DAY GREETING ───────────────────────────────
  function updateTimeGreeting() {
    const el = document.getElementById('timeGreeting');
    if (!el) return;

    const hour = new Date().getHours();
    let greeting = 'Xin chào';
    if (hour >= 5 && hour < 11) greeting = 'Chào buổi sáng';
    else if (hour >= 11 && hour < 14) greeting = 'Chào buổi trưa';
    else if (hour >= 14 && hour < 18) greeting = 'Chào buổi chiều';
    else greeting = 'Chào buổi tối';

    el.textContent = greeting;
  }

  // ── VIEW MODE SWITCHER (GRID VS LIST) ──────────────────────────
  function switchViewMode(mode) {
    const container = document.getElementById('songsContainer');
    const gridBtn = document.getElementById('viewModeGridBtn');
    const listBtn = document.getElementById('viewModeListBtn');

    if (!container) return;

    if (mode === 'list') {
      container.classList.remove('view-grid');
      container.classList.add('view-list');
      if (gridBtn) gridBtn.classList.remove('active');
      if (listBtn) listBtn.classList.add('active');
      localStorage.setItem('tam_music_view', 'list');
    } else {
      container.classList.remove('view-list');
      container.classList.add('view-grid');
      if (gridBtn) gridBtn.classList.add('active');
      if (listBtn) listBtn.classList.remove('active');
      localStorage.setItem('tam_music_view', 'grid');
    }
  }
  window.switchViewMode = switchViewMode;

  // ── SIDEBAR DRAWER CONTROLLER ──────────────────────────────────
  function initSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const openBtn = document.getElementById('sidebarOpenBtn');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const backdrop = document.getElementById('sidebarBackdrop');

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    }

    if (openBtn) openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
  }

  // ── USER DROPDOWN CONTROLLER ───────────────────────────────────
  function initUserMenu() {
    const userBtn = document.getElementById('headerUserBtn');
    const userDropdown = document.getElementById('headerUserDropdown');

    if (userBtn && userDropdown) {
      userBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = userDropdown.classList.toggle('open');
        userBtn.setAttribute('aria-expanded', String(isOpen));
      });

      document.addEventListener('click', e => {
        if (!userBtn.contains(e.target) && !userDropdown.contains(e.target)) {
          userDropdown.classList.remove('open');
          userBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  // ── ON INITIAL LOAD ────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSidebar();
    initUserMenu();
    setupSpaNavigation();
    updateTimeGreeting();
    updateLikedBadge();
    syncLikeButtons();

    // Restore user view preference (default: 'list')
    const savedView = localStorage.getItem('tam_music_view');
    if (savedView === 'grid') {
      switchViewMode('grid');
    } else {
      switchViewMode('list');
    }
  });

})();
