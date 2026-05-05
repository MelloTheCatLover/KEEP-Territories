import { useEffect, useRef, useState } from 'react';
import { Button } from '../../shared/ui';
import type { TaskBrief } from './api';
import { teamColors, TEAM_COLOR_ORDER } from '../../design-system/design-tokens';

type Props = {
  pool: TaskBrief[];
  winnerId: string;
  onDone: () => void;
};

const SIZE = 320;
const RADIUS = 140;
const HUB_RADIUS = 30;
const SPIN_LOOPS = 6;
const SPIN_MS = 4200;
const FINISH_DELAY = 350;

export function TaskWheel({ pool, winnerId, onDone }: Props) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const wheelRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  const winnerIdx = Math.max(0, pool.findIndex((t) => t.id === winnerId));
  const sliceAngle = 360 / Math.max(1, pool.length);
  const winnerMid = winnerIdx * sliceAngle + sliceAngle / 2;
  const targetRotation = SPIN_LOOPS * 360 + (360 - winnerMid);

  useEffect(() => {
    return () => {
      animRef.current?.cancel();
    };
  }, []);

  function handleSpin() {
    if (phase !== 'idle') return;
    const el = wheelRef.current;
    if (!el) return;
    setPhase('spinning');
    const anim = el.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: `rotate(${targetRotation}deg)` },
      ],
      {
        duration: SPIN_MS,
        easing: 'cubic-bezier(0.12, 0.78, 0.18, 1)',
        fill: 'forwards',
      },
    );
    animRef.current = anim;
    anim.onfinish = () => {
      setPhase('done');
      window.setTimeout(onDone, FINISH_DELAY);
    };
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-700 text-center uppercase tracking-wider">
        {phase === 'idle'
          ? 'Прокрутите колесо, чтобы выбрать задание'
          : phase === 'spinning'
            ? 'Колесо крутится...'
            : 'Задание выбрано'}
      </p>
      <div
        className="relative mx-auto"
        style={{ width: SIZE, height: SIZE }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, var(--color-brand-900) 0%, transparent 70%)',
            filter: 'blur(8px)',
            opacity: phase === 'spinning' ? 0.9 : 0.5,
            transition: 'opacity 300ms ease-out',
          }}
        />
        <div
          ref={wheelRef}
          className="w-full h-full relative"
          style={{
            transformOrigin: '50% 50%',
            willChange: 'transform',
          }}
        >
          <svg
            viewBox={`-${SIZE / 2} -${SIZE / 2} ${SIZE} ${SIZE}`}
            className="w-full h-full block"
          >
            <defs>
              <filter id="wheel-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="4"
                  floodColor="#000"
                  floodOpacity="0.45"
                />
              </filter>
            </defs>
            <g filter="url(#wheel-shadow)">
              {pool.map((task, i) => {
                const palette = teamColors[TEAM_COLOR_ORDER[i % TEAM_COLOR_ORDER.length]];
                return (
                  <Slice
                    key={task.id}
                    task={task}
                    startAngle={i * sliceAngle}
                    endAngle={(i + 1) * sliceAngle}
                    fill={palette.base}
                    textFill={palette.textOnBase}
                  />
                );
              })}
              <circle
                r={RADIUS}
                fill="none"
                stroke="var(--color-neutral-1000)"
                strokeWidth={2}
                strokeOpacity={0.25}
              />
            </g>
            <circle
              r={HUB_RADIUS}
              fill="var(--color-neutral-100)"
              stroke="var(--color-brand-500)"
              strokeWidth={2.5}
            />
            <circle
              r={HUB_RADIUS - 8}
              fill="var(--color-brand-500)"
              opacity={phase === 'spinning' ? 0.95 : 0.6}
            />
          </svg>
        </div>
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox={`-${SIZE / 2} -${SIZE / 2} ${SIZE} ${SIZE}`}
        >
          <polygon
            points={`0,${-RADIUS + 14} -14,${-RADIUS - 18} 14,${-RADIUS - 18}`}
            fill="var(--color-brand-500)"
            stroke="var(--color-neutral-1000)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex justify-center">
        <Button
          variant="primary"
          onClick={handleSpin}
          disabled={phase !== 'idle'}
          isLoading={phase === 'spinning'}
        >
          {phase === 'idle' ? 'Крутить колесо' : 'Крутится...'}
        </Button>
      </div>
    </div>
  );
}

function Slice({
  task,
  startAngle,
  endAngle,
  fill,
  textFill,
}: {
  task: TaskBrief;
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

  return (
    <g>
      <path
        d={path}
        fill={fill}
        stroke="var(--color-neutral-50)"
        strokeWidth={1.5}
      />
      <text
        x={tx}
        y={ty}
        transform={`rotate(${textRotation} ${tx} ${ty})`}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fontFamily="var(--font-display)"
        fontWeight={600}
        fill={textFill}
      >
        {truncate(task.title, 16)}
      </text>
    </g>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
