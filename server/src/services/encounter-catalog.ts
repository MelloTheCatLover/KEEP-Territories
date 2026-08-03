import { StatName } from '../types/team-stats';
import { EncounterEffect } from '../types/encounter';

/**
 * Declarative catalog of the 100 random encounters: 50 negative (1–50) and
 * 50 positive (51–100). Every entry resolves to a real effect on *both*
 * branches — an encounter never ends in «ничего», which is what made the old
 * pool feel pointless.
 *
 * Balance is measured in «влияние-эквивалентах» (eq): 1 характеристика ≈ 3 eq,
 * 20 опыта ≈ 1 eq, 1 уровень ≈ 6 eq. Simulated over the whole pool the halves
 * cancel out: with stats ≈ 2 the negatives average −3.1 eq against +3.0 eq for
 * the positives (drift −0.08 eq per roll), with stats ≈ 4 it is −3.5 / +3.1.
 * The residual pull is the wipe tail (46–50) — deliberately the scariest thing
 * in the pool — mirrored on the other side by the double stat gifts (96–98)
 * and the level jumps (99, 100).
 */

export type Polarity = 'positive' | 'negative';

export type StatPick = StatName | 'random' | 'lowest' | 'highest';

export interface Outcome {
  /** Flavor prefix; the effect itself is rendered from `effect`. */
  flavor?: string;
  effect: EncounterEffect;
  /** Wipe a stat to 0 outright — its points are burned, not refunded. */
  wipe?: StatPick;
  /** Free stat points: they do not eat the team's upgrade pool. */
  gift?: { stat: StatPick; amount: number };
}

export type EncounterSpec =
  /** Unconditional effect. */
  | { kind: 'flat'; outcome: Outcome }
  /** Stat threshold: `stat >= min` passes. Both branches carry an effect. */
  | { kind: 'check'; stat: StatName; min: number; pass: Outcome; fail: Outcome }
  /** Sum of all five stats vs a threshold. */
  | { kind: 'sum'; min: number; pass: Outcome; fail: Outcome }
  /** Player decision; declining is never free of consequence either. */
  | { kind: 'choice'; prompt: string; yes: Outcome; no: Outcome }
  /** Decision + server-side coin flip on «да». */
  | { kind: 'gamble'; prompt: string; chance: number; win: Outcome; lose: Outcome; decline: Outcome };

export interface CatalogEntry {
  number: number;
  title: string;
  polarity: Polarity;
  spec: EncounterSpec;
}

/* ------------------------------------------------------------------ helpers */

const inf = (n: number): EncounterEffect => ({ influence: n });
const exp = (n: number): EncounterEffect => ({ experience: n });
const st = (s: StatName, n: number): EncounterEffect => ({ stats: { [s]: n } });
const mix = (...parts: EncounterEffect[]): EncounterEffect =>
  parts.reduce<EncounterEffect>((acc, p) => ({
    ...acc,
    ...p,
    stats: { ...(acc.stats ?? {}), ...(p.stats ?? {}) },
  }), {});
const out = (effect: EncounterEffect, flavor?: string): Outcome => ({ effect, flavor });
const wipeOut = (stat: StatPick, flavor: string): Outcome => ({ effect: {}, wipe: stat, flavor });
const giftOut = (stat: StatPick, amount: number, flavor: string): Outcome => ({
  effect: {},
  gift: { stat, amount },
  flavor,
});

const flat = (number: number, title: string, polarity: Polarity, effect: EncounterEffect, flavor?: string): CatalogEntry => ({
  number,
  title,
  polarity,
  spec: { kind: 'flat', outcome: out(effect, flavor) },
});

const check = (
  number: number,
  title: string,
  polarity: Polarity,
  stat: StatName,
  min: number,
  pass: Outcome,
  fail: Outcome,
): CatalogEntry => ({ number, title, polarity, spec: { kind: 'check', stat, min, pass, fail } });

/* ----------------------------------------------------------------- negatives */

