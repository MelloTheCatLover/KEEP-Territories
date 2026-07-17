import { StatName } from '../types/team-stats';
import {
  EncounterEffect,
  EncounterEval,
  EncounterResolution,
  TeamSnapshot,
} from '../types/encounter';

const STAT_RU: Record<StatName, string> = {
  strength: 'Сила',
  intelligence: 'Интеллект',
  endurance: 'Выносливость',
  leadership: 'Лидерство',
  luck: 'Удача',
};

const none = (): EncounterResolution => ({ outcomeText: 'Ничего', effect: {}, manual: false });
const manual = (text: string): EncounterResolution => ({ outcomeText: text, effect: {}, manual: true });
const eff = (text: string, effect: EncounterEffect): EncounterResolution => ({
  outcomeText: text,
  effect,
  manual: false,
});

const ALL_STATS: StatName[] = ['strength', 'intelligence', 'endurance', 'leadership', 'luck'];

/** Full human-readable rules of each encounter (all branches), for the admin. */
const DESCRIPTIONS: Record<number, string> = {
  1: 'Интеллект 1–4: ничего · 5–7: координаты мастера · 8+: случайный предмет мастера',
  2: 'Сила 1–4: ничего · 5–6: координаты диверсанта · 7+: случайная диверсия',
  3: 'Согласиться → монета: орёл −4 влияния / решка +6 влияния · Отказаться: ничего',
  4: 'Выносливость 1–4: −1 сила · 5–7: +70 опыта · 8+: +1 уровень',
  5: 'Удача 1–3: ничего · 4–6: координаты торговца · 7+: 2 предмета торговца',
  6: 'Лидерство 1–6: ничего · 7–8: координаты имплантера · 9+: случайный имплант',
  7: 'Сила 1–5: −1 лидерство · 6–7: +100 опыта · 8+: +1 уровень',
  8: 'Открыть → +2 влияния · Нет: ничего',
  9: 'Открыть → бомба −6 влияния · Нет: ничего',
  10: 'Открыть → +100 опыта · Нет: ничего',
  11: 'Открыть → −8 влияния · Нет: ничего',
  12: 'Открыть → +2 влияния · Нет: ничего',
  13: 'Открыть → +2 влияния · Нет: ничего',
  14: 'Фаза 2 (вручную): руби 4 силы → +100 опыта; меньше всех → обнуление уровня',
  15: 'Фаза 2 (вручную): больше всех силы → +50 опыта; меньше всех → сброс уровня',
  16: 'Если играешь за привязанную команду (её капитан) — Сила ↔ Выносливость, иначе ничего (нужна привязка команды)',
  17: 'Фаза 2 (вручную): выбери команду для пересбора характеристик',
  18: 'Интеллект = 5 → +4 влияния, иначе ничего',
  19: 'Фаза 2 (вручную): больше всех лидерства → встреча с имплантером',
  20: 'Если играешь за привязанную команду (её капитан) — Сила ↔ Интеллект, иначе ничего (нужна привязка команды)',
  21: 'Если играешь за привязанную команду (её капитан) — Лидерство ↔ Удача, иначе ничего (нужна привязка команды)',
  22: 'Если играешь за привязанную команду (её капитан) — Интеллект ↔ Удача, иначе ничего (нужна привязка команды)',
  23: 'Если играешь за привязанную команду (её капитан) — Интеллект ↔ Лидерство, иначе ничего (нужна привязка команды)',
  24: 'Если играешь за привязанную команду (её капитан) — Сила ↔ Удача, иначе ничего (нужна привязка команды)',
  25: 'Сумма характеристик > 35 → +5 влияния, +75 опыта, иначе ничего',
  26: 'Сила = 1 → +50 опыта, иначе ничего',
  27: 'Сила больше суммы остальных характеристик → +3 влияния, +75 опыта, иначе ничего',
  28: 'Фаза 2 (вручную): совет 5 интеллекта → +100 опыта; меньше всех → обнуление уровня',
  29: 'Интеллект 3–5 → команда может получить совет (вручную), иначе ничего',
  30: 'Сила > 3 ИЛИ интеллект < 6 → −4 влияния, иначе ничего',
  31: 'Интеллект + сила > 12 → −100 опыта, иначе ничего',
  32: '+2 влияния',
  33: 'Ничего (пустышка)',
  34: 'Ничего (пустышка)',
  35: 'Ничего (пустышка)',
  36: 'Обнуляется 1 случайная характеристика',
  37: 'Обнуляются все характеристики',
  38: 'Согласиться → монета: +5 влияния / обнуление случайной характеристики · Нет: ничего',
  39: 'Удача 6+ → +100 опыта, иначе ничего',
  40: 'Выносливость < 3 → обнуляется сила, иначе +50 опыта',
  41: 'Интеллект 7+ → +5 влияния, иначе −2 влияния',
  42: 'Согласиться → монета: +8 влияния / обнуление всех характеристик · Нет: ничего',
};

