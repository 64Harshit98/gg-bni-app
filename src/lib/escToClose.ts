// Esc closes the popup on top — any modal, sheet, drawer or dialog that has a close button.
//
// One window listener for the whole app (installed in main.tsx), so no popup needs
// its own code. On Esc it finds the topmost open popup and presses its close button:
//   1. a button marked `data-esc-close`
//   2. a button labelled "Close" / "Dismiss" (aria-label or title)
//   3. an icon-only ✕ button in the popup's header (never one inside a list row,
//      where ✕ usually means "remove this line")
//   4. a button whose text is exactly Close / Cancel / ✕
// Popups that already close themselves on Esc keep doing that: if anything on the
// page reacts to the key (Esc handled, DOM changed, preventDefault, stopPropagation),
// this does nothing. No close button found → nothing happens.

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .fixed.inset-0';
const BUTTON_SELECTOR = 'button, [role="button"]';
const HEADER_ZONE_PX = 80;

const CLOSE_LABEL = /^(close|dismiss)\b/i;
const CLOSE_TEXT = /^(close|cancel|×|✕|✖|x)$/i;

/** True for a button label/text that means "close this popup". */
export const isCloseLabel = (label: string | null | undefined): boolean => CLOSE_LABEL.test((label || '').trim());
export const isCloseText = (text: string | null | undefined): boolean => CLOSE_TEXT.test((text || '').replace(/\s+/g, ' ').trim());

const isVisible = (el: Element): boolean => {
    if (el.getClientRects().length === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.opacity !== '0' && s.display !== 'none';
};

const isUsable = (el: Element): boolean =>
    isVisible(el) && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';

const zOf = (el: Element): number => {
    for (let n: Element | null = el; n; n = n.parentElement) {
        const z = parseInt(getComputedStyle(n).zIndex, 10);
        if (Number.isFinite(z)) return z;
    }
    return 0;
};

/** The open popup on top: highest z-index, then the one later in the page (opened last). */
const topmostOverlay = (): Element | null => {
    const open = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).filter(isVisible);
    if (open.length === 0) return null;
    // Nested matches (backdrop + its dialog panel): keep the innermost, it holds the buttons
    const leaves = open.filter(el => !open.some(other => other !== el && el.contains(other)));
    let best = leaves[0];
    let bestZ = zOf(best);
    for (const el of leaves.slice(1)) {
        const z = zOf(el);
        if (z > bestZ || (z === bestZ && (best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) {
            best = el;
            bestZ = z;
        }
    }
    return best;
};

// ✕ icons: lucide (class lucide-x), react-icons FiX (two diagonal lines) or a drawn "M6 18L18 6M6 6l12 12" path
const hasXIcon = (btn: Element): boolean => {
    const svg = btn.querySelector('svg');
    if (!svg) return false;
    if (svg.classList.contains('lucide-x') || svg.classList.contains('lucide-x-icon')) return true;
    const lines = svg.querySelectorAll('line');
    if (lines.length === 2) {
        const pts = Array.from(lines).map(l => ['x1', 'y1', 'x2', 'y2'].map(a => l.getAttribute(a)).join(','));
        if (pts.includes('18,6,6,18') && pts.includes('6,6,18,18')) return true;
    }
    const d = Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d') || '').join(' ');
    return isXPath(d);
};

// The numbers of the usual ✕ paths: "M6 18L18 6M6 6l12 12", "M18 6 6 18M6 6l12 12", "M18 6L6 18M6 6L18 18"
const X_PATHS = new Set(['6,18,18,6,6,6,12,12', '18,6,6,18,6,6,12,12', '18,6,6,18,6,6,18,18', '6,6,18,18,6,18,18,6']);
/** True when an SVG path draws a plain ✕. */
export const isXPath = (d: string): boolean => X_PATHS.has((d.match(/-?\d*\.?\d+/g) || []).map(Number).join(','));

/** The block the button sits in, right under the popup (its panel), to measure "is it in the header". */
const panelTop = (overlay: Element, btn: Element): number => {
    const r = overlay.getBoundingClientRect();
    if (r.height < window.innerHeight - 1) return r.top; // the overlay itself is the panel
    let n: Element = btn;
    while (n.parentElement && n.parentElement !== overlay) n = n.parentElement;
    return n.getBoundingClientRect().top;
};

/** The popup's close button, or null when it has none. */
export const findCloseButton = (overlay: Element): HTMLElement | null => {
    const buttons = Array.from(overlay.querySelectorAll<HTMLElement>(BUTTON_SELECTOR)).filter(isUsable);

    const marked = buttons.find(b => b.hasAttribute('data-esc-close'));
    if (marked) return marked;

    const labelled = buttons.find(b => isCloseLabel(b.getAttribute('aria-label')) || isCloseLabel(b.getAttribute('title')));
    if (labelled) return labelled;

    const headerX = buttons.find(b =>
        !(b.textContent || '').trim() &&
        hasXIcon(b) &&
        !b.closest('li, tr, [role="row"], [role="listitem"]') &&
        b.getBoundingClientRect().top - panelTop(overlay, b) <= HEADER_ZONE_PX
    );
    if (headerX) return headerX;

    // Text buttons: Close before Cancel
    const byText = buttons.filter(b => isCloseText(b.textContent));
    return byText.find(b => /close/i.test(b.textContent || '')) ?? byText[0] ?? null;
};

let installed = false;

export const installEscToClosePopups = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

        const overlay = topmostOverlay();
        if (!overlay) return;
        const closeBtn = findCloseButton(overlay);
        if (!closeBtn) return;

        // Did anything else react to this Esc (e.g. the popup's own Esc handler, a dropdown closing)?
        let changed = false;
        const watcher = new MutationObserver(() => { changed = true; });
        watcher.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });

        // Run after every other handler and after React has re-rendered
        setTimeout(() => {
            watcher.disconnect();
            if (changed || e.defaultPrevented) return;
            if (!overlay.isConnected || !isVisible(overlay) || !closeBtn.isConnected || !isUsable(closeBtn)) return;
            closeBtn.click();
        }, 0);
    });
};
