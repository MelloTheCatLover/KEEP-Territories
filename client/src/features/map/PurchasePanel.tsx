import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hammer, Loader2, Store, X } from 'lucide-react';
import {
  buyPurchase,
  cancelPurchase,
  getPurchaseCatalog,
  getPurchases,
  type Purchase,
  type PurchaseDef,
  type PurchaseKind,
  type PurchaseMerchant,
  type PurchaseSlots,
} from '../admin/purchase-api';
import { formatSectorLabel, type DifficultySlug, type Sector } from './types';
import type { TeamFullStats } from '../team/types';
import { ApiError } from '../../shared/api/client';

type Props = {
  /** Команда, за которую играет председатель, — она и покупает. */
  buyerTeam: TeamFullStats | null;
  teams: TeamFullStats[];
  sectors: Sector[];
  /** Вызывается после покупки/снятия — родитель перезагружает карту. */
  onChanged: () => void;
};

const MERCHANT_LABEL: Record<PurchaseMerchant, string> = {
  master: 'Мастер',
  trader: 'Торговец',
};

/** Потолок укрепления — зеркало MAX_FORTIFICATION на сервере. */
const MAX_FORTIFICATION = 3;

/**
 * Лавки мастера и торговца прямо на карте: жетон покупки превращается в эффект
 * здесь, а не отыгрывается на словах. Мгновенные товары срабатывают сразу,
 * остальные ложатся команде имплантом и ждут её действия — они перечислены
 * ниже, чтобы председатель видел, кто с чем ходит.
 */
