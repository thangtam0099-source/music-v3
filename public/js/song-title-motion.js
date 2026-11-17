(() => {
  const titleSelector = [
    '.song-card-name', '.hot-card-title', '.row-title', '.candidate-title',
    '.suggest-title', '.player-track-title', '.mini-player-title',
    '.now-playing-title', '#queueCurrentTitle', '.queue-item-title'
  ].join(', ');
  const contentClass = 'song-title-text';
  const resizeObserver = new ResizeObserver(entries => {
    for (const { target } of entries) {
      const title = target.classList.contains(contentClass) ? target.parentElement : target;
      const content = title?.firstElementChild;
      if (!content?.classList.contains(contentClass)) continue;

      const distance = Math.ceil(content.getBoundingClientRect().width - title.clientWidth);
      title.classList.toggle('song-title-overflowing', title.clientWidth > 0 && distance > 1);
      title.style.setProperty('--title-travel', `${-distance}px`);
      title.style.setProperty('--title-duration', `${Math.max(4, distance / 36 + 2)}s`);
    }
  });

  function observeTitle(title) {
    const current = title.firstElementChild;
    if (title.childNodes.length === 1 && current?.classList.contains(contentClass)) {
      resizeObserver.observe(title);
      resizeObserver.observe(current);
      return;
    }

    const content = document.createElement('span');
    content.className = contentClass;
    content.append(...title.childNodes);
    title.append(content);
    title.classList.add('song-title-viewport');
    resizeObserver.observe(title);
    resizeObserver.observe(content);
  }

  function visitTitles(node, visit) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(titleSelector)) visit(node);
    node.querySelectorAll(titleSelector).forEach(visit);
  }

  visitTitles(document.body, observeTitle);
  new MutationObserver(records => {
    for (const { target, addedNodes, removedNodes } of records) {
      for (const node of removedNodes) {
        if (node.isConnected || node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.classList.contains(contentClass)) resizeObserver.unobserve(node);
        visitTitles(node, title => {
          resizeObserver.unobserve(title);
          if (title.firstElementChild) resizeObserver.unobserve(title.firstElementChild);
        });
      }
      if (target.matches(titleSelector)) observeTitle(target);
      for (const node of addedNodes) {
        if (node.isConnected) visitTitles(node, observeTitle);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
