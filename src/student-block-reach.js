export function watchNoticeBlocks(container, onReach) {
  const doc = container.ownerDocument;
  const view = doc.defaultView;
  if (!view.IntersectionObserver) return;
  const elements = container.querySelectorAll('[data-block-id]');
  const timers = new Map();
  const reached = new Set();
  function cancel(element) {
    view.clearTimeout(timers.get(element));
    timers.delete(element);
  }
  const observer = new view.IntersectionObserver(entries => {
    for (const { target, intersectionRatio, isIntersecting } of entries) {
      if (doc.hidden || !isIntersecting || intersectionRatio < 0.5) cancel(target);
      else if (!timers.has(target) && !reached.has(target)) {
        timers.set(target, view.setTimeout(() => {
          timers.delete(target);
          if (doc.hidden) return;
          reached.add(target);
          observer.unobserve(target);
          onReach(target.dataset.blockId);
        }, 1000));
      }
    }
  }, { threshold: 0.5 });
  function observeVisiblePage() {
    observer.disconnect();
    for (const element of timers.keys()) cancel(element);
    if (!doc.hidden) elements.forEach(element => {
      if (!reached.has(element)) observer.observe(element);
    });
  }
  observeVisiblePage();
  doc.addEventListener('visibilitychange', observeVisiblePage);
  return () => {
    doc.removeEventListener('visibilitychange', observeVisiblePage);
    observer.disconnect();
    for (const element of timers.keys()) cancel(element);
  };
}
