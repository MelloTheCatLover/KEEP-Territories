import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '../../shared/ui';
import type { LawEffect, WheelPrizeDef } from '../admin/laws-api';
import { teamColors, TEAM_COLOR_ORDER } from '../../design-system/design-tokens';

type Props = {
  prizes: WheelPrizeDef[];
  /** Уже выпавший результат: сервер крутит, колесо только доигрывает. */
  result: LawEffect;
  teamName: string;
  onClose: () => void;
};

const SIZE = 340;
const RADIUS = 150;
const HUB_RADIUS = 32;
const SPIN_LOOPS = 6;
const SPIN_MS = 4600;

/**
 * Колесо фортуны — закон съезда, который председатель даёт команде. Сектор
 * колеса тем шире, чем больше вес плюшки, поэтому «джекпот» видно узкой
 * полоской: игра честно показывает, насколько он редкий.
 *
 * Результат приходит с сервера ДО анимации (там же он и применён), клиент лишь
 * докручивает стрелку до нужного сектора — перекрутить колесо перезагрузкой
 * страницы нельзя.
 */
export function FortuneWheelModal({ prizes, result, teamName, onClose }: Props) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const wheelRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  // Углы секторов пропорциональны весам — узкий сектор = редкая плюшка.
  const slices = useMemo(() => {
    const total = prizes.reduce((sum, p) => sum + p.weight, 0) || 1;
    const out: Array<{ prize: WheelPrizeDef; start: number; end: number; index: number }> = [];
    for (const [i, prize] of prizes.entries()) {
      const start = out.length > 0 ? out[out.length - 1].end : 0;
      out.push({ prize, start, end: start + (prize.weight / total) * 360, index: i });
    }
    return out;
  }, [prizes]);

  const winner = slices.find((s) => s.prize.kind === result.kind) ?? slices[0];
  const winnerMid = winner ? (winner.start + winner.end) / 2 : 0;
  const targetRotation = SPIN_LOOPS * 360 + (360 - winnerMid);

  useEffect(() => () => animRef.current?.cancel(), []);

  function handleSpin() {
    if (phase !== 'idle') return;
    const el = wheelRef.current;
    if (!el) return;
    setPhase('spinning');
    const anim = el.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${targetRotation}deg)` }],
      { duration: SPIN_MS, easing: 'cubic-bezier(0.12, 0.78, 0.18, 1)', fill: 'forwards' },
    );
    animRef.current = anim;
    anim.onfinish = () => setPhase('done');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={phase === 'spinning' ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-50 border border-neutral-400 rounded-md w-full max-w-lg shadow-3 max-h-[90vh] overflow-y-auto"
      >
        <header className="flex items-center gap-4 px-5 py-4 bg-neutral-100 border-b border-neutral-300">
          <div
            aria-hidden
            className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-md bg-brand-700 text-neutral-1000 shadow-2"
          >
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-heading-sm text-neutral-1000 leading-tight truncate">
              Колесо фортуны
            </h2>
            <p className="text-xs text-neutral-700 mt-1">
              Крутит команда <b className="text-neutral-1000">{teamName}</b>.
            </p>
          </div>
          {phase !== 'spinning' && (
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 p-1 -mr-1 text-neutral-700 hover:text-neutral-1000 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        <div className="p-5 space-y-4">
          <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
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
              style={{ transformOrigin: '50% 50%', willChange: 'transform' }}
            >
              <svg
                viewBox={`-${SIZE / 2} -${SIZE / 2} ${SIZE} ${SIZE}`}
                className="w-full h-full block"
              >
                <defs>
                  <filter id="fortune-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
                  </filter>
                </defs>
                <g filter="url(#fortune-shadow)">
                  {slices.map((slice) => {
                    const palette =
                      teamColors[TEAM_COLOR_ORDER[slice.index % TEAM_COLOR_ORDER.length]];
                    return (
                      <Slice
                        key={slice.prize.kind}
                        title={slice.prize.title}
                        startAngle={slice.start}
                        endAngle={slice.end}
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

          {phase === 'done' ? (
            <div className="rounded-sm border border-success bg-success-bg px-4 py-3 text-center">
              <div className="font-display text-heading-sm text-neutral-1000">{result.title}</div>
              <p className="text-sm text-neutral-800 mt-1">
                {result.note ??
                  prizes.find((p) => p.kind === result.kind)?.description ??
                  'Плюшка выдана'}
              </p>
              {result.status === 'armed' && (
                <p className="text-xs text-warning-text mt-2">
                  Плюшка ждёт своего момента — она в списке «Заряжено» на панели закона.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-700 text-center uppercase tracking-wider">
              {phase === 'idle' ? 'Крутите колесо' : 'Колесо крутится...'}
            </p>
          )}

          <div className="flex justify-center">
            {phase === 'done' ? (
              <Button variant="primary" onClick={onClose}>
                Забрать
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSpin}
                disabled={phase !== 'idle'}
                isLoading={phase === 'spinning'}
              >
                {phase === 'idle' ? 'Крутить колесо' : 'Крутится...'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Slice({
  title,
  startAngle,
  endAngle,
  fill,
  textFill,
}: {
  title: string;
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
  const textR = RADIUS * 0.6;
  const tx = textR * Math.cos(toRad(midAngle));
  const ty = textR * Math.sin(toRad(midAngle));
  const flip = midAngle > 90 && midAngle < 270;
  const textRotation = flip ? midAngle + 90 : midAngle - 90;
  // Узкий сектор не вмещает подпись целиком — режем сильнее.
  const room = Math.max(6, Math.round((endAngle - startAngle) / 2.2));

  return (
    <g>
      <path d={path} fill={fill} stroke="var(--color-neutral-50)" strokeWidth={1.5} />
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
        {truncate(title, room)}
      </text>
    </g>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(1, n - 1)) + '…';
}
