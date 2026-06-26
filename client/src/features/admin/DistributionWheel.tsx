import { useEffect, useRef } from 'react';
import { teamColors, TEAM_COLOR_ORDER } from '../../design-system/design-tokens';

export type WheelItem = { id: string; label: string };

type Props = {
  pool: WheelItem[];
  /** Item to land on for the current spin (first of the drawn batch). */
  winnerId: string | null;
  /** Changes on each spin request — triggers the animation. */
  spinToken: number;
  durationMs: number;
  onDone: () => void;
};

const SIZE = 320;
const RADIUS = 140;
const HUB_RADIUS = 30;
const SPIN_LOOPS = 6;

export function DistributionWheel({ pool, winnerId, spinToken, durationMs, onDone }: Props) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  useEffect(() => {
    if (spinToken === 0) return;
    const el = wheelRef.current;
    if (!el || pool.length === 0) {
      onDone();
      return;
    }
    const winnerIdx = Math.max(0, pool.findIndex((p) => p.id === winnerId));
    const sliceAngle = 360 / pool.length;
    const winnerMid = winnerIdx * sliceAngle + sliceAngle / 2;
    const target = SPIN_LOOPS * 360 + (360 - winnerMid);

    animRef.current?.cancel();
    const anim = el.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${target}deg)` }],
      { duration: durationMs, easing: 'cubic-bezier(0.12, 0.78, 0.18, 1)', fill: 'forwards' },
    );
    animRef.current = anim;
    anim.onfinish = () => {
      window.setTimeout(onDone, 250);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  useEffect(() => () => animRef.current?.cancel(), []);

  const sliceAngle = 360 / Math.max(1, pool.length);

  return (
    <div
      className="relative mx-auto w-full"
      style={{ maxWidth: SIZE, aspectRatio: '1 / 1' }}
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 50%, var(--color-brand-900) 0%, transparent 70%)',
          filter: 'blur(8px)',
          opacity: 0.5,
        }}
      />
      <div ref={wheelRef} className="w-full h-full relative" style={{ transformOrigin: '50% 50%', willChange: 'transform' }}>
        <svg viewBox={`-${SIZE / 2} -${SIZE / 2} ${SIZE} ${SIZE}`} className="w-full h-full block">
          <g>
            {pool.map((item, i) => {
              const palette = teamColors[TEAM_COLOR_ORDER[i % TEAM_COLOR_ORDER.length]];
              return (
                <Slice
                  key={item.id}
                  label={item.label}
                  startAngle={i * sliceAngle}
                  endAngle={(i + 1) * sliceAngle}
                  fill={palette.base}
                  textFill={palette.textOnBase}
                />
              );
            })}
            <circle r={RADIUS} fill="none" stroke="var(--color-neutral-1000)" strokeWidth={2} strokeOpacity={0.25} />
          </g>
          <circle r={HUB_RADIUS} fill="var(--color-neutral-100)" stroke="var(--color-brand-500)" strokeWidth={2.5} />
          <circle r={HUB_RADIUS - 8} fill="var(--color-brand-500)" opacity={0.6} />
        </svg>
      </div>
      <svg className="absolute inset-0 pointer-events-none" viewBox={`-${SIZE / 2} -${SIZE / 2} ${SIZE} ${SIZE}`}>
        <polygon
          points={`0,${-RADIUS + 14} -14,${-RADIUS - 18} 14,${-RADIUS - 18}`}
          fill="var(--color-brand-500)"
          stroke="var(--color-neutral-1000)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Slice({
  label,
  startAngle,
  endAngle,
  fill,
  textFill,
}: {
  label: string;
  startAngle: number;
  endAngle: number;
  fill: string;
  textFill: string;
}) {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = RADIUS * Math.cos(toRad(startAngle));
  const y1 = RADIUS * Math.sin(toRad(startAngle));
  const x2 = RADIUS * Math.cos(toRad(endAngle));
  const y2 = RADIUS * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const path = `M 0,0 L ${x1.toFixed(2)},${y1.toFixed(2)} A ${RADIUS},${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;

  const midAngle = (startAngle + endAngle) / 2;
  const textR = RADIUS * 0.62;
  const tx = textR * Math.cos(toRad(midAngle));
  const ty = textR * Math.sin(toRad(midAngle));
  const flip = midAngle > 90 && midAngle < 270;
  const textRotation = flip ? midAngle + 90 : midAngle - 90;
  const showText = endAngle - startAngle >= 9;

  return (
    <g>
      <path d={path} fill={fill} stroke="var(--color-neutral-50)" strokeWidth={1.5} />
      {showText && (
        <text
          x={tx}
          y={ty}
          transform={`rotate(${textRotation} ${tx} ${ty})`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontFamily="var(--font-display)"
          fontWeight={600}
          fill={textFill}
        >
          {truncate(label, 14)}
        </text>
      )}
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
