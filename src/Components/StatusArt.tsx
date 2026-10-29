import { memo, useEffect, useRef } from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { STATUS_THEMES, type StatusTone } from './StatusShell';

/**
 * Animated illustrations for the status pages. Each one is memoised and keeps
 * its motion in motion values, so the page around it never re-renders.
 */

const SNAP = { type: 'spring', stiffness: 220, damping: 18 } as const;
const SOFT = { stiffness: 100, damping: 20 };
const loop = (duration: number, delay = 0) =>
  ({ duration, delay, repeat: Infinity, ease: 'easeInOut' }) as const;
/** SVG groups rotate and scale around their own centre. */
const ORIGIN = { transformBox: 'fill-box', transformOrigin: 'center' } as const;

/** Mouse position across the window as -1…1, smoothed. Touch leaves it at rest. */
const usePointer = () => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      x.set((e.clientX / window.innerWidth) * 2 - 1);
      y.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [x, y]);
  return { x: useSpring(x, SOFT), y: useSpring(y, SOFT) };
};

const useShift = (value: MotionValue<number>, amount: number) => useTransform(value, (n) => n * amount);

/* ------------------------------------------------------------------ */
/* Crash: a bill torn in two. `mended` snaps the halves back together. */
/* ------------------------------------------------------------------ */

const TEAR = 'L112 136 L124 128 L136 136 L148 128 L160 136 L172 128 L184 136 L196 128 L208 136 L220 128';
const BILL_TOP =
  'M100 40 H220 V128 L208 136 L196 128 L184 136 L172 128 L160 136 L148 128 L136 136 L124 128 L112 136 L100 128 Z';
const BILL_BOTTOM = `M100 128 ${TEAR} V214 L208 222 L196 214 L184 222 L172 214 L160 222 L148 214 L136 222 L124 214 L112 222 L100 214 Z`;
const BITS = [
  { d: 'M248 112 l13 6 l-10 9 Z', home: [-34, 16], spin: 28 },
  { d: 'M66 142 l15 -4 l-3 13 Z', home: [36, -8], spin: -32 },
  { d: 'M240 170 l10 9 l-13 3 Z', home: [-26, -34], spin: 20 },
];

export const BrokenBillArt = memo(function BrokenBillArt({ tone, mended }: { tone: StatusTone; mended: boolean }) {
  const art = STATUS_THEMES[tone].art;
  const p = usePointer();
  const topX = useShift(p.x, 10);
  const topY = useShift(p.y, 8);
  const bottomX = useShift(p.x, -8);
  const bottomY = useShift(p.y, -6);
  const bitsX = useShift(p.x, 22);
  const bitsY = useShift(p.y, 16);

  const drift = (delay: number) =>
    mended ? { animate: { y: 0 }, transition: SNAP } : { animate: { y: [0, -6, 0] }, transition: loop(4, delay) };

  return (
    <svg viewBox="0 0 320 260" className="h-auto w-full" aria-hidden="true">
      <motion.circle cx={160} cy={128} r={108} className={art.soft} style={ORIGIN} animate={{ scale: [1, 1.04, 1] }} transition={loop(6)} />
      <motion.ellipse
        cx={160}
        cy={242}
        rx={64}
        ry={6}
        className="fill-slate-900/10"
        style={ORIGIN}
        animate={mended ? { scaleX: 1 } : { scaleX: [1, 0.86, 1] }}
        transition={mended ? SNAP : loop(4)}
      />

      {/* Top half, with the error badge on its corner */}
      <motion.g style={{ x: topX, y: topY }}>
        <motion.g {...drift(0)}>
          <motion.g style={ORIGIN} initial={false} animate={mended ? { x: 0, y: 0, rotate: 0 } : { x: -12, y: -14, rotate: -9 }} transition={SNAP}>
            <path d={BILL_TOP} className="fill-white stroke-slate-300" strokeWidth={1.5} strokeLinejoin="round" />
            <rect x={116} y={56} width={36} height={8} rx={1.5} className={art.ink} />
            {[78, 92, 106].map((y) => (
              <g key={y}>
                <rect x={116} y={y} width={56} height={5} rx={1} className="fill-slate-200" />
                <rect x={188} y={y} width={16} height={5} rx={1} className="fill-slate-300" />
              </g>
            ))}
            <AnimatePresence mode="wait" initial={false}>
              {mended ? (
                <motion.g key="ok" style={ORIGIN} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }}>
                  <circle cx={222} cy={40} r={15} className="fill-green-600" />
                  <path d="M215 40 l5 5 l9 -10" fill="none" className="stroke-white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </motion.g>
              ) : (
                <motion.g key="error" style={ORIGIN} exit={{ scale: 0 }} animate={{ scale: [1, 1.12, 1] }} transition={loop(1.8)}>
                  <circle cx={222} cy={40} r={15} className="fill-red-500" />
                  <path d="M222 32 v10" className="stroke-white" strokeWidth={2.5} strokeLinecap="round" />
                  <circle cx={222} cy={48} r={1.7} className="fill-white" />
                </motion.g>
              )}
            </AnimatePresence>
          </motion.g>
        </motion.g>
      </motion.g>

      {/* Bottom half */}
      <motion.g style={{ x: bottomX, y: bottomY }}>
        <motion.g {...drift(0.6)}>
          <motion.g style={ORIGIN} initial={false} animate={mended ? { x: 0, y: 0, rotate: 0 } : { x: 10, y: 12, rotate: 7 }} transition={SNAP}>
            <path d={BILL_BOTTOM} className="fill-white stroke-slate-300" strokeWidth={1.5} strokeLinejoin="round" />
            {[150, 164].map((y) => (
              <g key={y}>
                <rect x={116} y={y} width={56} height={5} rx={1} className="fill-slate-200" />
                <rect x={188} y={y} width={16} height={5} rx={1} className="fill-slate-300" />
              </g>
            ))}
            <line x1={116} x2={204} y1={180} y2={180} className="stroke-slate-300" strokeWidth={1.5} strokeDasharray="4 4" />
            <rect x={116} y={190} width={40} height={7} rx={1.5} className="fill-slate-300" />
            <rect x={174} y={190} width={30} height={7} rx={1.5} className={art.ink} />
          </motion.g>
        </motion.g>
      </motion.g>

      {/* Pieces that broke off; they fly home when mended */}
      <motion.g style={{ x: bitsX, y: bitsY }}>
        {BITS.map((bit, i) => (
          <motion.path
            key={bit.d}
            d={bit.d}
            className={i === 1 ? art.mid : 'fill-slate-200'}
            style={ORIGIN}
            initial={false}
            animate={
              mended
                ? { opacity: 0, scale: 0.4, x: bit.home[0], y: bit.home[1], rotate: 0 }
                : { opacity: 1, scale: 1, x: 0, y: [0, -8, 0], rotate: [0, bit.spin, 0] }
            }
            transition={mended ? SNAP : loop(3.4 + i * 0.6, i * 0.4)}
          />
        ))}
      </motion.g>
    </svg>
  );
});