export function PurchasePanel({ buyerTeam, teams, sectors, onChanged }: Props) {
  const [catalog, setCatalog] = useState<PurchaseDef[]>([]);
  const [armed, setArmed] = useState<Purchase[]>([]);
  const [history, setHistory] = useState<Purchase[]>([]);
  const [slots, setSlots] = useState<PurchaseSlots[]>([]);
  const [merchant, setMerchant] = useState<PurchaseMerchant>('master');
  const [kind, setKind] = useState<PurchaseKind | ''>('');
  const [targetTeamId, setTargetTeamId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await getPurchases();
      setArmed(list.armed);
      setHistory(list.history);
      setSlots(list.slots);
    } catch {
      /* панель необязательная — молча переживаем сбой загрузки */
    }
  }, []);

  useEffect(() => {
    getPurchaseCatalog()
      .then((r) => setCatalog(r.purchases))
      .catch(() => setCatalog([]));
    void reload();
  }, [reload]);

  const shelf = useMemo(
    () => catalog.filter((p) => p.merchant === merchant),
    [catalog, merchant],
  );
  const def = useMemo(() => catalog.find((p) => p.kind === kind) ?? null, [catalog, kind]);

  const tokens = buyerTeam?.purchase_tokens[merchant] ?? 0;
  const slot = slots.find((s) => s.team_id === buyerTeam?.id) ?? null;

  // Свои неукреплённые до потолка сектора — цели для «кирпичей».
  const ownSectors = useMemo(
    () =>
      sectors
        .filter(
          (s) =>
            s.captured_by_team_id === buyerTeam?.id &&
            !s.is_home_base &&
            s.fortification_level < MAX_FORTIFICATION,
        )
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [sectors, buyerTeam],
  );

  const opponents = useMemo(
    () => teams.filter((t) => t.id !== buyerTeam?.id),
    [teams, buyerTeam],
  );

  const ready =
    !!buyerTeam &&
    !!def &&
    tokens > 0 &&
    (!def.needs_target || targetTeamId !== '') &&
    (!def.needs_sector || sectorId !== '');

  function resetForm() {
    setKind('');
    setTargetTeamId('');
    setSectorId('');
  }

  async function submit() {
    if (!buyerTeam || !def) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await buyPurchase({
        team_id: buyerTeam.id,
        kind: def.kind,
        target_team_id: def.needs_target ? targetTeamId : null,
        sector_id: def.needs_sector ? sectorId : null,
      });
      setNotice(
        result.status === 'applied'
          ? `«${result.title}» — ${result.note ?? 'применено'}`
          : `«${result.title}» заряжен на ${result.team_name}`,
      );
      resetForm();
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось купить товар');
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    setBusy(true);
    setError(null);
    try {
      await cancelPurchase(id);
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось снять имплант');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-sm border border-brand-700/60 bg-brand-900/20 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-brand-700/40">
        <Store className="w-3.5 h-3.5 text-brand-400" />
        <span className="font-display text-sm text-neutral-1000">Лавки</span>
        {buyerTeam && (
          <span className="ml-auto text-2xs text-neutral-700">
            жетоны: <b className="font-mono text-neutral-1000">{tokens}</b>
            {slot && (
              <>
                {' · '}слоты:{' '}
                <b className="font-mono text-neutral-1000">
                  {slot.used}/{slot.total}
                </b>
              </>
            )}
          </span>
        )}
      </div>

      <div className="p-2 space-y-2 text-xs">
        {!buyerTeam ? (
          <p className="text-2xs text-neutral-700">
            Выберите команду, за которую играете, — покупает она.
          </p>
        ) : (
          <>
            <div className="text-2xs text-neutral-700">
              Покупает <b className="text-neutral-1000">{buyerTeam.name}</b>
            </div>

            <div className="flex gap-1">
              {(['master', 'trader'] as PurchaseMerchant[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMerchant(m);
                    resetForm();
                  }}
                  className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-xs text-2xs font-medium border transition-colors ${
                    merchant === m
                      ? 'bg-brand-900/40 text-brand-400 border-brand-700'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-500 hover:text-neutral-1000'
                  }`}
                >
                  {m === 'master' ? <Hammer className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                  {MERCHANT_LABEL[m]}
                  <span className="font-mono">{buyerTeam.purchase_tokens[m] ?? 0}</span>
                </button>
              ))}
            </div>

            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as PurchaseKind | '');
                setTargetTeamId('');
                setSectorId('');
              }}
              className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
            >
              <option value="">— выбрать товар —</option>
              {shelf.map((p) => (
                <option key={p.kind} value={p.kind}>
                  {p.title}
                  {p.charges > 1 ? ` (${p.charges})` : ''}
                </option>
              ))}
            </select>

            {def && <p className="text-2xs text-neutral-700">{def.description}</p>}

            {def?.needs_target && (
              <select
                value={targetTeamId}
                onChange={(e) => setTargetTeamId(e.target.value)}
                className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
              >
                <option value="">— у кого копируем —</option>
                {opponents.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            {def?.needs_sector && (
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
              >
                <option value="">— свой сектор —</option>
                {ownSectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSectorLabel(s.difficulty.slug as DifficultySlug, s.number)} · укр.{' '}
                    {s.fortification_level}
                  </option>
                ))}
              </select>
            )}

            {def?.needs_sector && ownSectors.length === 0 && (
              <p className="text-2xs text-neutral-600">Нет своих секторов под укрепление.</p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ready || busy}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs text-2xs font-medium bg-brand-900/40 text-brand-400 border border-brand-700 hover:bg-brand-900/60 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Store className="w-3 h-3" />}
              Купить (−1 жетон)
            </button>

            {tokens === 0 && (
              <p className="text-2xs text-warning-text">
                У команды нет жетонов лавки «{MERCHANT_LABEL[merchant]}» — захватите её сектор.
              </p>
            )}
          </>
        )}

        {error && <p className="text-2xs text-danger-text">{error}</p>}
        {notice && <p className="text-2xs text-success-text">{notice}</p>}

        {armed.length > 0 && (
          <div className="border-t border-neutral-300 pt-2">
            <div className="text-2xs text-neutral-700 mb-1">Импланты ({armed.length})</div>
            <ul className="space-y-1">
              {armed.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-xs bg-neutral-0/70 border border-neutral-300 px-2 py-1"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-2xs text-neutral-1000 truncate">
                      {p.title}
                      {p.charges_left > 1 ? ` · ×${p.charges_left}` : ''}
                    </div>
                    <div className="text-2xs text-neutral-700 truncate">
                      у {p.team_name} · {MERCHANT_LABEL[p.merchant]}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void drop(p.id)}
                    disabled={busy}
                    title="Снять имплант"
                    className="flex-shrink-0 p-1 rounded-xs text-neutral-700 hover:text-danger-text disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.length > 0 && (
          <details className="border-t border-neutral-300 pt-2">
            <summary className="text-2xs text-neutral-700 cursor-pointer">
              Журнал ({history.length})
            </summary>
            <ul className="mt-1 space-y-1">
              {history.slice(0, 10).map((p) => (
                <li key={p.id} className="text-2xs text-neutral-700">
                  <span className="text-neutral-1000">{p.title}</span> · {p.team_name}
                  {p.target_team_name ? ` ← ${p.target_team_name}` : ''}
                  {p.sector_number != null && p.sector_difficulty_slug
                    ? ` · ${formatSectorLabel(
                        p.sector_difficulty_slug as DifficultySlug,
                        p.sector_number,
                      )}`
                    : ''}
                  {p.status === 'cancelled' ? ' · снят' : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
