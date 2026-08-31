/* SEARCH SUGGESTIONS — search.js */

const searchForm = document.querySelector('.search-bar');
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('searchSuggestions');
const suggestionsList = suggestionsEl ? suggestionsEl.querySelector('.suggestions-list') : null;

if (searchForm && searchInput && suggestionsEl) {
  let debounceTimer;
  let requestController;
  let activeIndex = -1;

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const highlight = (value, query) => {
    const safeValue = escapeHtml(value || '');
    const safeQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safeQuery ? safeValue.replace(new RegExp(`(${safeQuery})`, 'gi'), '<mark>$1</mark>') : safeValue;
  };

  const closeSuggestions = () => {
    suggestionsEl.classList.remove('visible');
    suggestionsList.innerHTML = '';
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };

  const updateActiveSuggestion = () => {
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    items.forEach((item, index) => {
      const isActive = index === activeIndex;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    if (activeIndex >= 0 && items[activeIndex]) {
      searchInput.setAttribute('aria-activedescendant', items[activeIndex].id);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else {
      searchInput.removeAttribute('aria-activedescendant');
    }
  };

  const selectSuggestion = (item) => {
    searchInput.value = item.querySelector('.suggestion-title').textContent;
    closeSuggestions();
    searchForm.requestSubmit();
  };

  const renderSuggestions = (suggestions, query) => {
    activeIndex = -1;
    if (suggestions.length === 0) {
      suggestionsList.innerHTML = '<div class="suggestion-empty"><span class="suggestion-empty-icon">⌕</span><span>Không tìm thấy kết quả phù hợp</span></div>';
    } else {
      suggestionsList.innerHTML = suggestions.map((song, index) => `
        <button type="button" class="suggestion-item" role="option" id="suggestion-${song.id}-${index}"
                data-title="${escapeHtml(song.title)}" aria-selected="false">
          ${song.image
            ? `<img src="${escapeHtml(song.image)}" alt="">`
            : '<span class="suggestion-placeholder">🎵</span>'}
          <span class="suggestion-copy">
            <span class="suggestion-title">${highlight(song.title, query)}</span>
            <span class="suggestion-meta">${highlight(song.artist, query)}${song.album ? ` · ${highlight(song.album, query)}` : ''}</span>
          </span>
        </button>
      `).join('');

      suggestionsList.querySelectorAll('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => selectSuggestion(item));
      });
    }

    suggestionsEl.classList.add('visible');
    searchInput.setAttribute('aria-expanded', 'true');
  };

  const fetchSuggestions = async (query) => {
    if (requestController) requestController.abort();
    requestController = new AbortController();
    suggestionsList.innerHTML = '<div class="suggestion-loading"><span></span><span></span><span></span><em>Đang tìm...</em></div>';
    suggestionsEl.classList.add('visible');
    searchInput.setAttribute('aria-expanded', 'true');

    try {
      const response = await fetch(`/api/search-suggestions?q=${encodeURIComponent(query)}`, {
        signal: requestController.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Suggestions request failed: ${response.status}`);
      const data = await response.json();
      if (searchInput.value.trim() === query) renderSuggestions(data.suggestions || [], query);
    } catch (error) {
      if (error.name !== 'AbortError') closeSuggestions();
    }
  };

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearTimeout(debounceTimer);
    closeSuggestions();

    if (!query) return;
    debounceTimer = setTimeout(() => fetchSuggestions(query), 250);
  });

  searchInput.addEventListener('keydown', (event) => {
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    if (!suggestionsEl.classList.contains('visible') || items.length === 0) {
      if (event.key === 'Escape') closeSuggestions();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveSuggestion();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
      updateActiveSuggestion();
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(items[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSuggestions();
    }
  });

  document.addEventListener('click', (event) => {
    if (!searchForm.contains(event.target)) closeSuggestions();
  });
}
