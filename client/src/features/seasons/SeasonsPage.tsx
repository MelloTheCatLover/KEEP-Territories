import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Loader2 } from 'lucide-react';
import { Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getSeasons, type Season, type SeasonStatus } from './api';

const STATUS_META: Record<SeasonStatus, { label: string; cls: string }> = {
  active: { label: 'активная', cls: 'bg-success-bg text-success-text border-success/40' },
  draft: { label: 'черновик', cls: 'bg-neutral-200 text-neutral-900 border-neutral-400' },
  archived: { label: 'архив', cls: 'bg-warning-bg text-warning-text border-warning/40' },
};

function formatRange(start: string | null, end: string | null): string | null {
  const fmt = (d: string) => new Date(d).toLocaleDateString('ru-RU');
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `с ${fmt(start)}`;
  if (end) return `до ${fmt(end)}`;
  return null;
}

export function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSeasons()
      .then(setSeasons)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить смены'),
      );
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Смены</h1>
        <p className="text-sm text-neutral-700">
          Все смены лагеря. Играть можно в активной; остальные доступны для просмотра.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {seasons === null ? (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
      ) : seasons.length === 0 ? (
        <p className="text-sm text-neutral-700">Смен пока нет.</p>
      ) : (
        <div className="space-y-3">
          {seasons.map((season) => {
            const meta = STATUS_META[season.status];
            const range = formatRange(season.starts_at, season.ends_at);
            return (
              <Link key={season.id} to={`/seasons/${season.id}`} className="block">
                <Card className="hover:border-brand-500 transition-colors">
                  <div className="flex items-start gap-3">
                    <CalendarRange className="w-6 h-6 text-brand-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-heading-sm text-neutral-1000">
                          {season.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-sm border ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      {range && <p className="text-sm text-neutral-700 mt-1">{range}</p>}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
