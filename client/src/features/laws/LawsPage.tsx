import { useEffect, useState } from 'react';
import { Loader2, Scale, Check } from 'lucide-react';
import { ApiError } from '../../shared/api/client';
import { getPublicLaws, type CongressLaw } from '../admin/congress-api';

export function LawsPage() {
  const [laws, setLaws] = useState<CongressLaw[]>([]);
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
          {laws.map((law) => (
            <div
              key={law.id}
              className="border border-success bg-success-bg rounded-md p-4"
            >
              <div className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider font-semibold mb-2 text-success-text">
                <Check className="w-3.5 h-3.5" />
                Принят
              </div>
              <p className="text-sm text-neutral-1000 whitespace-pre-wrap break-words">{law.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
