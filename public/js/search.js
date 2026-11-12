/* ═══════════════════════════════════════════════════════════════════════
   TÂM MUSIC — SEARCH & AUTOCOMPLETE CONTROLLER (search.js v4.0)
   - Debounced server suggestions
   - Vietnamese diacritic-insensitive matching
   - Keyboard navigation (Arrow keys, Enter, Escape)
   - Global search shortcut (/ or Ctrl+K)
   - Clear input button
═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const suggestionsPopover = document.getElementById('searchSuggestions');
  const suggestionsList = document.getElementById('suggestionsList');
  const searchClearBtn = document.getElementById('searchClearBtn');

  if (!searchInput || !suggestionsPopover) return;

  let debounceTimer = null;
  let abortController = null;
  let activeIndex = -1;

  // ── VIETNAMESE ACCENT REMOVER ──────────────────────────────────
  function stripVietnamese(str) {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const safeText = escapeHtml(text || '');
    const cleanQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const regex = new RegExp(`(${cleanQuery})`, 'gi');
      return safeText.replace(regex, '<mark class="highlight">$1</mark>');
    } catch (e) {
      return safeText;
    }
  }

  function closeSuggestions() {
    suggestionsPopover.classList.remove('visible');
    if (suggestionsList) suggestionsList.innerHTML = '';
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function updateActiveItem() {
    const items = suggestionsPopover.querySelectorAll('.suggestion-row-item');
    items.forEach((item, idx) => {
      const isActive = idx === activeIndex;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    if (activeIndex >= 0 && items[activeIndex]) {
      searchInput.setAttribute('aria-activedescendant', items[activeIndex].id);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else {
      searchInput.removeAttribute('aria-activedescendant');
    }
  }

  function selectItem(item) {
    const title = item.dataset.title || '';
    const songId = item.dataset.id;
    searchInput.value = title;
    closeSuggestions();

    // Check if song is in current window.SONGS array to play immediately
    if (window.SONGS && window.SONGS.length) {
      const songIdx = window.SONGS.findIndex(s => String(s.id) === String(songId));
      if (songIdx !== -1 && typeof window.playSong === 'function') {
        window.playSong(songIdx);
        return;
      }
    }

    if (searchForm) searchForm.submit();
  }

  function renderSuggestions(list, query) {
    activeIndex = -1;
    if (!suggestionsList) return;

    if (!list || list.length === 0) {
      suggestionsList.innerHTML = `
        <div class="suggestion-empty-state">
          <span class="empty-icon">⌕</span>
          <span>Không tìm thấy kết quả phù hợp cho "${escapeHtml(query)}"</span>
        </div>
      `;
    } else {
      suggestionsList.innerHTML = list.map((song, idx) => `
        <div class="suggestion-row-item" role="option" id="suggest-opt-${song.id}-${idx}"
             data-id="${song.id}" data-title="${escapeHtml(song.title)}" aria-selected="false">
          <div class="suggest-thumb">
            ${song.image ? `<img src="${escapeHtml(song.image)}" alt="">` : '<div class="suggest-thumb-placeholder">🎵</div>'}
          </div>
          <div class="suggest-meta">
            <span class="suggest-title">${highlightMatch(song.title, query)}</span>
            <span class="suggest-subtitle">${highlightMatch(song.artist, query)}${song.album ? ' · ' + highlightMatch(song.album, query) : ''}</span>
          </div>
          <button type="button" class="suggest-play-btn" aria-label="Phát ngay">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      `).join('');

      suggestionsList.querySelectorAll('.suggestion-row-item').forEach(item => {
        item.addEventListener('click', () => selectItem(item));
      });
    }

    suggestionsPopover.classList.add('visible');
    searchInput.setAttribute('aria-expanded', 'true');
  }

  async function fetchSuggestions(query) {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    if (suggestionsList) {
      suggestionsList.innerHTML = `
        <div class="suggestion-loading-state">
          <div class="loading-spinner"></div>
          <span>Đang tìm kiếm...</span>
        </div>
      `;
    }
    suggestionsPopover.classList.add('visible');
    searchInput.setAttribute('aria-expanded', 'true');

    try {
      const res = await fetch(`/api/search-suggestions?q=${encodeURIComponent(query)}`, {
        signal: abortController.signal,
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      if (searchInput.value.trim() === query) {
        renderSuggestions(data.suggestions || [], query);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        closeSuggestions();
      }
    }
  }

  // ── INPUT LISTENERS ────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (searchClearBtn) {
      searchClearBtn.style.display = query.length > 0 ? 'flex' : 'none';
    }

    clearTimeout(debounceTimer);
    closeSuggestions();

    if (!query) return;
    debounceTimer = setTimeout(() => fetchSuggestions(query), 220);
  });

  searchInput.addEventListener('keydown', e => {
    const items = suggestionsPopover.querySelectorAll('.suggestion-row-item');
    if (!suggestionsPopover.classList.contains('visible') || items.length === 0) {
      if (e.key === 'Escape') closeSuggestions();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
      updateActiveItem();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        selectItem(items[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSuggestions();
    }
  });

  // Clear button click
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      closeSuggestions();
      searchInput.focus();
    });
  }

  // Global Keyboard shortcut (/ or Ctrl+K)
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Click outside to close
  document.addEventListener('click', e => {
    if (searchForm && !searchForm.contains(e.target)) {
      closeSuggestions();
    }
  });

  // Mobile search tab trigger
  window.focusMobileSearch = function () {
    if (searchInput) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      searchInput.focus();
      searchInput.select();
    }
  };

})();