/* ------------------------------------------------------------------ */
/* Not found: "4 (compass) 4". The needle hunts for the pointer.       */
/* ------------------------------------------------------------------ */

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const [r1, r2] = i % 3 === 0 ? [38, 46] : [42, 46];
  return { x1: 160 + r1 * Math.sin(a), y1: 104 - r1 * Math.cos(a), x2: 160 + r2 * Math.sin(a), y2: 104 - r2 * Math.cos(a), major: i % 3 === 0 };
});

export const CompassArt = memo(function CompassArt({ tone }: { tone: StatusTone }) {
  const art = STATUS_THEMES[tone].art;
  const ref = useRef<SVGSVGElement>(null);
  const angle = useMotionValue(0);
  const needle = useSpring(angle, { stiffness: 60, damping: 9 }); // a little wobbly, like a real needle
  const p = usePointer();
  const leftX = useShift(p.x, -12);
  const rightX = useShift(p.x, 12);
  const digitY = useShift(p.y, 6);

  useEffect(() => {
    const point = (e: PointerEvent) => {
      const svg = ref.current;
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const cx = box.left + box.width * (160 / 320);
      const cy = box.top + box.height * (104 / 200);
      let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      deg += Math.round((angle.get() - deg) / 360) * 360; // turn the short way round
      angle.set(deg);
    };
    window.addEventListener('pointermove', point, { passive: true });
    window.addEventListener('pointerdown', point, { passive: true });
    return () => {
      window.removeEventListener('pointermove', point);
      window.removeEventListener('pointerdown', point);
    };
  }, [angle]);

  return (
    <svg ref={ref} viewBox="0 0 320 200" className="h-auto w-full" aria-hidden="true">
      <motion.text x={62} y={150} textAnchor="middle" className="fill-slate-900" style={{ x: leftX, y: digitY, fontSize: 132, fontWeight: 600 }}>
        4
      </motion.text>
      <motion.text x={258} y={150} textAnchor="middle" className="fill-slate-900" style={{ x: rightX, y: digitY, fontSize: 132, fontWeight: 600 }}>
        4
      </motion.text>

      <motion.circle cx={160} cy={104} r={62} className={art.soft} style={ORIGIN} animate={{ scale: [1, 1.06, 1] }} transition={loop(5)} />
      <circle cx={160} cy={104} r={50} className="fill-white stroke-slate-200" strokeWidth={2} />
      {TICKS.map(({ major, ...ends }, i) => (
        <line key={i} {...ends} className={major ? 'stroke-slate-400' : 'stroke-slate-200'} strokeWidth={major ? 2.5 : 1.5} strokeLinecap="round" />
      ))}

      {/* Outer group wanders on its own; inner group points at the pointer */}
      <motion.g style={ORIGIN} animate={{ rotate: [-16, 20, -8, 14, -16] }} transition={loop(6)}>
        <motion.g style={{ ...ORIGIN, rotate: needle }}>
          <path d="M160 66 L169 104 L151 104 Z" className={art.ink} />
          <path d="M160 142 L169 104 L151 104 Z" className="fill-slate-300" />
        </motion.g>
      </motion.g>
      <circle cx={160} cy={104} r={5} className="fill-white stroke-slate-300" strokeWidth={2} />
    </svg>
  );
});

