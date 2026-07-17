# Архитектура

Документ описывает **как устроена система**, а не из каких технологий собрана. Стек — в [README](../README.md).

---

## 1. Общая схема

```
┌────────────────┐      HTTPS/JSON      ┌────────────────┐      pg-pool       ┌─────────────┐
│   Браузер      │  ◀──────────────▶    │   API-сервер    │  ◀──────────────▶  │ PostgreSQL  │
│  (SPA, React)  │   Bearer-JWT          │   (Express)    │   параметр. SQL    │             │
└────────────────┘                       └────────────────┘                    └─────────────┘
```

Stateless API. Состояние игры живёт в БД. Клиент держит только JWT в `localStorage` и in-memory кеш текущего пользователя.

---

## 2. Слоёная архитектура сервера

```
HTTP request
    │
    ▼
┌─────────────────────────────────────────┐
│  Middleware                             │  authenticate → requireAdmin / requireTeamRole
│  (JWT, RBAC, validate, errorHandler)    │  validate (UUID, body shape)
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Route                                   │  тонкий, маршрутизация → controller
│  routes/*.routes.ts                     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Controller                              │  парсинг и валидация ВХОДА
│  controllers/*.controller.ts            │  HTTP-семантика (статусы, форматы)
│                                          │  НЕ ходит в БД напрямую
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Service                                 │  бизнес-логика, инварианты
│  services/*.service.ts                  │  транзакции, SELECT FOR UPDATE
│                                          │  только сервис трогает БД
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  PostgreSQL                              │  CHECK / UNIQUE / partial UNIQUE
│  + параметризованные запросы            │  — последняя линия обороны
└─────────────────────────────────────────┘
    │
    ▼
errorHandler → { error: "..." } + HTTP-код
```

**Ключевые принципы:**
- Без ORM. SQL — параметризованный (`$1, $2`), что исключает SQL-инъекции и держит запросы прозрачными.
- Любая мутация нескольких таблиц — внутри транзакции (`BEGIN/COMMIT/ROLLBACK` + `client.release()` в `finally`).
- Конкурентные мутации секторов и заявок защищены `SELECT … FOR UPDATE`.
- Бизнес-правила реализованы **трижды**: на клиенте (UX), в сервисе (логика), в БД (CHECK/UNIQUE). Каждый уровень — независимая защита.
- Ошибки бросают `AppError(status, message)` и собираются глобальным `errorHandler` в единый формат `{ error: "..." }`.

---

## 3. Клиентская архитектура (feature-based)

```
client/src/
├── features/          ⟵ ВЕРТИКАЛЬНЫЕ срезы: всё, что нужно фиче, рядом
│   ├── auth/          AuthContext (JWT, /me), guards, login, register
│   ├── map/           карта, действия, страница сектора, drop, task wheel
│   ├── team/          страница команды, join/create, апгрейды
│   ├── trophies/      8 кубков (минималистичный рендер)
│   ├── admin/         хаб + 6 подстраниц
│   └── navigation/    Header
└── shared/            ⟵ ГОРИЗОНТАЛЬНЫЕ примитивы
    ├── api/           fetch-обёртка + ApiError + Bearer
    └── ui/            Button, Card, Input, ErrorBanner, AppLayout
```

**Внутри каждой фичи:**
- `*-api.ts` — единственная точка обращения к серверу. Компоненты не зовут `fetch` напрямую.
- `types.ts` — TS-зеркало серверных типов.
- React-компоненты — функциональные, локальный `useState`. Единственный глобальный контекст — `AuthContext`.

**Маршрутизация** — React Router data-router, `createBrowserRouter`. Guards: `ProtectedRoute` (требует JWT), `GuestRoute` (если есть JWT — на карту). Проверка `role === 'admin'` — внутри страниц.

---

## 4. Жизненный цикл действия (главный сценарий)

