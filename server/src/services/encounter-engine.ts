import { StatName } from '../types/team-stats';
import {
  EncounterEffect,
  EncounterEval,
  EncounterResolution,
  TeamSnapshot,
} from '../types/encounter';
import {
  CATALOG_BY_NUMBER,
  EncounterSpec,
  Outcome,
  Polarity,
  StatPick,
  isRosterNumber,
} from './encounter-catalog';

const STAT_RU: Record<StatName, string> = {
  strength: 'Сила',
  intelligence: 'Интеллект',
  endurance: 'Выносливость',
  leadership: 'Лидерство',
  luck: 'Удача',
};

const ALL_STATS: StatName[] = ['strength', 'intelligence', 'endurance', 'leadership', 'luck'];

/** Roster check: «Если в вашей команде есть <ФИО>, то _____.» */
export interface RosterBinding {
  /** Team whose champion is named; only that team gets the reward. */
  teamId: string | null;
  teamName: string | null;
  /** The named winner / MVP. */
  personName: string | null;
  /** Stat the reward lands on (varies per team so the checks differ). */
  stat: StatName;
}

export interface EvalInput {
  number: number;
  title: string;
  team: TeamSnapshot;
  choice?: string;
  roster?: RosterBinding | null;
}

const YES_NO = [
  { key: 'yes', label: 'Да' },
  { key: 'no', label: 'Нет' },
];

