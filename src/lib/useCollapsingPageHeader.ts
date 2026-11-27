import { useEffect, type RefObject } from 'react';

const findScrollParent = (el: HTMLElement): HTMLElement | null => {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
};

// List + detail pages on desktop: the wheel scrolls the page header away first,
// then the panes scroll inside. `hostRef` is a box below the header, full height plus
// the layout scroller's md:pb-4 (the browser leaves that padding out of the scroll range);
// it publishes --pane-offset (how much header is still on screen) so the panes can
// grow as the header leaves and their pinned actions never drop below the fold.
export const useCollapsingPageHeader = (hostRef: RefObject<HTMLElement | null>, minWidth: number) => {
  useEffect(() => {
    const host = hostRef.current;
    const page = host && findScrollParent(host);
    if (!host || !page) return;

    const sync = () => {
      const offset = Math.max(0, host.getBoundingClientRect().top - page.getBoundingClientRect().top);
      host.style.setProperty('--pane-offset', `${offset}px`);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0 || !window.matchMedia(`(min-width: ${minWidth}px)`).matches) return;

      let pageCanMove: boolean;
      if (e.deltaY > 0) {
        pageCanMove = page.scrollTop < page.scrollHeight - page.clientHeight - 1;
      } else {
        // Going back up, whatever the pointer is over finishes scrolling first
        let insideCanMove = false;
        for (let node = e.target as HTMLElement | null; node && node !== host; node = node.parentElement) {
          if (node.scrollTop > 0) insideCanMove = true;
        }
        pageCanMove = page.scrollTop > 0 && !insideCanMove;
      }
      if (!pageCanMove) return;

      e.preventDefault();
      // deltaMode 1 = lines (Firefox). Instant: the page scroller has scroll-smooth.
      page.scrollBy({ top: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, behavior: 'instant' });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(page);
    Array.from(host.parentElement?.children ?? []).forEach((el) => observer.observe(el));
    document.fonts?.ready.then(sync);
    page.addEventListener('scroll', sync, { passive: true });
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      page.removeEventListener('scroll', sync);
      host.removeEventListener('wheel', onWheel);
    };
  }, [hostRef, minWidth]);
};