```
1. Юзер кликает свободный/соседний сектор на карте
2. SectorActionModal локально считает доступные действия
   (статус сектора, владелец, фортификация, adjacency)
3. POST /api/sectors/:id/action/start { action_type }
4. Сервер в одной транзакции:
   ▸ SELECT FOR UPDATE сектор
   ▸ validateActionForSector + adjacency check
   ▸ guard: одна pending на сектор + одна pending на команду
   ▸ buildTaskPool: sector_tasks → fallback sectors.task_id → fallback all by difficulty
   ▸ pickRandom — победитель
   ▸ UPDATE sectors SET status='capturing', current_action_type=...
   ▸ INSERT task_submission(status='pending')
5. Сервер возвращает { submission, task_pool }
6. Клиент крутит TaskWheel (Web Animations API), останавливается на победителе
7. Клиент → /sectors/:id — команда видит задание
8. Команда показывает решение преподавателю-админу
9. Админ: POST /api/submissions/:id/approve  ИЛИ  /reject { comment }
   ▸ approve → applyApprovedEffect
   ▸ reject → revertPendingEffect
10. Альтернатива: команда сама делает POST /submissions/:id/drop
    ▸ team_penalties += floor(reward/2) (влияние + опыт)
    ▸ если уровень упал — DELETE N случайных team_stat_upgrades
    ▸ submission → rejected
```

---

## 5. Доменная модель

```
users ──► teams ──► sectors (home_base)
   │         │  ▲       ▲
   │         │  └──── sector_captures (источник правды для опыта)
   │         │  └──── sector_tasks ── tasks
   │         │
   │         ├── team_stat_upgrades   (5 характеристик; row per +1)
   │         ├── team_penalties        (drop-штрафы)
   │         └── team_adjustments     (админский оверрайд: дельты)
   │
   └──► task_submissions (sector_id, team_id, user_id, task_id, action_type, status)
```

**Производные значения никогда не хранятся**, они вычисляются:
- `influence` = `Σ sectors.captured_by + adjustments − penalties` (≥ 0).
- `experience` = `Σ sector_captures.reward + adjustments − penalties` (≥ 0).
- `level` = жадный цикл по порогам `base_exp_threshold + i · exp_step` из `game_settings`.
- `upgrade_points` = `level − COUNT(team_stat_upgrades) + adjustments` (≥ 0).
- `stats[name]` = `COUNT(team_stat_upgrades WHERE stat_name = ...)`.

Это даёт **аудит** (каждый бонус — отдельная строка) и **обратимость** (drop удаляет одну случайную строку — без перерасчёта чисел).

---

## 6. Инварианты, защищённые на уровне БД

| Инвариант                                          | Механизм                                                                 |
|----------------------------------------------------|--------------------------------------------------------------------------|
| Команда живёт ⇔ владеет своей home base            | partial UNIQUE `(home_team_id) WHERE is_home_base AND home_team_id NOT NULL` |
| Одна pending на сектор                             | partial UNIQUE `(sector_id) WHERE status='pending'`                       |
| Одна pending на команду                            | partial UNIQUE `(team_id) WHERE status='pending'`                         |
| Цвет команды уникален и из палитры из 8 цветов     | partial UNIQUE + CHECK `color IN (...)`                                   |
| Home base не имеет номера; обычный сектор — имеет  | CHECK `is_home_base ⇔ number IS NULL` + UNIQUE `(difficulty, number)`     |
| Состояние сектора согласовано                      | CHECK `status_consistency` (status ↔ capturing_by ↔ captured_by)          |
| Уровень укрепления 0..3                            | CHECK `fortification_level BETWEEN 0 AND 3`                               |
| Home base всегда принадлежит своей команде         | CHECK `is_home_base = TRUE ⇒ captured_by = home_team_id`                  |

Гонки на этих ограничениях ловятся в сервисе: код `23505` (UNIQUE) → HTTP 409, `23514` (CHECK) → HTTP 400 с человекочитаемым сообщением.

---

## 7. Карта

- Гексагональное поле с аксиальными координатами `(q, r)`, pointy-top рендер.
- Генерация из одного из двух **фиксированных пресетов** (`map-generator.service.ts`, выбор в админке с SVG-превью, `GET /sectors/admin/presets`):
  - **classic6** — радиус 4, 61 сектор: ядро → hard ×6 → medium/особые ×12 → medium с easy-углами ×18 → внешнее easy-кольцо с 6 home_base в углах. Потолок — 6 команд.
  - **ring8** — 79 секторов: тот же радиус 4, но 8 home_base равномерно по внешнему кольцу (каждая 3-я клетка, гекс-дистанция 3 между соседними), кольцо 3 полностью medium, плюс частичное пятое кольцо — «лепестки» easy снаружи каждой базы. Потолок — 8 команд.