/* ------------------------------------------------------------------ */
/* Update: a ring that fills over `seconds`, arrows turning inside.    */
/* ------------------------------------------------------------------ */

export const UpdateArt = memo(function UpdateArt({ tone, seconds }: { tone: StatusTone; seconds: number }) {
  const art = STATUS_THEMES[tone].art;
  return (
    <svg viewBox="0 0 200 200" className="h-auto w-full" aria-hidden="true">
      <motion.circle cx={100} cy={100} r={92} className={art.soft} style={ORIGIN} animate={{ scale: [1, 1.04, 1] }} transition={loop(4)} />
      <circle cx={100} cy={100} r={66} fill="none" className="stroke-white" strokeWidth={10} />
      <motion.circle
        cx={100}
        cy={100}
        r={66}
        fill="none"
        className={art.stroke}
        strokeWidth={10}
        strokeLinecap="round"
        transform="rotate(-90 100 100)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: seconds, ease: 'linear' }}
      />
      {/* Orbiting dots; the clear circle keeps the group centred */}
      <motion.g style={ORIGIN} animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}>
        <circle cx={100} cy={100} r={84} fill="none" />
        <circle cx={100} cy={16} r={4} className={art.ink} />
        <circle cx={173} cy={142} r={3} className={art.mid} />
        <circle cx={27} cy={142} r={2.5} className="fill-slate-300" />
      </motion.g>
      <motion.g
        style={ORIGIN}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.9, ease: [0.65, 0, 0.35, 1] }}
      >
        <g transform="translate(76 76) scale(2)" fill="none" className={art.stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </g>
      </motion.g>
    </svg>
  );
});

/* ------------------------------------------------------------------ */
/* Access denied: a padlock that tilts toward the pointer and shakes   */
/* when tapped, while a key keeps trying the lock.                     */
/* ------------------------------------------------------------------ */

export const LockArt = memo(function LockArt({ tone, label }: { tone: StatusTone; label: string }) {
  const theme = STATUS_THEMES[tone];
  const art = theme.art;
  const p = usePointer();
  const rotateY = useShift(p.x, 14);
  const rotateX = useShift(p.y, -10);
  const shake = useAnimationControls();
  const hole = useAnimationControls();

  const knock = () => {
    shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.5 } });
    hole.start({ scale: [1, 1.35, 1], transition: { duration: 0.45 } });
    navigator.vibrate?.(40);
  };

  return (
    <button
      type="button"
      onClick={knock}
      aria-label={label}
      className={`block w-full cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 ${theme.focus}`}
      style={{ perspective: 800 }}
    >
      <motion.div style={{ rotateX, rotateY }}>
        <motion.svg viewBox="0 0 280 240" className="h-auto w-full" aria-hidden="true" animate={shake}>
          <motion.circle cx={140} cy={122} r={104} className={art.soft} style={ORIGIN} animate={{ scale: [1, 1.04, 1] }} transition={loop(6)} />
          <motion.ellipse cx={120} cy={224} rx={60} ry={6} className="fill-slate-900/10" />

          {/* Shackle keeps trying to pop open */}
          <motion.path
            d="M80 106 V74 a40 40 0 0 1 80 0 V106"
            fill="none"
            className="stroke-slate-400"
            strokeWidth={14}
            strokeLinecap="round"
            animate={{ y: [0, -10, 0, 0] }}
            transition={{ duration: 3.6, times: [0, 0.12, 0.28, 1], repeat: Infinity, ease: 'easeOut' }}
          />
          <rect x={56} y={100} width={128} height={110} rx={6} className={art.ink} />
          <rect x={68} y={112} width={104} height={10} rx={3} className="fill-white/20" />
          <motion.g style={ORIGIN} animate={hole}>
            <circle cx={120} cy={150} r={12} className="fill-white" />
            <rect x={115} y={154} width={10} height={26} rx={3} className="fill-white" />
          </motion.g>

          {/* Key wanders up, bumps the lock, backs off */}
          <motion.g
            style={ORIGIN}
            animate={{ x: [0, -16, -16, 0], rotate: [-14, 0, 0, -14] }}
            transition={{ duration: 4, times: [0, 0.35, 0.5, 1], repeat: Infinity, ease: 'easeInOut' }}
          >
            <g fill="none" className="stroke-slate-400" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={240} cy={156} r={11} />
              <path d="M229 156 H198 M206 156 v8 M215 156 v6" />
            </g>
          </motion.g>
        </motion.svg>
      </motion.div>
    </button>
  );
});