export function describe(number: number): string {
  return DESCRIPTIONS[number] ?? 'Разрешается вручную (правило 2-й фазы)';
}

/**
 * Player-facing narrative for the swap encounters (16, 20-24): a fill-in-the-
 * blank question naming the bound team's captain, e.g. «Если в вашей команде
 * есть Шестак Алиса, то _____.». Falls back to a neutral placeholder when no
 * captain is bound yet.
 */
export function swapQuestion(name: string | null | undefined): string {
  const who = name && name.trim() ? name.trim() : 'загаданный игрок';
  return `Если в вашей команде есть ${who}, то _____.`;
}

function statOf(team: TeamSnapshot, s: StatName): { label: string; value: number } {
  return { label: STAT_RU[s], value: team.stats[s] };
}

function randomStat(): StatName {
  return ALL_STATS[Math.floor(Math.random() * ALL_STATS.length)];
}

const YES_NO = [
  { key: 'yes', label: 'Да' },
  { key: 'no', label: 'Нет' },
];

/** A choice encounter: envelope-style open/decline with an effect on "yes". */
function envelope(
  title: string,
  number: number,
  choice: string | undefined,
  yesText: string,
  yesEffect: EncounterEffect,
): EncounterEval {
  const description = describe(number);
  if (!choice) {
    return { number, title, description, relevant: null, choice: { prompt: 'Откроешь?', options: YES_NO }, resolution: null };
  }
  return {
    number,
    title,
    description,
    relevant: null,
    choice: null,
    resolution: choice === 'yes' ? eff(yesText, yesEffect) : none(),
  };
}

/**
 * Evaluate an encounter for a team. Pass `choice` to resolve a choice encounter
 * (coin flips are resolved here, server-side).
 */
