import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Photo } from './StoreUI';

const ZOOM_MIN = 2;
const ZOOM_MAX = 3.5;
const PANE_GAP = 24;
const PANE_MIN = 280; // narrower than this beside the photo -> zoom in place instead

interface Rect { left: number; top: number; width: number; height: number }
interface Zoom { src: string; pane: Rect; lens: Rect | null; bgSize: string; bgPos: string }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Product photo with Amazon-style hover zoom: a lens over the photo and a magnified pane beside it
 * (over the buy box), or magnified in place when there's no room. Mouse only — touch keeps the plain photo.
 */
export const ZoomPhoto: React.FC<{ src?: string | null; alt: string; className?: string }> = ({ src, alt, className }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState<Zoom | null>(null);
    const [hoverable] = useState(canHover);
    const zooming = zoom !== null;

    useEffect(() => setZoom(null), [src]);

    // The pane is fixed to the viewport, so drop it as soon as anything moves under it
    useEffect(() => {
        if (!zooming) return;
        const hide = () => setZoom(null);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => {
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
        };
    }, [zooming]);

    const onMove = (e: React.MouseEvent) => {
        const img = ref.current?.querySelector('img');
        if (!ref.current || !img || !img.naturalWidth) return;
        const box = ref.current.getBoundingClientRect();

        // object-contain: where the photo actually sits inside the square box
        const fit = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
        const dw = img.naturalWidth * fit;
        const dh = img.naturalHeight * fit;
        const offX = (box.width - dw) / 2;
        const offY = (box.height - dh) / 2;
        const x = e.clientX - box.left - offX;
        const y = e.clientY - box.top - offY;
        if (x < 0 || y < 0 || x > dw || y > dh) { setZoom(null); return; }

        const z = clamp(img.naturalWidth / dw, ZOOM_MIN, ZOOM_MAX);
        const room = window.innerWidth - box.right - PANE_GAP - 16;
        const inPlace = room < PANE_MIN;
        const pane: Rect = inPlace
            ? { left: box.left, top: box.top, width: box.width, height: box.height }
            : { left: box.right + PANE_GAP, top: box.top, width: Math.min(box.width, room), height: box.height };

        // Magnified photo centred on the cursor, clamped so it never shows empty edges it doesn't need
        const zw = dw * z;
        const zh = dh * z;
        const bx = zw > pane.width ? clamp(pane.width / 2 - x * z, pane.width - zw, 0) : (pane.width - zw) / 2;
        const by = zh > pane.height ? clamp(pane.height / 2 - y * z, pane.height - zh, 0) : (pane.height - zh) / 2;

        // Lens = the part of the photo the pane is showing
        const lens: Rect | null = inPlace ? null : {
            left: offX + (zw > pane.width ? -bx / z : 0),
            top: offY + (zh > pane.height ? -by / z : 0),
            width: Math.min(dw, pane.width / z),
            height: Math.min(dh, pane.height / z),
        };

        setZoom({ src: img.currentSrc || img.src, pane, lens, bgSize: `${zw}px ${zh}px`, bgPos: `${bx}px ${by}px` });
    };

    return (
        <div ref={ref} className={hoverable && src ? 'relative cursor-crosshair' : 'relative'}
            onMouseMove={hoverable ? onMove : undefined} onMouseLeave={() => setZoom(null)}>
            <Photo src={src} alt={alt} fit="contain" className={className} />
            {zoom?.lens && (
                <span aria-hidden className="pointer-events-none absolute border border-slate-400 bg-white/35"
                    style={{ left: zoom.lens.left, top: zoom.lens.top, width: zoom.lens.width, height: zoom.lens.height }} />
            )}
            {zoom && createPortal(
                <div aria-hidden className="pointer-events-none fixed z-[950] rounded-sm border border-sf-line bg-white bg-no-repeat shadow-sf-float"
                    style={{
                        ...zoom.pane,
                        backgroundImage: `url(${JSON.stringify(zoom.src)})`,
                        backgroundSize: zoom.bgSize,
                        backgroundPosition: zoom.bgPos,
                    }} />,
                document.body,
            )}
        </div>
    );
};