/* ------------------------------------------------------------------ rendering */

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Human-readable rendering of an effect, e.g. «+3 влияния, −1 сила». */
export function describeEffect(effect: EncounterEffect): string {
  const parts: string[] = [];
  if (effect.influence) parts.push(`${signed(effect.influence)} влияния`);
  if (effect.experience) parts.push(`${signed(effect.experience)} опыта`);
  if (effect.level) parts.push(`${signed(effect.level)} уровень`);
  for (const [key, delta] of Object.entries(effect.stats ?? {})) {
    if (!delta) continue;
    parts.push(`${signed(delta)} ${STAT_RU[key as StatName].toLowerCase()}`);
  }
  for (const stat of effect.zeroStats ?? []) {
    parts.push(`обнуление «${STAT_RU[stat]}»`);
  }
  if (effect.swapStats) {
    const [a, b] = effect.swapStats;
    parts.push(`${STAT_RU[a]} ↔ ${STAT_RU[b]}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'без последствий';
}

const PICK_RU: Record<Exclude<StatPick, StatName>, { nominative: string; dative: string }> = {
  random: { nominative: 'случайная характеристика', dative: 'случайной характеристике' },
  lowest: { nominative: 'самая слабая характеристика', dative: 'самой слабой характеристике' },
  highest: { nominative: 'самая сильная характеристика', dative: 'самой сильной характеристике' },
};

function pickLabel(pick: StatPick, form: 'nominative' | 'dative' = 'nominative'): string {
  if (pick in STAT_RU) return `«${STAT_RU[pick as StatName]}»`;
  return PICK_RU[pick as Exclude<StatPick, StatName>][form];
}

/** Team-independent text of an outcome, used for the admin's pool listing. */
function describeOutcome(outcome: Outcome): string {
  const parts: string[] = [];
  const base = describeEffect(outcome.effect);
  if (base !== 'без последствий') parts.push(base);
  if (outcome.wipe) parts.push(`обнуляется ${pickLabel(outcome.wipe)}`);
  if (outcome.gift) parts.push(`${signed(outcome.gift.amount)} к ${pickLabel(outcome.gift.stat, 'dative')}`);
  return parts.length > 0 ? parts.join(', ') : 'без последствий';
}

/* ------------------------------------------------------------------ resolving */

function resolveStatPick(team: TeamSnapshot, pick: StatPick): StatName {
  if (pick in STAT_RU) return pick as StatName;
  if (pick === 'random') return ALL_STATS[Math.floor(Math.random() * ALL_STATS.length)];
  const sorted = [...ALL_STATS].sort((a, b) => team.stats[a] - team.stats[b]);
  // Ties resolve to the first stat in the canonical order — deterministic.
  return pick === 'lowest' ? sorted[0] : sorted[sorted.length - 1];
}

/**
 * Turn a catalog outcome into a concrete resolution for this team: wipes and
 * gifts on `random`/`lowest`/`highest` are bound to an actual stat here.
 */
function toResolution(team: TeamSnapshot, outcome: Outcome): EncounterResolution {
  const effect: EncounterEffect = {
    ...outcome.effect,
    stats: outcome.effect.stats ? { ...outcome.effect.stats } : undefined,
  };

  if (outcome.wipe) {
    const stat = resolveStatPick(team, outcome.wipe);
    effect.zeroStats = [...(effect.zeroStats ?? []), stat];
  }
  if (outcome.gift) {
    const stat = resolveStatPick(team, outcome.gift.stat);
    effect.stats = { ...(effect.stats ?? {}) };
    effect.stats[stat] = (effect.stats[stat] ?? 0) + outcome.gift.amount;
  }

  const rendered = describeEffect(effect);
  return {
    outcomeText: outcome.flavor ? `${outcome.flavor}: ${rendered}` : rendered,
    effect,
    manual: false,
  };
}

/* ---------------------------------------------------------------- description */

const ROSTER_REWARD_INFLUENCE = 2;
const ROSTER_REWARD_STAT = 2;
const ROSTER_MISS_EXPERIENCE = 20;

function rosterOutcomes(stat: StatName): { hit: Outcome; miss: Outcome } {
  return {
    hit: {
      flavor: 'Ветеран узнал своего',
      effect: { influence: ROSTER_REWARD_INFLUENCE, stats: { [stat]: ROSTER_REWARD_STAT } },
    },
    miss: { flavor: 'Ветеран прошёл мимо', effect: { experience: ROSTER_MISS_EXPERIENCE } },
  };
}

function describeSpec(spec: EncounterSpec): string {
  switch (spec.kind) {
    case 'flat':
      return describeOutcome(spec.outcome);
    case 'check':
      return `${STAT_RU[spec.stat]} ${spec.min}+: ${describeOutcome(spec.pass)} · иначе: ${describeOutcome(spec.fail)}`;
    case 'sum':
      return `Сумма характеристик ${spec.min}+: ${describeOutcome(spec.pass)} · иначе: ${describeOutcome(spec.fail)}`;
    case 'choice':
      return `Да: ${describeOutcome(spec.yes)} · Нет: ${describeOutcome(spec.no)}`;
    case 'gamble':
      return (
        `Да → бросок (${Math.round(spec.chance * 100)}%): ${describeOutcome(spec.win)}` +
        ` · провал: ${describeOutcome(spec.lose)} · Нет: ${describeOutcome(spec.decline)}`
      );
  }
}

/** Full human-readable rules of an encounter (all branches), for the admin. */
export function describe(number: number, roster?: RosterBinding | null): string {
  if (isRosterNumber(number)) {
    const stat = roster?.stat ?? 'strength';
    const who = roster?.personName ?? 'загаданный игрок';
    const { hit, miss } = rosterOutcomes(stat);
    return `В команде есть ${who} → ${describeOutcome(hit)} · иначе: ${describeOutcome(miss)}`;
  }
  const entry = CATALOG_BY_NUMBER.get(number);
  if (!entry) return 'Встреча выведена из пула';
  return describeSpec(entry.spec);
}

export function polarityOf(number: number): Polarity {
  if (isRosterNumber(number)) return 'positive';
  return CATALOG_BY_NUMBER.get(number)?.polarity ?? 'positive';
}

/**
 * Player-facing narrative for a roster check: a fill-in-the-blank question
 * naming the bound team's champion, e.g. «Если в вашей команде есть
 * Шестак Алиса, то _____.». Falls back to a neutral placeholder.
 */
export function rosterQuestion(name: string | null | undefined): string {
  const who = name && name.trim() ? name.trim() : 'загаданный игрок';
  return `Если в вашей команде есть ${who}, то _____.`;
}

/* -------------------------------------------------------------------- evaluate */

function statOf(team: TeamSnapshot, s: StatName): { label: string; value: number } {
  return { label: STAT_RU[s], value: team.stats[s] };
}

function sumStats(team: TeamSnapshot): number {
  const s = team.stats;
  return s.strength + s.intelligence + s.endurance + s.leadership + s.luck;
}

/**
 * Evaluate an encounter for a team. Pass `choice` to resolve a choice/gamble
 * encounter (the coin flip happens here, server-side).
 */
export function evaluate(input: EvalInput): EncounterEval {
  const { number, team, choice, roster } = input;
  const base = {
    number,
    title: input.title,
    description: describe(number, roster),
    polarity: polarityOf(number),
  };

  if (isRosterNumber(number)) {
    const stat = roster?.stat ?? 'strength';
    const { hit, miss } = rosterOutcomes(stat);
    const isTarget = !!roster?.teamId && team.id === roster.teamId;
    return {
      ...base,
      title: rosterQuestion(roster?.personName),
      relevant: null,
      choice: null,
      resolution: toResolution(team, isTarget ? hit : miss),
    };
  }

  const entry = CATALOG_BY_NUMBER.get(number);
  if (!entry) {
    // Historical number no longer in the catalog: nothing left to apply.
    return {
      ...base,
      relevant: null,
      choice: null,
      resolution: { outcomeText: 'Встреча выведена из пула', effect: {}, manual: true },
    };
  }

  const spec = entry.spec;
  switch (spec.kind) {
    case 'flat':
      return { ...base, relevant: null, choice: null, resolution: toResolution(team, spec.outcome) };

    case 'check': {
      const value = team.stats[spec.stat];
      const passed = value >= spec.min;
      return {
        ...base,
        relevant: { label: `${STAT_RU[spec.stat]} (нужно ${spec.min}+)`, value },
        choice: null,
        resolution: toResolution(team, passed ? spec.pass : spec.fail),
      };
    }

    case 'sum': {
      const value = sumStats(team);
      return {
        ...base,
        relevant: { label: `Сумма характеристик (нужно ${spec.min}+)`, value },
        choice: null,
        resolution: toResolution(team, value >= spec.min ? spec.pass : spec.fail),
      };
    }

    case 'choice': {
      if (!choice) {
        return { ...base, relevant: null, choice: { prompt: spec.prompt, options: YES_NO }, resolution: null };
      }
      return {
        ...base,
        relevant: null,
        choice: null,
        resolution: toResolution(team, choice === 'yes' ? spec.yes : spec.no),
      };
    }

    case 'gamble': {
      if (!choice) {
        return { ...base, relevant: null, choice: { prompt: spec.prompt, options: YES_NO }, resolution: null };
      }
      if (choice !== 'yes') {
        return { ...base, relevant: null, choice: null, resolution: toResolution(team, spec.decline) };
      }
      const won = Math.random() < spec.chance;
      return { ...base, relevant: null, choice: null, resolution: toResolution(team, won ? spec.win : spec.lose) };
    }
  }
}
