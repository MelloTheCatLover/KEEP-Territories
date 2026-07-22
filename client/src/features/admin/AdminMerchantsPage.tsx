import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bomb, Check, Hammer, Loader2, Store } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { AdminGuard, AdminPageHeader } from './AdminShell';
import { getMerchantSectors, spendMerchantToken, type MerchantSector } from './merchant-api';
import type { MerchantType } from '../team/types';
import { formatSectorLabel } from '../map/types';

const MERCHANT_META: Record<MerchantType, { label: string; Icon: typeof Hammer }> = {
  master: { label: 'Мастер', Icon: Hammer },
  saboteur: { label: 'Диверсант', Icon: Bomb },
  trader: { label: 'Торговец', Icon: Store },
};

export function AdminMerchantsPage() {
  return (
    <AdminGuard>
      <Merchants />
    </AdminGuard>
  );
}

function Merchants() {
  const [sectors, setSectors] = useState<MerchantSector[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getMerchantSectors();
      setSectors(res.sectors);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Teams still owing a visit (captured, token unspent) float to the top.
  const pendingCount = useMemo(
    () => (sectors ? sectors.filter((s) => s.token_id && !s.token_spent_at).length : 0),
    [sectors],
  );

  async function spend(tokenId: string) {
    setBusyId(tokenId);
    setError(null);
    try {
      await spendMerchantToken(tokenId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отметить');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <AdminPageHeader title="Персонажи на карте" />

      <p className="text-sm text-neutral-700 mb-4">
        Скрытые персонажи на секторах. Когда команда захватывает такой сектор, она получает жетон
        покупки и должна подойти к персонажу за товаром. Отметьте «Потрачено», когда команда забрала
        товар.
        {pendingCount > 0 && (
          <> Ждут визита: <span className="text-warning-text font-medium">{pendingCount}</span>.</>
        )}
      </p>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {sectors === null ? (
        <div className="flex items-center justify-center py-12 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : sectors.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-700">На карте нет персонажей.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sectors.map((s) => {
            const meta = MERCHANT_META[s.merchant_type];
            const Icon = meta.Icon;
            const label =
              s.number != null ? formatSectorLabel(s.difficulty_slug as never, s.number) : '—';
            const owned = !!s.captured_by_team_id;
            const spent = !!s.token_spent_at;
            const awaiting = owned && s.token_id && !spent;
            return (
              <li
                key={s.sector_id}
                className={`flex items-center gap-3 border rounded-md px-3 py-2.5 ${
                  awaiting ? 'bg-warning-bg border-warning' : 'bg-neutral-100 border-neutral-300'
                }`}
              >
                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-sm bg-neutral-200 border border-neutral-400">
                  <Icon className="w-5 h-5 text-neutral-800" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-1000 font-medium">
                    {meta.label} · сектор {label}
                  </div>
                  <div className="text-xs text-neutral-700 truncate">
                    {owned ? (
                      <>
                        Захватила:{' '}
                        <span className="text-neutral-1000">{s.captured_by_team_name}</span>
                        {spent ? ' · товар получен' : ' · ждёт визита'}
                      </>
                    ) : (
                      'Не захвачен'
                    )}
                  </div>
                </div>
                {awaiting && s.token_id && (
                  <Button
                    variant="secondary"
                    className="text-xs flex-shrink-0"
                    onClick={() => void spend(s.token_id!)}
                    isLoading={busyId === s.token_id}
                    disabled={busyId !== null}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Потрачено
                    </span>
                  </Button>
                )}
                {spent && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-success-text">
                    <Check className="w-3.5 h-3.5" /> Готово
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