const NEGATIVE: CatalogEntry[] = [
  flat(1, 'Обвал в старой штольне.', 'negative', st('endurance', -1), 'Отряд вымотан'),
  check(2, 'Ночная засада на тропе.', 'negative', 'strength', 5,
    out(inf(-1), 'Отбились с потерями'),
    out(mix(st('strength', -1), inf(-2)), 'Отряд смят')),
  flat(3, 'Фляга с гнилой водой.', 'negative', exp(-40)),
  check(4, 'Спор у костра перерос в крик.', 'negative', 'leadership', 4,
    out(inf(-2), 'Замяли'),
    out(st('leadership', -1), 'Авторитет просел')),
  flat(5, 'Ложный указатель увёл в сторону.', 'negative', inf(-3)),
  check(6, 'Карманник на рынке.', 'negative', 'luck', 5,
    out(inf(-1), 'Успел схватить за руку'),
    out(inf(-4), 'Кошелёк исчез')),
  flat(7, 'Чертёж порвался на ветру.', 'negative', st('intelligence', -1)),
  check(8, 'Компас врёт.', 'negative', 'intelligence', 6,
    out(exp(-25), 'Сверился по звёздам'),
    out(exp(-60), 'Круг по пустыне')),
  flat(9, 'Ржавая цепь моста лопнула.', 'negative', mix(inf(-2), exp(-25))),
  {
    number: 10,
    title: 'На дороге лежит потемневшая монета. Поднимешь?',
    polarity: 'negative',
    spec: {
      kind: 'gamble',
      prompt: 'Поднять монету? (при согласии — бросок)',
      chance: 0.5,
      win: out(inf(4), 'Монета оказалась счастливой'),
      lose: out(inf(-6), 'Монета проклята'),
      decline: out(inf(-1), 'Прошли мимо, потратив время'),
    },
  },
  flat(11, 'Сборщик податей нашёл вашу стоянку.', 'negative', inf(-4)),
  check(12, 'Песчаная буря.', 'negative', 'endurance', 5,
    out(inf(-1), 'Переждали в укрытии'),
    out(mix(st('endurance', -1), inf(-1)), 'Буря измотала отряд')),
  flat(13, 'Крикун в толпе перетянул людей на себя.', 'negative', st('leadership', -1)),
  check(14, 'Рюкзаки перегружены.', 'negative', 'strength', 6,
    out(exp(-20), 'Дотащили'),
    out(st('strength', -1), 'Надорвались')),
  flat(15, 'Паёк испортился.', 'negative', mix(exp(-30), inf(-1))),
  {
    number: 16,
    title: 'Шулер предлагает сыграть в напёрстки.',
    polarity: 'negative',
    spec: {
      kind: 'gamble',
      prompt: 'Сыграешь? (при согласии — бросок)',
      chance: 0.4,
      win: out(inf(5), 'Раскусили обман и сорвали банк'),
      lose: out(inf(-5), 'Шулер обчистил отряд'),
      decline: out(inf(-1), 'Ушли под насмешки'),
    },
  },
  flat(17, 'Крыша склада протекла.', 'negative', inf(-2)),
  check(18, 'Ошибка в расчётах маршрута.', 'negative', 'intelligence', 5,
    out(inf(-1), 'Пересчитали на ходу'),
    out(exp(-50), 'Полдня потеряно')),
  check(19, 'Бессонная ночь.', 'negative', 'endurance', 4,
    out(exp(-30), 'Продержались'),
    out(st('endurance', -1), 'Отряд валится с ног')),
  flat(20, 'Старый долг перед торговцем.', 'negative', inf(-5)),
  check(21, 'Забыт пароль от тайника.', 'negative', 'intelligence', 4,
    out(inf(-2), 'Вскрыли грубой силой'),
    out(st('intelligence', -1), 'Тайник потерян')),
  check(22, 'Раскол в отряде.', 'negative', 'leadership', 6,
    out(inf(-2), 'Удержали строй'),
    out(mix(st('leadership', -1), inf(-1)), 'Часть людей ушла')),
  flat(23, 'Чёрная кошка перешла дорогу.', 'negative', st('luck', -1)),
  {
    number: 24,
    title: 'Тяжёлая вылазка проверяет отряд целиком.',
    polarity: 'negative',
    spec: {
      kind: 'sum',
      min: 12,
      pass: out(exp(-20), 'Отделались малой кровью'),
      fail: out(mix(exp(-40), inf(-2)), 'Отряду нечем было ответить'),
    },
  },
  check(25, 'Мародёры на хвосте.', 'negative', 'strength', 7,
    out(inf(-1), 'Отогнали'),
    out(mix(inf(-3), exp(-20)), 'Часть груза отбили')),
  flat(26, 'Ядовитый туман в низине.', 'negative', mix(st('endurance', -1), inf(-1))),
  flat(27, 'Спорная граница: сектор оспорен соседями.', 'negative', inf(-3)),
  check(28, 'Генератор заглох.', 'negative', 'intelligence', 7,
    out(exp(-25), 'Завели вручную'),
    out(mix(inf(-2), exp(-40)), 'Ночь без света')),
  check(29, 'Паника на переправе.', 'negative', 'leadership', 5,
    out(inf(-1), 'Успокоили людей'),
    out(st('leadership', -1), 'Переправа сорвана')),
  flat(30, 'Неудачный обмен.', 'negative', mix(inf(-2), exp(-20))),
  flat(31, 'Крысы добрались до припасов.', 'negative', exp(-40)),
  flat(32, 'Слишком тяжёлая ноша.', 'negative', st('strength', -1)),
  check(33, 'Картограф продал вам подделку.', 'negative', 'luck', 6,
    out(inf(-1), 'Заметили подлог'),
    out(inf(-4), 'Шли по чужой карте')),
  flat(34, 'Ссора с патрулём.', 'negative', mix(inf(-3), exp(-20))),
  check(35, 'Переговоры сорваны.', 'negative', 'leadership', 7,
    out(inf(-2), 'Разошлись миром'),
    out(mix(st('leadership', -1), exp(-20)), 'Слово отряда обесценилось')),
  flat(36, 'Ложный след.', 'negative', exp(-50)),
  check(37, 'Заражённая рана.', 'negative', 'endurance', 6,
    out(inf(-1), 'Перевязали'),
    out(mix(st('endurance', -1), exp(-30)), 'Отряд слёг')),
  check(38, 'Утечка информации.', 'negative', 'intelligence', 6,
    out(inf(-2), 'Перекрыли канал'),
    out(st('intelligence', -1), 'Архив ушёл к чужим')),
  flat(39, 'Долгий переход без привала.', 'negative', mix(exp(-30), inf(-2))),
  {
    number: 40,
    title: 'Крепкий незнакомец предлагает пари на силу.',
    polarity: 'negative',
    spec: {
      kind: 'gamble',
      prompt: 'Примешь пари? (при согласии — бросок)',
      chance: 0.5,
      win: out(inf(5), 'Пари выиграно'),
      lose: out(mix(st('strength', -1), inf(-2)), 'Пари проиграно'),
      decline: out(inf(-1), 'Отказ стоил репутации'),
    },
  },
  check(41, 'Тень в переулке.', 'negative', 'luck', 4,
    out(inf(-1), 'Разминулись'),
    out(inf(-3), 'Обобрали в темноте')),
  flat(42, 'Отравленный колодец.', 'negative', mix(st('endurance', -1), exp(-20))),
  flat(43, 'Штраф конгресса.', 'negative', inf(-4)),
  flat(44, 'Антенна сломана.', 'negative', mix(st('intelligence', -1), inf(-1))),
  flat(45, 'Дезертир увёл с собой людей.', 'negative', mix(st('leadership', -1), exp(-20))),
  {
    number: 46,
    title: 'Древнее проклятие настигло отряд.',
    polarity: 'negative',
    spec: {
      kind: 'flat',
      outcome: { ...wipeOut('random', 'Проклятие выжгло одну из сторон отряда'), effect: inf(3) },
    },
  },
  {
    number: 47,
    title: 'Печать забвения: архив выжжен.',
    polarity: 'negative',
    spec: {
      kind: 'flat',
      outcome: { ...wipeOut('intelligence', 'Знания стёрты, но архив успели распродать'), effect: inf(3) },
    },
  },
  {
    number: 48,
    title: 'Клеймо слабости легло на отряд.',
    polarity: 'negative',
    spec: {
      kind: 'flat',
      outcome: { ...wipeOut('strength', 'Сила ушла, остался трофей'), effect: inf(3) },
    },
  },
  {
    number: 49,
    title: 'Пустая жила: слабое место осыпалось.',
    polarity: 'negative',
    spec: {
      kind: 'flat',
      outcome: { ...wipeOut('lowest', 'Самая слабая сторона обнулена, порода пошла в дело'), effect: inf(3) },
    },
  },
  {
    number: 50,
    title: 'Идол в развалинах. Разобьёшь его ради содержимого?',
    polarity: 'negative',
    spec: {
      kind: 'gamble',
      prompt: 'Разбить идол? (при согласии — бросок)',
      chance: 0.5,
      win: out(inf(8), 'В идоле был клад'),
      lose: wipeOut('highest', 'Проклятие вырвалось наружу'),
      decline: out(inf(-1), 'Ушли ни с чем'),
    },
  },
];

