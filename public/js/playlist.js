/* ═══════════════════════════════════════════════════════════════════════
   TÂM MUSIC — PLAYLIST POPUP & MANAGEMENT CONTROLLER (playlist.js v4.0)
   - Add song to playlist popover / bottom sheet
   - Quick create playlist inline
   - Ajax song addition with instant visual feedback
═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let activePopup = null;
  let activeSongId = null;
  let activeSongTitle = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeSingle(str) {
    return String(str || '').replace(/'/g, "\\'");
  }

  // ── MỞ POPUP THÊM VÀO PLAYLIST ─────────────────────────────────
  function togglePlaylistPopup(btn, songId, songTitle) {
    if (activePopup) {
      const isSame = activePopup === btn._popup;
      closePlaylistPopup();
      if (isSame) return;
    }

    activeSongId = songId;
    activeSongTitle = songTitle;

    if (!btn._popup) {
      const popup = document.createElement('div');
      popup.className = 'app-playlist-popover';
      document.body.appendChild(popup);
      btn._popup = popup;
    }

    const popup = btn._popup;
    popup.innerHTML = `
      <div class="popover-header">
        <span class="popover-title">Thêm vào playlist</span>
        <button type="button" class="popover-close-btn" onclick="closePlaylistPopup()">✕</button>
      </div>
      <div class="popover-loading">Đang tải danh sách playlist...</div>
    `;

    popup.classList.add('open');
    activePopup = popup;
    positionPopover(popup, btn);

    fetch('/playlists/api/my')
      .then(res => {
        if (!res.ok) throw new Error('Cần đăng nhập');
        return res.json();
      })
      .then(data => {
        renderPopoverContent(popup, data.playlists || [], songId, songTitle);
      })
      .catch(() => {
        popup.innerHTML = `
          <div class="popover-header">
            <span class="popover-title">Thêm vào playlist</span>
            <button type="button" class="popover-close-btn" onclick="closePlaylistPopup()">✕</button>
          </div>
          <div class="popover-empty">
            <p>Vui lòng đăng nhập để lưu bài hát vào playlist của bạn.</p>
            <a href="/login" class="btn btn-sm btn-primary" style="margin-top:10px;">Đăng nhập ngay</a>
          </div>
        `;
      });
  }
  window.togglePlaylistPopup = togglePlaylistPopup;

  function closePlaylistPopup() {
    if (activePopup) {
      activePopup.classList.remove('open');
      activePopup = null;
    }
  }
  window.closePlaylistPopup = closePlaylistPopup;

  function positionPopover(popup, triggerBtn) {
    if (window.innerWidth <= 768) {
      // Mobile: bottom sheet style
      popup.style.top = '';
      popup.style.left = '';
      return;
    }

    const rect = triggerBtn.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let top = rect.bottom + scrollY + 8;
    let left = rect.left + scrollX - 180;

    if (left < 16) left = 16;
    if (left + 280 > window.innerWidth) {
      left = window.innerWidth - 296;
    }

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  }

  function renderPopoverContent(popup, playlists, songId, songTitle) {
    let listHtml = '';
    if (playlists.length === 0) {
      listHtml = `<div class="popover-empty">Bạn chưa có playlist nào. Hãy tạo playlist mới bên dưới!</div>`;
    } else {
      listHtml = playlists.map(pl => `
        <div class="popover-playlist-item" onclick="addSongToPlaylist(${pl.id}, '${escapeSingle(pl.name)}', ${songId}, '${escapeSingle(songTitle)}', this)">
          <span class="item-icon">🎵</span>
          <div class="item-info">
            <span class="item-name">${escapeHtml(pl.name)}</span>
            <span class="item-meta">${pl.count} bài hát</span>
          </div>
          <span class="item-add-icon">＋</span>
        </div>
      `).join('');
    }

    popup.innerHTML = `
      <div class="popover-header">
        <span class="popover-title">Thêm vào playlist</span>
        <button type="button" class="popover-close-btn" onclick="closePlaylistPopup()">✕</button>
      </div>
      <div class="popover-list-body">
        ${listHtml}
      </div>
      <div class="popover-footer-action">
        <button type="button" class="popover-create-btn" onclick="quickCreatePlaylist(${songId}, '${escapeSingle(songTitle)}')">
          ＋ Tạo playlist mới & thêm vào
        </button>
      </div>
    `;
  }

  // ── THÊM BÀI QUA AJAX ──────────────────────────────────────────
  function addSongToPlaylist(plId, plName, songId, songTitle, itemEl) {
    if (itemEl) {
      itemEl.style.opacity = '0.5';
      itemEl.style.pointerEvents = 'none';
    }

    fetch(`/playlists/${plId}/add-song`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: `songId=${encodeURIComponent(songId)}`
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          if (typeof window.showToast === 'function') {
            window.showToast(`✅ Đã thêm "${songTitle}" vào "${plName}"!`);
          }
          closePlaylistPopup();
        } else {
          if (itemEl) {
            itemEl.style.opacity = '1';
            itemEl.style.pointerEvents = '';
          }
          if (typeof window.showToast === 'function') {
            window.showToast(`⚠️ ${data.message || 'Không thể thêm vào playlist'}`, true);
          }
        }
      })
      .catch(() => {
        if (itemEl) {
          itemEl.style.opacity = '1';
          itemEl.style.pointerEvents = '';
        }
        if (typeof window.showToast === 'function') {
          window.showToast('⚠️ Lỗi kết nối máy chủ', true);
        }
      });
  }
  window.addSongToPlaylist = addSongToPlaylist;

  // ── TẠO PLAYLIST NHANH TỪ POPUP ────────────────────────────────
  function quickCreatePlaylist(songId, songTitle) {
    const name = prompt('Nhập tên cho playlist mới:');
    if (!name || !name.trim()) return;

    fetch('/playlists/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: `name=${encodeURIComponent(name.trim())}`
    })
      .then(res => {
        // Redirection or reload
        if (typeof window.showToast === 'function') {
          window.showToast(`Đang tạo playlist "${name.trim()}"...`);
        }
        window.location.href = res.url || '/playlists';
      })
      .catch(() => {
        window.location.href = '/playlists';
      });
  }
  window.quickCreatePlaylist = quickCreatePlaylist;

  // Quick open from player bar button
  window.openAddToPlaylistFromPlayer = function () {
    const list = window.SONGS || [];
    const currentSong = list[window.currentIdx] || list[0];
    if (!currentSong) {
      if (typeof window.showToast === 'function') {
        window.showToast('Chưa có bài hát nào được chọn.');
      }
      return;
    }

    const btn = document.getElementById('playerAddPlBtn') || document.body;
    togglePlaylistPopup(btn, currentSong.id, currentSong.title);
  };

  // Click outside to dismiss
  document.addEventListener('click', e => {
    if (activePopup && !activePopup.contains(e.target) && !e.target.closest('.card-playlist-btn, .add-btn, .row-action-btn.playlist-btn')) {
      closePlaylistPopup();
    }
  });

})();
