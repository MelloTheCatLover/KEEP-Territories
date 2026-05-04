import { useEffect, useRef, useState } from 'react';
import type { TaskBrief } from './api';

type Props = {
  pool: TaskBrief[];
  winnerId: string;
  onDone: () => void;
};

const ITEM_HEIGHT = 56;
const SPIN_LOOPS = 6;
const SPIN_MS = 3800;

export function TaskWheel({ pool, winnerId, onDone }: Props) {
  const [phase, setPhase] = useState<'idle' | 'spin' | 'done'>('idle');
  const startedRef = useRef(false);

  const winnerIdx = Math.max(0, pool.findIndex((t) => t.id === winnerId));
  const targetIdx = pool.length * SPIN_LOOPS + winnerIdx;
  const items: TaskBrief[] = [];
  for (let i = 0; i < SPIN_LOOPS + 2; i++) items.push(...pool);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const raf = requestAnimationFrame(() => setPhase('spin'));
    const finish = window.setTimeout(() => {
      setPhase('done');
      onDone();
    }, SPIN_MS + 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(finish);
    };
  }, [onDone]);

  const offset = phase === 'idle' ? 0 : targetIdx * ITEM_HEIGHT;

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-700 text-center uppercase tracking-wider">
        Выпадает задание...
      </p>
      <div
        className="relative mx-auto overflow-hidden border border-brand-700 rounded-sm bg-neutral-50"
        style={{ height: ITEM_HEIGHT * 3 }}
      >
        <div
          className="absolute inset-x-0 pointer-events-none border-y-2 border-brand-500 z-10"
          style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
        />
        <ul
          className="relative will-change-transform"
          style={{
            transform: `translateY(-${offset}px)`,
            transition:
              phase === 'spin'
                ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.78, 0.18, 1)`
                : 'none',
            paddingTop: ITEM_HEIGHT,
          }}
        >
          {items.map((t, i) => (
            <li
              key={`${t.id}-${i}`}
              className="flex items-center justify-center px-4 text-center"
              style={{ height: ITEM_HEIGHT }}
            >
              <span className="font-display text-sm text-neutral-1000 truncate">
                {t.title}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