/* ----------------------------------------------------------------- positives */

const POSITIVE: CatalogEntry[] = [
  flat(51, 'Полевая находка: крепкие ботинки на весь отряд.', 'positive', st('endurance', 1)),
  check(52, 'Удачный привал.', 'positive', 'endurance', 5,
    out(st('endurance', 1), 'Отряд восстановился полностью'),
    out(mix(exp(30), inf(1)), 'Немного отдохнули')),
  flat(53, 'Чистый родник.', 'positive', exp(40)),
  check(54, 'Речь у костра.', 'positive', 'leadership', 4,
    out(inf(3), 'Люди пошли за вами'),
    out(inf(1), 'Речь выслушали')),
  flat(55, 'Верный указатель сократил путь.', 'positive', inf(3)),
  check(56, 'Кошелёк на дороге.', 'positive', 'luck', 5,
    out(inf(5), 'Кошелёк полон'),
    out(inf(2), 'Пара монет на дне')),
  flat(57, 'Схема неизвестного механизма.', 'positive', st('intelligence', 1)),
  check(58, 'Точный компас.', 'positive', 'intelligence', 6,
    out(exp(60), 'Прошли напрямую'),
    out(mix(exp(25), inf(1)), 'Немного срезали')),
  flat(59, 'Мост укреплён.', 'positive', mix(inf(2), exp(25))),
  {
    number: 60,
    title: 'Счастливая монета у фонтана. Загадаешь желание?',
    polarity: 'positive',
    spec: {
      kind: 'gamble',
      prompt: 'Загадать желание? (при согласии — бросок)',
      chance: 0.5,
      win: out(inf(6), 'Желание сбылось'),
      lose: out(inf(-2), 'Монета утонула зря'),
      decline: out(inf(1), 'Забрали монету себе'),
    },
  },
  flat(61, 'Дар наместника.', 'positive', inf(4)),
  check(62, 'Попутный ветер.', 'positive', 'endurance', 5,
    out(st('endurance', 1), 'Отряд идёт легко'),
    out(inf(3), 'Дорога далась проще')),
  flat(63, 'Голос лидера услышан на площади.', 'positive', st('leadership', 1)),
  check(64, 'Тренировка с ветераном.', 'positive', 'strength', 6,
    out(st('strength', 1), 'Ветеран передал приём'),
    out(mix(exp(30), inf(1)), 'Размялись')),
  flat(65, 'Богатый паёк.', 'positive', mix(exp(30), inf(1))),
  {
    number: 66,
    title: 'Знаток предлагает ставку на вашу удачу.',
    polarity: 'positive',
    spec: {
      kind: 'gamble',
      prompt: 'Поставишь? (при согласии — бросок)',
      chance: 0.6,
      win: out(inf(5), 'Ставка сыграла'),
      lose: out(inf(-3), 'Ставка сгорела'),
      decline: out(inf(1), 'Знаток уважил осторожность'),
    },
  },
  flat(67, 'Склад под замком оказался вашим.', 'positive', inf(2)),
  check(68, 'Верный расчёт.', 'positive', 'intelligence', 5,
    out(mix(exp(50), inf(1)), 'Расчёт сошёлся'),
    out(mix(exp(20), inf(1)), 'Прикинули на глаз')),
  check(69, 'Крепкий сон в тепле.', 'positive', 'endurance', 4,
    out(exp(40), 'Выспались и наверстали'),
    out(st('endurance', 1), 'Тело наконец отдохнуло')),
  flat(70, 'Старый долг вернули с процентами.', 'positive', inf(5)),
  check(71, 'Найден шифр.', 'positive', 'intelligence', 4,
    out(st('intelligence', 1), 'Шифр разгадан'),
    out(mix(exp(30), inf(1)), 'Разобрали половину')),
  check(72, 'Сплочение отряда.', 'positive', 'leadership', 6,
    out(mix(st('leadership', 1), inf(1)), 'Отряд стал единым'),
    out(inf(2), 'Настроение поднялось')),
  flat(73, 'Белая кошка перешла дорогу.', 'positive', st('luck', 1)),
  {
    number: 74,
    title: 'Вылазка на равных: пригодилось всё разом.',
    polarity: 'positive',
    spec: {
      kind: 'sum',
      min: 12,
      pass: out(mix(inf(3), exp(40)), 'Отряд взял всё'),
      fail: out(exp(30), 'Взяли, что смогли'),
    },
  },
  check(75, 'Трофеи разбитых мародёров.', 'positive', 'strength', 7,
    out(inf(5), 'Забрали всё'),
    out(inf(3), 'Забрали, что унесли')),
  flat(76, 'Чистый воздух гор.', 'positive', mix(st('endurance', 1), inf(1))),
  flat(77, 'Границу признали соседи.', 'positive', inf(3)),
  check(78, 'Генератор починен.', 'positive', 'intelligence', 7,
    out(mix(inf(2), exp(50)), 'Свет и связь на всю ночь'),
    out(exp(25), 'Завели ненадолго')),
  check(79, 'Спокойная переправа.', 'positive', 'leadership', 5,
    out(st('leadership', 1), 'Отряд прошёл как один'),
    out(inf(2), 'Переправились без потерь')),
  flat(80, 'Выгодный обмен.', 'positive', mix(inf(2), exp(20))),
  flat(81, 'Тайник с запасами.', 'positive', exp(40)),
  flat(82, 'Груз распределён верно.', 'positive', st('strength', 1)),
  check(83, 'Честный картограф.', 'positive', 'luck', 6,
    out(inf(4), 'Отдал лучшую карту'),
    out(inf(2), 'Показал дорогу')),
  flat(84, 'Дружба с патрулём.', 'positive', mix(inf(3), exp(20))),
  check(85, 'Переговоры удались.', 'positive', 'leadership', 7,
    out(mix(st('leadership', 1), exp(20)), 'Условия ваши'),
    out(inf(3), 'Сошлись на середине')),
  flat(86, 'Верный след привёл к цели.', 'positive', exp(50)),
  check(87, 'Полевой лазарет.', 'positive', 'endurance', 6,
    out(st('endurance', 1), 'Отряд как новый'),
    out(mix(exp(30), inf(1)), 'Раны обработаны')),
  check(88, 'Перехвачен чужой сигнал.', 'positive', 'intelligence', 6,
    out(mix(st('intelligence', 1), inf(2)), 'Шифровка прочитана'),
    out(inf(2), 'Записали, но не разобрали')),
  flat(89, 'Короткий путь через ущелье.', 'positive', mix(exp(30), inf(2))),
  {
    number: 90,
    title: 'Спор с силачом: кто дотащит бревно.',
    polarity: 'positive',
    spec: {
      kind: 'gamble',
      prompt: 'Поспоришь? (при согласии — бросок)',
      chance: 0.5,
      win: out(mix(st('strength', 1), inf(2)), 'Бревно ваше'),
      lose: out(inf(-2), 'Силач оказался крепче'),
      decline: out(inf(1), 'Разошлись по-доброму'),
    },
  },
  check(91, 'Фонарь осветил переулок.', 'positive', 'luck', 4,
    out(inf(3), 'Нашли схрон'),
    out(inf(2), 'Прошли спокойно')),
  flat(92, 'Целебный источник.', 'positive', mix(st('endurance', 1), exp(20))),
  flat(93, 'Награда конгресса.', 'positive', inf(4)),
  flat(94, 'Антенна починена.', 'positive', mix(st('intelligence', 1), inf(1))),
  flat(95, 'Новобранец просится в отряд.', 'positive', mix(st('leadership', 1), exp(20))),
  {
    number: 96,
    title: 'Благословение древних.',
    polarity: 'positive',
    spec: { kind: 'flat', outcome: giftOut('random', 2, 'Древние щедро одарили отряд') },
  },
  {
    number: 97,
    title: 'Наставник подтягивает слабое место.',
    polarity: 'positive',
    spec: { kind: 'flat', outcome: giftOut('lowest', 2, 'Слабое место подтянуто') },
  },
  {
    number: 98,
    title: 'Сильная сторона отточена до предела.',
    polarity: 'positive',
    spec: { kind: 'flat', outcome: giftOut('highest', 2, 'Сильная сторона отточена') },
  },
  flat(99, 'Богатая жила: отряд поднялся на голову выше.', 'positive', { level: 1 }, 'Скачок'),
  {
    number: 100,
    title: 'Ва-банк удачи: поставишь всё на один бросок?',
    polarity: 'positive',
    spec: {
      kind: 'gamble',
      prompt: 'Рискнёшь? (при согласии — бросок)',
      chance: 0.5,
      win: out({ level: 1 }, 'Джекпот'),
      lose: out(inf(-4), 'Ставка сгорела'),
      decline: out(inf(1), 'Осторожность тоже награда'),
    },
  },
];

export const CATALOG: CatalogEntry[] = [...NEGATIVE, ...POSITIVE];

export const CATALOG_BY_NUMBER: ReadonlyMap<number, CatalogEntry> = new Map(
  CATALOG.map((e) => [e.number, e]),
);

/** Numbers 901+ are per-team roster checks generated from the season roster. */
export const ROSTER_NUMBER_BASE = 901;

export function isRosterNumber(n: number): boolean {
  return n >= ROSTER_NUMBER_BASE;
}
