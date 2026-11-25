import {useEffect, useRef} from 'react';

// Each open detail screen owns one browser history entry, so the device back button
// does what the on-screen back button does. On-screen back buttons call goBack().
// onBack returns false when the user cancels (for example unsaved changes); the screen stays.
const layers = [];
let skipped = 0, queued = 0;
const push = () => { if (skipped) queued++; else history.pushState({cukLayer: true}, ''); };

if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
  if (skipped) {
    // The entry of a screen closed by other navigation; pushes made meanwhile go on top now.
    if (--skipped === 0) for (; queued; queued--) history.pushState({cukLayer: true}, '');
    return;
  }
  // A second back before React re-renders goes to the next screen down, not the one already closing.
  const top = layers.findLast(layer => !layer.closing);
  if (!top) return;
  top.closing = true;
  if (top.onBack() === false) { top.closing = false; push(); }
});

export function useBackLayer(active, onBack) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    const layer = {onBack: () => latest.current(), closing: false};
    layers.push(layer); push();
    return () => {
      layers.splice(layers.indexOf(layer), 1);
      // Closed by a menu or other navigation: drop its history entry without running a back handler.
      if (!layer.closing) { skipped++; history.back(); }
    };
  }, [active]);
}

export function goBack() { history.back(); }