export function evaluate(
  number: number,
  title: string,
  team: TeamSnapshot,
  choice?: string,
  targetTeamId?: string | null,
  targetName?: string | null,
): EncounterEval {
  const base = { number, title, description: describe(number) };

  const swap = (a: StatName, b: StatName): EncounterEval => {
    const isTarget = !!targetTeamId && team.id === targetTeamId;
    return {
      ...base,
      // Question format naming the bound captain — the effect stays hidden in
      // the blank until the admin resolves it.
      title: swapQuestion(targetName),
      relevant: null,
      choice: null,
      resolution: isTarget
        ? eff(`${STAT_RU[a]} ↔ ${STAT_RU[b]}: характеристики меняются местами`, { swapStats: [a, b] })
        : none(),
    };
  };

  switch (number) {
    // 1 — старый путник (интеллект)
    case 1: {
      const i = team.stats.intelligence;
      const r =
        i <= 4 ? none() : i <= 7 ? manual('Скажи команде координаты мастера') : manual('Выбери случайный предмет мастера');
      return { ...base, relevant: statOf(team, 'intelligence'), choice: null, resolution: r };
    }
    // 2 — загадочная дама (сила)
    case 2: {
      const s = team.stats.strength;
      const r =
        s <= 4 ? none() : s <= 6 ? manual('Скажи команде координаты диверсанта') : manual('Выбери случайную диверсию');
      return { ...base, relevant: statOf(team, 'strength'), choice: null, resolution: r };
    }
    // 3 — мужчина в очках (выбор + монета)
    case 3: {
      if (!choice) {
        return {
          ...base,
          relevant: null,
          choice: {
            prompt: 'Поможешь? (при согласии — бросок монеты)',
            options: [
              { key: 'agree', label: 'Согласиться' },
              { key: 'decline', label: 'Отказаться' },
            ],
          },
          resolution: null,
        };
      }
      if (choice !== 'agree') return { ...base, relevant: null, choice: null, resolution: none() };
      const heads = Math.random() < 0.5;
      const r = heads
        ? eff('Орёл: −4 влияния', { influence: -4 })
        : eff('Решка: +6 влияния', { influence: 6 });
      return { ...base, relevant: null, choice: null, resolution: r };
    }
    // 4 — странный зверь (выносливость ← «ловкость»)
    case 4: {
      const e = team.stats.endurance;
      const r =
        e <= 4
          ? eff('−1 к силе', { stats: { strength: -1 } })
          : e <= 7
            ? eff('+70 опыта', { experience: 70 })
            : eff('+1 уровень', { level: 1 });
      return { ...base, relevant: statOf(team, 'endurance'), choice: null, resolution: r };
    }
    // 5 — окно в дом (удача)
    case 5: {
      const l = team.stats.luck;
      const r =
        l <= 3 ? none() : l <= 6 ? manual('Скажи команде координаты торговца') : manual('Выбери 2 случайных предмета у торговца');
      return { ...base, relevant: statOf(team, 'luck'), choice: null, resolution: r };
    }
    // 6 — бабуля (лидерство)
    case 6: {
      const l = team.stats.leadership;
      const r =
        l <= 6 ? none() : l <= 8 ? manual('Скажи команде координаты имплантера') : manual('Выбери случайный имплант');
      return { ...base, relevant: statOf(team, 'leadership'), choice: null, resolution: r };
    }
    // 7 — грозный мужчина (сила)
    case 7: {
      const s = team.stats.strength;
      const r =
        s <= 5
          ? eff('−1 к лидерству', { stats: { leadership: -1 } })
          : s <= 7
            ? eff('+100 опыта', { experience: 100 })
            : eff('+1 уровень', { level: 1 });
      return { ...base, relevant: statOf(team, 'strength'), choice: null, resolution: r };
    }
    // 8–13 — конверты
    case 8:
      return envelope(title, number, choice, '+2 влияния', { influence: 2 });
    case 9:
      return envelope(title, number, choice, 'Бомба: −6 влияния', { influence: -6 });
    case 10:
      return envelope(title, number, choice, '+100 опыта', { experience: 100 });
    case 11:
      return envelope(title, number, choice, '−8 влияния', { influence: -8 });
    case 12:
      return envelope(title, number, choice, '+2 влияния', { influence: 2 });
    case 13:
      return envelope(title, number, choice, '+2 влияния', { influence: 2 });
    // 18 — ровно 5 интеллекта
    case 18: {
      const i = team.stats.intelligence;
      const r = i === 5 ? eff('+4 влияния', { influence: 4 }) : none();
      return { ...base, relevant: statOf(team, 'intelligence'), choice: null, resolution: r };
    }
    // 25 — сумма характеристик > 35
    case 25: {
      const sum = sumStats(team);
      const r = sum > 35 ? eff('+5 влияния, +75 опыта', { influence: 5, experience: 75 }) : none();
      return { ...base, relevant: { label: 'Сумма характеристик', value: sum }, choice: null, resolution: r };
    }
    // 26 — ровно 1 сила
    case 26: {
      const s = team.stats.strength;
      const r = s === 1 ? eff('+50 опыта', { experience: 50 }) : none();
      return { ...base, relevant: statOf(team, 'strength'), choice: null, resolution: r };
    }
    // 27 — сила больше суммы остальных характеристик
    case 27: {
      const s = team.stats.strength;
      const rest = sumStats(team) - s;
      const r = s > rest ? eff('+3 влияния, +75 опыта', { influence: 3, experience: 75 }) : none();
      return { ...base, relevant: { label: `Сила vs остальные (${s} / ${rest})`, value: s }, choice: null, resolution: r };
    }
    // 29 — интеллект 3–5 → совет (заглушка)
    case 29: {
      const i = team.stats.intelligence;
      const r = i >= 3 && i <= 5 ? manual('Команда может получить совет от ведущего') : none();
      return { ...base, relevant: statOf(team, 'intelligence'), choice: null, resolution: r };
    }
    // 30 — сила > 3 ИЛИ интеллект < 6 → −4 влияния
    case 30: {
      const cond = team.stats.strength > 3 || team.stats.intelligence < 6;
      const r = cond ? eff('−4 влияния', { influence: -4 }) : none();
      return {
        ...base,
        relevant: { label: `Сила ${team.stats.strength} / Интеллект ${team.stats.intelligence}`, value: team.stats.strength },
        choice: null,
        resolution: r,
      };
    }
    // 31 — интеллект + сила > 12 → −100 опыта
    case 31: {
      const total = team.stats.intelligence + team.stats.strength;
      const r = total > 12 ? eff('−100 опыта', { experience: -100 }) : none();
      return { ...base, relevant: { label: 'Интеллект + Сила', value: total }, choice: null, resolution: r };
    }
    // 16, 20–24 — свопы характеристик по капитану привязанной команды
    case 16:
      return swap('strength', 'endurance');
    case 20:
      return swap('strength', 'intelligence');
    case 21:
      return swap('leadership', 'luck');
    case 22:
      return swap('intelligence', 'luck');
    case 23:
      return swap('intelligence', 'leadership');
    case 24:
      return swap('strength', 'luck');
    // 32 — подарок
    case 32:
      return { ...base, relevant: null, choice: null, resolution: eff('+2 влияния', { influence: 2 }) };

    // 33–35 — пустышки (интрига → ничего)
    case 33:
    case 34:
    case 35:
      return { ...base, relevant: null, choice: null, resolution: none() };
    // 36 — древнее проклятие: обнуляет случайную характеристику
    case 36:
      return {
        ...base,
        relevant: null,
        choice: null,
        resolution: eff('Обнуляется случайная характеристика', { zeroStats: [randomStat()] }),
      };
    // 37 — катаклизм: обнуляет все характеристики
    case 37:
      return {
        ...base,
        relevant: null,
        choice: null,
        resolution: eff('Все характеристики обнуляются', { zeroStats: [...ALL_STATS] }),
      };
    // 38 — сделка с торговцем (выбор + монета: награда или обнуление стата)
    case 38: {
      if (!choice) {
        return { ...base, relevant: null, choice: { prompt: 'Согласишься на сделку?', options: YES_NO }, resolution: null };
      }
      if (choice !== 'yes') return { ...base, relevant: null, choice: null, resolution: none() };
      if (Math.random() < 0.5) {
        return { ...base, relevant: null, choice: null, resolution: eff('Повезло: +5 влияния', { influence: 5 }) };
      }
      const s = randomStat();
      return { ...base, relevant: null, choice: null, resolution: eff(`Обман: обнулена «${STAT_RU[s]}»`, { zeroStats: [s] }) };
    }
    // 39 — фонтан молодости (удача 6+)
    case 39: {
      const r = team.stats.luck >= 6 ? eff('+100 опыта', { experience: 100 }) : none();
      return { ...base, relevant: statOf(team, 'luck'), choice: null, resolution: r };
    }
    // 40 — проверка на прочность (выносливость < 3 → обнуляется сила)
    case 40: {
      const r =
        team.stats.endurance < 3
          ? eff('Обнуляется сила', { zeroStats: ['strength'] })
          : eff('+50 опыта', { experience: 50 });
      return { ...base, relevant: statOf(team, 'endurance'), choice: null, resolution: r };
    }
    // 41 — испытание разума (интеллект 7+ → +5, иначе −2 влияния)
    case 41: {
      const r =
        team.stats.intelligence >= 7
          ? eff('+5 влияния', { influence: 5 })
          : eff('−2 влияния', { influence: -2 });
      return { ...base, relevant: statOf(team, 'intelligence'), choice: null, resolution: r };
    }
    // 42 — ва-банк (выбор + монета: +8 влияния или обнуление всех характеристик)
    case 42: {
      if (!choice) {
        return { ...base, relevant: null, choice: { prompt: 'Рискнёшь всем?', options: YES_NO }, resolution: null };
      }
      if (choice !== 'yes') return { ...base, relevant: null, choice: null, resolution: none() };
      const win = Math.random() < 0.5;
      const r = win
        ? eff('Джекпот: +8 влияния', { influence: 8 })
        : eff('Провал: все характеристики обнулены', { zeroStats: [...ALL_STATS] });
      return { ...base, relevant: null, choice: null, resolution: r };
    }

    // Phase 2 — comparative / name-swap / re-roll: shown as text, resolved manually.
    default:
      return { ...base, relevant: null, choice: null, resolution: manual('Разрешается вручную (правило 2-й фазы)') };
  }
}

function sumStats(team: TeamSnapshot): number {
  const s = team.stats;
  return s.strength + s.intelligence + s.endurance + s.leadership + s.luck;
}