- В обоих пресетах 6 особых (синих) секторов через один на кольце 2.
- Привязка заданий при генерации: easy — 6 случайных из пула, medium — 5, hard — весь hard-пул, core — `task_id`; home_base и особые без заданий (не захватываются обычным действием).
- Нумерация внутри сложности — последовательная по клеткам пресета (home base без номера).
- Соседство строго аксиальное: 6 соседей `(±1, 0), (0, ±1), (+1, −1), (−1, +1)`.

---

## 8. Транзакционные границы

Каждая бизнес-операция, мутирующая несколько таблиц, обёрнута в одну транзакцию с явным `FOR UPDATE` на ключевых строках:

| Операция                  | Лочит                                                                                     |
|---------------------------|-------------------------------------------------------------------------------------------|
| Создание команды           | home-base сектор                                                                          |
| Старт действия             | сектор + проверка обоих partial UNIQUE pending                                            |
| Approve/Reject             | submission                                                                                 |
| Drop                       | submission + сектор + строки `team_stat_upgrades` при потере уровня                       |
| Выход последнего капитана  | команда (каскадная очистка submission, sector_captures, секторов команды)                 |
| Админский PATCH/DELETE     | команда                                                                                    |

---

## 9. Безопасность и роли

- **JWT** содержит только `{userId, email}`. Глобальная роль (`student | admin`) и роль в команде (`captain | member`) **всегда** перечитываются из БД на каждый запрос — нельзя «застрять» в старой роли.
- **`authenticate`** middleware проверяет токен → кладёт `req.user`.
- **`requireAdmin`** — DB-чек `users.role='admin'`, бросает 403.
- **`requireTeamRole('captain')`** — для трансфера капитанства.
- На уровне фичи дополнительно проверяется, что юзер действует от имени **своей** команды (drop, апгрейд статов).
- На фронте: `ProtectedRoute` + проверки роли в админских страницах. Это только UX — сервер всё равно отвергнет неавторизованный запрос.

---

## 10. Миграции и сидинг

- Раннер (`migrate.ts`) — идемпотентный: ведёт служебную таблицу `_migrations`, не запускает уже применённую миграцию повторно.
- Файлы по схеме `NNN_*.sql`, сортировка по имени.
- Каждая миграция оборачивается в `BEGIN/COMMIT` раннером.
- Сидинг данных (стартовый набор заданий) — внутри миграций, что делает «свежий клон → готовая среда» одной командой (`npm run migrate`).
- `npm run seed:demo` — отдельная утилита: создаёт 3 demo-команды на свободных home_base + соседние сектора (нужна сгенерированная карта).

---

## 11. Дизайн-система

- Все цвета — CSS-переменные (`tokens.css`) + JS-зеркало (`design-tokens.ts`).
- Палитра команд — 8 фиксированных тонов; в коде нельзя писать hex напрямую, только через токены. Это гарантирует совпадение цвета между картой, страницей команды, бейджем submission и кубком.
- Сложности секторов имеют свой набор токенов (`difficulty-{slug}`).
- Тёмная тема основная.

---

## Сводка одним абзацем

> Слойная backend-архитектура без ORM: тонкие маршруты, валидирующие контроллеры, сервисы как единственный путь к БД с явными транзакциями и `FOR UPDATE`. Производные значения (влияние, опыт, уровень, очки апгрейда, статы) **никогда не хранятся** — они выводятся из исходных таблиц (`sector_captures`, `team_stat_upgrades`, `team_penalties`, `team_adjustments`). Бизнес-инварианты дублируются на трёх уровнях: UI → service → DB-CHECK/UNIQUE, гонки маппятся в осмысленные HTTP-коды. Frontend организован вертикальными feature-срезами с общими UI-примитивами и единым HTTP-клиентом. Игровое поле — настраиваемые гекс-кольца с инвариантами «одна home_base на команду», «одна pending заявка на команду и сектор», «цвет команды из палитры из 8 тонов», защищёнными partial UNIQUE и CHECK.
