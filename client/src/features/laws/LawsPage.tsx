import { useEffect, useState } from 'react';
import { Loader2, Scale, Check, Ban, Sparkles } from 'lucide-react';
import { ApiError } from '../../shared/api/client';
import { getPublicLaws, type CongressLaw } from '../admin/congress-api';
import { getWheelFeed, type LawEffect } from '../admin/laws-api';

export function LawsPage() {
  const [laws, setLaws] = useState<CongressLaw[]>([]);
  const [spins, setSpins] = useState<LawEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPublicLaws()
      .then((res) => {
        if (alive) setLaws(res.laws);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Не удалось загрузить законы');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    // Колесо фортуны — тоже закон съезда: показываем ленту прямо здесь.
    getWheelFeed()
      .then((res) => {
        if (alive) setSpins(res.spins);
      })
      .catch(() => {
        /* лента необязательная — страница живёт и без неё */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="flex items-center gap-3 mb-1">
        <Scale className="w-6 h-6 text-brand-400" />
        <h1 className="font-display text-heading-md text-neutral-1000">Законы</h1>
      </div>
      <p className="text-sm text-neutral-700 mb-5">Принятые на съезде законы.</p>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-danger-bg text-danger-text text-sm px-3 py-2 rounded-sm border border-danger max-w-md">
          {error}
        </div>
      ) : laws.length === 0 ? (
        <p className="text-sm text-neutral-700">Принятых законов пока нет.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {laws.map((law) => {
            const vetoed = law.status === 'vetoed';
            return (
              <div
                key={law.id}
                className={`border rounded-md p-4 ${
                  vetoed ? 'border-warning bg-warning-bg' : 'border-success bg-success-bg'
                }`}
              >
                <div
                  className={`inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider font-semibold mb-2 ${
                    vetoed ? 'text-warning-text' : 'text-success-text'
                  }`}
                >
                  {vetoed ? <Ban className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  {vetoed
                    ? `Вето${law.vetoed_by_team_name ? ` · ${law.vetoed_by_team_name}` : ''}`
                    : 'Принят'}
                </div>
                <p
                  className={`text-sm whitespace-pre-wrap break-words ${
                    vetoed ? 'text-neutral-700 line-through' : 'text-neutral-1000'
                  }`}
                >
                  {law.text}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {spins.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-brand-400" />
            <h2 className="font-display text-heading-sm text-neutral-1000">Колесо фортуны</h2>
          </div>
          <p className="text-sm text-neutral-700 mb-3">
            Что выпало командам, которым ведущий дал колесо.
          </p>
          <ul className="space-y-1.5">
            {spins.map((spin) => (
              <li
                key={spin.id}
                className="flex flex-wrap items-center gap-2 border border-neutral-400 rounded-sm px-3 py-2 bg-neutral-100"
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-1000"
                  title={spin.team_name}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{
                      backgroundColor: spin.team_color ?? 'var(--color-neutral-500)',
                    }}
                  />
                  {spin.team_name}
                </span>
                <span className="text-sm text-neutral-1000 font-medium">{spin.title}</span>
                {spin.note && <span className="text-xs text-neutral-700">{spin.note}</span>}
                {spin.status === 'armed' && (
                  <span className="text-2xs uppercase tracking-wider text-warning-text">
                    ждёт своего момента
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
