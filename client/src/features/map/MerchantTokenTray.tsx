import { useState } from 'react';
import { Check, Store } from 'lucide-react';
import { spendMerchantToken, type MerchantSector } from '../admin/merchant-api';
import { formatSectorLabel, type DifficultySlug } from './types';
import { MERCHANT_MARK } from './HexMap';

type Props = {
  /** Every merchant sector of the season; the tray picks the unspent ones. */
  merchants: MerchantSector[];
  /** Called after a token is marked spent so the parent can reload. */
  onSpent: () => void;
};

/**
 * Purchase tokens waiting to be handed over, shown right on the admin map so a
 * capture of a character sector is actioned where it happens — no trip to the
 * characters page. A token appears the moment the capture is approved and
 * disappears once marked spent.
 */
export function MerchantTokenTray({ merchants, onSpent }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = merchants.filter((m) => m.token_id && !m.token_spent_at);
  if (pending.length === 0) return null;

  async function spend(tokenId: string) {
    setBusyId(tokenId);
    setError(null);
    try {
      await spendMerchantToken(tokenId);
      onSpent();
    } catch {
      setError('Не удалось отметить жетон');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-3 rounded-sm border border-warning bg-warning-bg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-warning/50">
        <Store className="w-3.5 h-3.5 text-warning-text" />
        <span className="font-display text-sm text-neutral-1000">Жетоны покупки</span>
        <span className="text-xs text-warning-text">({pending.length})</span>
      </div>

      {error && <p className="px-3 pt-2 text-2xs text-danger-text">{error}</p>}

      <ul className="p-2 space-y-1.5">
        {pending.map((m) => {
          const mark = MERCHANT_MARK[m.merchant_type];
          const label =
            m.number != null ? formatSectorLabel(m.difficulty_slug as DifficultySlug, m.number) : '—';
          return (
            <li
              key={m.sector_id}
              className="flex items-center gap-2 rounded-xs bg-neutral-0/70 border border-neutral-300 px-2 py-1.5"
            >
              <span
                className="w-5 h-5 flex-shrink-0 rounded-full inline-flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: mark.color }}
                title={mark.label}
              >
                {mark.letter}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-1000 truncate">
                  {mark.label} · {label}
                </div>
                <div className="text-2xs text-neutral-700 truncate">
                  {m.captured_by_team_name ?? '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void spend(m.token_id!)}
                disabled={busyId !== null}
                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-xs text-2xs font-medium bg-success-bg text-success-text border border-success/50 hover:bg-success/20 transition-colors disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                Потрачено
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
