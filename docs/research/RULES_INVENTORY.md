# Инвентаризация игровых правил КТП

Исследовательский документ для ВКР (архитектура изменяемых во время игры правил).
Только факты, сверенные с кодом ветки `main` на коммите `ee20ba0`. Предложений по
архитектуре и рефакторингу здесь нет.

Правила оформления:

- Все пути даны от корня репозитория. Ссылка `файл:строка` или `файл:начало-конец`.
- **НЕЯСНО** — утверждение, которое не удалось подтвердить кодом.
- «Председатель» = пользователь с `users.role = 'admin'` (`server/src/migrations/018_add_role_to_users.sql:3`).
- Термины домена — по `docs/DOMAIN.md`; расхождения документа с кодом вынесены в раздел 9.

---

## 0. Таксономия стадий

Исходные стадии S1–S8 — из постановки задачи. Две стадии добавлены, потому что
найденные в коде точки не ложатся в исходный набор:

| ID | Стадия | Примечание |
|---|---|---|
| **S0** | **Разведка до действия** — вызов без заявки, до `startAction` | **Новая.** `peekSector` не связан ни с какой заявкой (`server/src/services/submission.service.ts:1421-1524`), поэтому в S3 («между стартом и решением») не попадает |
| S1 | Допуск: можно ли начать действие на секторе | |
| S2 | Старт: пул заданий, выбор задания, смена состояния сектора | |
| S3 | До решения: реролл, розыгрыш/разрешение встречи, всё между стартом и решением | |
| S4 | Одобрение: эффект, награды, запись `sector_captures` | |
| S5 | Отклонение / сброс: откат, штрафы | |
| S6 | Агрегация: формулы влияния / опыта / уровня / характеристик | |
| S7 | Уровень сессии: вне цикла действия (съезд, кнопки председателя, лавки, генерация карты) | |
| S8 | Представление: только клиент | |
| **S9** | **Серверная проекция при чтении** — вычисление флагов и порядка в SELECT без изменения состояния | **Новая.** Пример: `DETAILS_SELECT` считает `rerolls_max`, `extra_reroll`, `queue_priority` на каждом чтении (`server/src/services/submission.service.ts:647-707`), `getPending` сортирует очередь (`server/src/services/submission.service.ts:838-845`) |

---

## 1. Сквозные факты (общие для всех механик)

**1.1. Поле водит только председатель.** Старт действия и разведка — `requireAdmin`
(`server/src/routes/sector.routes.ts:31-32`), одобрение, отклонение, сброс, реролл — `requireAdmin` (`server/src/routes/submission.routes.ts:11-15`). Команда определяется параметром `team_id` в `resolveActingTeam` (`server/src/services/submission.service.ts:224-250`); без него — членство пользователя, и капитану действия на поле запрещены (`server/src/services/submission.service.ts:263-266`).

**1.2. Каналы очков (S6).** Влияние и опыт нигде не хранятся числом — только выводятся
SQL-выражениями `influenceExpr` / `experienceExpr` (`server/src/services/score-sql.ts:18-34`, `server/src/services/score-sql.ts:41-57`). Источники:

| Канал | Таблица / колонка | Влияние | Опыт |
|---|---|---|---|
| Удерживаемые сектора | `sectors.captured_by_team_id`, `difficulty_levels.influence_reward`, `sectors.reward_multiplier`, `sectors.no_reward`, `sectors.is_special` | да (`server/src/services/score-sql.ts:21-25`) | нет |
| Уровни укрепления удерживаемых | `sectors.fortification_level` | да, `FLOOR(reward·mult/2)·level` (`server/src/services/score-sql.ts:26-30`) | нет |
| Журнал захватов | `sector_captures` × текущий `sectors.reward_multiplier` | нет | да (`server/src/services/score-sql.ts:44-48`) |
| Журнал укреплений | `sector_fortification_awards` | нет | да, `FLOOR(exp·mult/2)` за строку (`server/src/services/score-sql.ts:49-53`) |
| Особые события | `special_sector_awards` | да (`server/src/services/score-sql.ts:31`) | да (`server/src/services/score-sql.ts:54`) |
| Штрафы | `team_penalties` (`CHECK influence >= 0`, `experience >= 0`: `server/src/migrations/029_team_penalties.sql:8-9`) | минус (`server/src/services/score-sql.ts:32`) | минус (`server/src/services/score-sql.ts:55`) |
| Правки | `team_adjustments.influence_delta / experience_delta` (одна строка на команду, PK `team_id`: `server/src/migrations/031_team_adjustments.sql:8`) | плюс (`server/src/services/score-sql.ts:33`) | плюс (`server/src/services/score-sql.ts:56`) |

Оба выражения обёрнуты в `GREATEST(0, …)` (`server/src/services/score-sql.ts:19-20`, `server/src/services/score-sql.ts:42-43`).

**1.3. Опыт захвата пересчитывается по текущему множителю.** `experienceExpr` умножает
*историческую* строку `sector_captures` на *текущее* значение `sectors.reward_multiplier`
(`server/src/services/score-sql.ts:44-48`). Колонку переписывают: каждое одобрение захвата
(`server/src/services/submission.service.ts:915-920`) и выключение ×1.5 для всех секторов
(`server/src/services/game-settings.service.ts:114-116`). Следствие по коду: опыт ранее
захватывавших этот сектор команд меняется задним числом. Отдельной записи множителя на
момент захвата нет (`server/src/migrations/008_create_sector_captures.sql:1-6`).

**1.4. Паттерн «заряженных» эффектов.** Три журнала устроены одинаково: запись со
статусом `applied | armed | consumed | cancelled`, снятие через `takeArmed` + `consume`
внутри транзакции действия.

| Журнал | Миграция | `takeArmed` | `consume` |
|---|---|---|---|
| `team_diversions` (по жертве `target_team_id`) | `server/src/migrations/076_diversions.sql:18-45` | `server/src/services/diversion.service.ts:416-430` | `server/src/services/diversion.service.ts:433-447` |
| `team_purchases` (+ `charges_left`) | `server/src/migrations/078_purchases.sql:11-47` | `server/src/services/purchase.service.ts:660-674` (`charges_left > 0`) | `server/src/services/purchase.service.ts:751-766` (декремент зарядов) |
| `team_law_effects` | `server/src/migrations/079_laws.sql:15-40` | `server/src/services/law.service.ts:676-690` | `server/src/services/law.service.ts:693-706` |

Все три `takeArmed` берут старейшую запись с `FOR UPDATE SKIP LOCKED`. Уникальности
«один armed-эффект вида на команду» в БД нет — есть только частичные индексы
`WHERE status = 'armed'` без `UNIQUE` (`server/src/migrations/076_diversions.sql:49-51`, `server/src/migrations/078_purchases.sql:51-53`, `server/src/migrations/079_laws.sql:45-47`); дубли отсекаются проверками в сервисах (см. записи).

**1.5. Аудит.** `audit.record` вызывается только из контроллеров, всегда **после**
возврата сервиса (т.е. после `COMMIT`) и без передачи `client`, т.е. отдельным запросом через
пул. `record` глотает ошибки (`server/src/services/audit.service.ts:11-31`). Ни один
сервис `audit.record` не вызывает. Сводка — раздел 6.

**1.6. Сезонность.** Команды и сектора привязаны к сезону (`server/src/migrations/036_scope_teams_sectors_by_season.sql:5-18`), активный сезон один (`server/src/migrations/035_create_seasons_and_rosters.sql:35`). Журналы эффектов несут `season_id`; `sector_captures`, `task_submissions`, `team_penalties`, `team_adjustments` — нет (сезон через `team_id`).

**1.7. Базовые инварианты сектора.**
- `sectors_status_consistency` (`server/src/migrations/011_update_sectors_constraint.sql:3`): `free` ⇒ нет владельца и захватчика; `capturing` ⇒ есть `capturing_by_team_id` и `capture_started_at`; `captured` ⇒ есть `captured_by_team_id`.
- `sectors_fortification_range` 0..3 (`server/src/migrations/015_alter_sectors_add_map_columns.sql:11-12`).
- `sectors_home_base_owner`: база принадлежит своей команде (`server/src/migrations/015_alter_sectors_add_map_columns.sql:14-15`).
- База/особый ⇔ `number IS NULL` (`server/src/migrations/044_special_sectors_number_null.sql:5-8`).
- Одна `pending`-заявка на сектор — `UNIQUE` (`server/src/migrations/019_create_task_submissions.sql:23-25`). Уникальный индекс «одна заявка на команду» (`server/src/migrations/024_one_pending_per_team.sql:1-3`) снят миграцией 078 (`server/src/migrations/078_purchases.sql:59-62`).

---

## 2. Базовый цикл действия (опорная механика)

### М00. Захват / перезахват / укрепление / снятие укрепления

1. **Термин:** захват, перезахват, укрепление (`docs/DOMAIN.md:33-37`).
2. **Триггер:** председатель за команду.
3. **Стадии:**
   - S1 → `startAction` (`server/src/services/submission.service.ts:416-645`): `is_special` (`440-442`), `validateActionForSector` (`server/src/services/submission.service.ts:370-411`), досягаемость (`472-478`), пробитие (`484-494`), `pending` на сектор (`496-502`), `pending` на команду (`506-519`).
   - S2 → пул `buildTaskPool` (`server/src/services/submission.service.ts:270-296`: `sector_tasks` → `sectors.task_id` → все задания сложности), выбор `pickRandom` (`server/src/services/submission.service.ts:365-368`), сектор `capturing` для (пере)захвата или только `current_action_type` (`server/src/services/submission.service.ts:537-552`), вставка `task_submissions` (`554-560`).
   - S4 → `approve` (`server/src/services/submission.service.ts:1045-1095`) → `applyApprovedEffect` (`server/src/services/submission.service.ts:877-1012`).
   - S5 → `reject` (`server/src/services/submission.service.ts:1097-1141`) → `revertPendingEffect` (`server/src/services/submission.service.ts:1014-1034`); сброс — М39.
4. **Состояние:** `sectors.status, captured_by_team_id, capturing_by_team_id, capture_started_at, current_action_type, fortification_level, no_reward, reward_multiplier, graffiti_team_id`; `task_submissions.*`; `sector_captures`; `sector_fortification_awards`; `sector_peeks`; `team_purchase_tokens`.
5. **Время жизни:** одно действие; результат — постоянный (журналы).
6. **Случайность:** выбор задания `Math.random` (`server/src/services/submission.service.ts:367`); результат — `task_submissions.task_id`; сам пул не сохраняется (только в ответе, `625`).
7. **Инварианты:** 1.7; `FOR UPDATE` сектора (`432`, `882`) и заявки (`1055`, `1107`); проверка `status !== 'pending'` (`1063`, `1115`).
8. **Взаимодействия:** почти все механики разделов 3–5 врезаны сюда; список врезок — раздел 8.
9. **Аудит:** `submission.<action_type>` (`server/src/controllers/submission.controller.ts:33-41`), `sector.<action_type>` (`server/src/controllers/submission.controller.ts:134-142`), `submission.reject` (`server/src/controllers/submission.controller.ts:160-168`) — вне транзакции.
10. **Клиент:** `client/src/features/map/SectorActionModal.tsx` (`computeAvailable` — `client/src/features/map/SectorActionModal.tsx:81-196`), `client/src/features/map/SectorPage.tsx`, `client/src/features/map/AdminReviewQueue.tsx`, `client/src/features/map/MapPage.tsx`, `client/src/features/map/HexMap.tsx`.

---

## 3. Съезд и законы

### М01. Съезд и текстовые законы

1. **Термин:** съезд, закон (`docs/DOMAIN.md:14-17`).
2. **Триггер:** председатель.
3. **Стадии:** S7 → `createLaw` (`server/src/services/congress.service.ts:61-72`), `updateLawText` (`74-84`), `setLawStatus` (`86-105`), `deleteLaw` (`141-146`); S7 чтение → `getTeamInfluence` (`8-19`), `listPublicLaws` (`31-40`).
4. **Состояние:** `congress_laws(season_id, text, status, decided_at, vetoed_by_team_id)` (`server/src/migrations/050_create_congress_laws.sql:4-12`, `server/src/migrations/062_veto_and_merchant_tokens.sql:13-19`).
5. **Время жизни:** сезон. Сущности «съезд» в схеме нет: закон привязан к сезону (`server/src/migrations/050_create_congress_laws.sql:6`).
6. **Случайность:** нет.
7. **Инварианты:** `CHECK status IN ('pending','accepted','rejected','vetoed')` (`server/src/migrations/062_veto_and_merchant_tokens.sql:14-16`). Контроллер не пускает `vetoed` в общий сеттер (`server/src/controllers/congress.controller.ts:16`, `93-96`).
8. **Взаимодействия:** текст закона и его статус не читаются ни одним механическим законом: `congress_laws` упоминается только в `server/src/services/congress.service.ts` (механические законы М03–М09 ставятся отдельными эндпоинтами без проверки статуса текстового закона — `server/src/services/congress.service.ts:156-164`, `server/src/services/law.service.ts:274-338`).
9. **Аудит:** `congress.law_create` (`server/src/controllers/congress.controller.ts:52-59`), `congress.law_edit` (`73-80`), `congress.law_decide` (`98-106`), `congress.law_delete` (`142-148`) — вне транзакции (сервисы без транзакции вовсе).
10. **Клиент:** `client/src/features/admin/AdminCongressPage.tsx`, `client/src/features/admin/congress-api.ts`, `client/src/features/laws/LawsPage.tsx`.

### М02. Право вето

1. **Термин:** право вето (`docs/DOMAIN.md:50-53`).
2. **Триггер:** председатель (`POST /congress/laws/:id/veto`, `server/src/routes/congress.routes.ts:25`); команда-владелец вето вычисляется сервером.
3. **Стадии:** S7 → `vetoLaw` (`server/src/services/congress.service.ts:112-139`).
4. **Состояние:** читает `congress_laws.status` сезона, влияние всех команд (`influenceExpr` через `getTeamInfluence`, `server/src/services/congress.service.ts:8-19`); пишет `status='vetoed', decided_at, vetoed_by_team_id` (`129-134`).
5. **Время жизни:** до смены статуса. `setLawStatus` безусловно обнуляет `vetoed_by_team_id` (`server/src/services/congress.service.ts:93-100`), после чего вето снова доступно.
6. **Случайность:** нет. Ничья по влиянию решается `ORDER BY influence DESC, t.name ASC` (`server/src/services/congress.service.ts:15`).
7. **Инварианты:** «одно вето» — сервисная проверка на весь сезон, не на съезд (`server/src/services/congress.service.ts:115-121`); в БД ограничения нет. Проверка и `UPDATE` — два отдельных запроса без транзакции.
8. **Взаимодействия:** читает М00/все каналы влияния (1.2). Лидерство не читается (см. М33).
9. **Аудит:** `congress.law_veto` (`server/src/controllers/congress.controller.ts:120-128`) — после.
10. **Клиент:** `client/src/features/admin/AdminCongressPage.tsx`, `client/src/features/admin/congress-api.ts`, `client/src/features/laws/LawsPage.tsx`.

### М03. Свинский поступок

1. **Термин:** в `docs/DOMAIN.md` отсутствует; в коде — «Свинский поступок» (`server/src/services/congress.service.ts:150-155`).
2. **Триггер:** председатель (`server/src/routes/congress.routes.ts:30`).
3. **Стадии:** S7 → `piggishDeed` (`server/src/services/congress.service.ts:156-164`).
4. **Состояние:** пишет по одной строке `team_purchase_tokens(sector_id NULL, merchant_type 'saboteur')` каждой команде сезона.
5. **Время жизни:** жетон — до траты (М12).
6. **Случайность:** нет.
7. **Инварианты:** `UNIQUE(team_id, sector_id)` не мешает — `NULL` различны (`server/src/migrations/055_create_merchants.sql:19-21`). Повторный вызов выдаёт ещё по жетону — проверки идемпотентности нет.
8. **Взаимодействия:** питает М28 (жетон диверсанта тратит `spendSaboteurToken`, `server/src/services/diversion.service.ts:181-199`).
9. **Аудит:** `congress.piggish_deed` (`server/src/controllers/congress.controller.ts:158-164`) — после; одиночный `INSERT … SELECT`, транзакции нет.
10. **Клиент:** `client/src/features/admin/AdminCongressPage.tsx`, `client/src/features/admin/congress-api.ts`.

### М04. Землетрясение

1. **Термин:** в `docs/DOMAIN.md` отсутствует; «Землетрясение» (`server/src/services/congress.service.ts:173-180`, `server/src/migrations/064_earthquake_no_reward.sql:1-7`).
2. **Триггер:** председатель (`server/src/routes/congress.routes.ts:31`).
3. **Стадии:** S7 → `earthquake` (`server/src/services/congress.service.ts:181-290`).
4. **Состояние:** читает команды и сектора сезона; пишет `sectors.status='captured', captured_by_team_id, fortification_level=0, no_reward=true`, чистит поля захвата (`255-268`); компенсация прежнему владельцу в `team_adjustments.influence_delta` (`241-253`, `270-280`). `sector_captures` не пишет.
5. **Время жизни:** постоянно; `no_reward` держится до следующего одобренного захвата сектора, который перезаписывает флаг (`server/src/services/submission.service.ts:914`).
6. **Случайность:** `ORDER BY random() LIMIT 8` для команд (`server/src/services/congress.service.ts:189`) и `ORDER BY random()` для секторов (`212`). Распределение попадает в состояние секторов; в аудит пишется только количество (`server/src/controllers/congress.controller.ts:179`) — по журналу аудита восстановить, какие сектора ушли кому, нельзя.
7. **Инварианты:** исключены ядро, базы (нужно для `sectors_home_base_owner`), особые, сектора с активной заявкой (`server/src/services/congress.service.ts:206-211`); команде не выдаётся её собственный сектор (`220`).
8. **Взаимодействия:**
   - Компенсация считает только базовое влияние (`influence_reward · reward_multiplier`, `server/src/services/congress.service.ts:243-251`), без слагаемого укрепления из `influenceExpr` (`server/src/services/score-sql.ts:26-30`), а укрепление обнуляется (`server/src/services/congress.service.ts:263`).
   - Не вызывает `clearGraffitiOnCapture` (ср. `server/src/services/submission.service.ts:929`) — краска М08 на секторе остаётся.
   - Не пишет `sector_captures` ⇒ якорь передвижения (М30, `server/src/services/submission.service.ts:83-97`) не сдвигается; опыт не начисляется.
   - Кубок «Правители» считает сектор (`server/src/services/trophy.service.ts:181-183`).
9. **Аудит:** `congress.earthquake` (`server/src/controllers/congress.controller.ts:174-181`) — после транзакции.
10. **Клиент:** `client/src/features/admin/AdminCongressPage.tsx`, `client/src/features/admin/congress-api.ts`.

### М05. Телепорт

1. **Термин:** в `docs/DOMAIN.md` отсутствует; «Телепорт» (`server/src/migrations/069_active_law.sql:3-5`).
2. **Триггер:** председатель за команду с флагом `teleport: true` (`server/src/controllers/submission.controller.ts:24`), только при `active_law = 'teleport'` (М06).
3. **Стадии:** S1 → `assertTeleport` (`server/src/services/submission.service.ts:168-203`), вызывается вместо `assertWithinReach` (`server/src/services/submission.service.ts:461-479`); S4/S5 — своей логики нет.
4. **Состояние:** читает `game_settings.active_law` (`178-183`), опыт (`186-190`); пишет `team_penalties(experience=75, reason='teleport', sector_id)` (`198-202`).
5. **Время жизни:** одно действие; штраф постоянный — `reject` и `dropPending` его не откатывают (в `server/src/services/submission.service.ts:1097-1141` и `1183-1310` нет удаления `team_penalties`).
6. **Случайность:** нет.
7. **Инварианты:** только `capture`/`recapture` (`174-176`); `validateActionForSector`, пробитие и лимиты заявок продолжают действовать (`444`, `484-494`, `496-519`). Лимита использований нет. `TELEPORT_COST = 75` (`server/src/services/submission.service.ts:414`), зеркало на клиенте (`client/src/features/map/SectorActionModal.tsx:71`).
8. **Взаимодействия:**
   - Диверсия `hard_reset` снимается и при телепорте (`server/src/services/submission.service.ts:451-453`, `563-572`): отсчёт от базы не применяется (досягаемость пропущена), подмена пула на сложный — применяется (`527-533`).
   - Батут берётся (`458`), но не тратится: `jumped` остаётся `false` (`459`, `584`).
   - Штраф снижает опыт ⇒ может снизить уровень; удаления характеристик при этом нет (удаление только в `dropPending`, `server/src/services/submission.service.ts:1275-1292`).
9. **Аудит:** входит в `submission.capture/recapture` (`server/src/controllers/submission.controller.ts:33-41`); метаданные не содержат признака телепорта (`40`).
10. **Клиент:** `client/src/features/map/SectorActionModal.tsx` (`284-320`, `479-503`), `client/src/features/map/MapPage.tsx`, `client/src/features/map/api.ts`.

### М06. Действующий закон (`active_law`)

1. **Термин:** в `docs/DOMAIN.md` отсутствует; «одно значение = одно поколение» (`server/src/migrations/069_active_law.sql:1-5`).
2. **Триггер:** председатель (`server/src/routes/congress.routes.ts:19`); чтение — любой пользователь (`server/src/routes/congress.routes.ts:15`).
3. **Стадии:** S7 → `setActiveLaw` (`server/src/services/game-settings.service.ts:47-53`); S1 чтение внутри транзакции действия (`server/src/services/submission.service.ts:178-183`); S8 — клиент показывает телепорт.
4. **Состояние:** `game_settings(key='active_law')`.
5. **Время жизни:** до следующей установки (одна ячейка).
6. **Случайность:** нет.
7. **Инварианты:** значение из `ACTIVE_LAWS = ['none','teleport']` (`server/src/types/game-settings.ts:17-18`, проверка `server/src/controllers/congress.controller.ts:200-202`); в БД `CHECK` нет. Чтение терпит отсутствие строки (`server/src/services/game-settings.service.ts:35-41`).
8. **Взаимодействия:** единственный потребитель — М05. Колесо, граффити, рука помощи от `active_law` не зависят (в `server/src/services/law.service.ts` нет чтения `active_law`).
9. **Аудит:** `congress.active_law` (`server/src/controllers/congress.controller.ts:204-210`) — после.
10. **Клиент:** `client/src/features/admin/AdminCongressPage.tsx`, `client/src/features/admin/AdminSettingsPage.tsx`, `client/src/features/admin/congress-api.ts`, `client/src/features/map/MapPage.tsx`, `client/src/features/map/SectorActionModal.tsx`.

### М07. Колесо фортуны

1. **Термин:** «Колесо фортуны» (`docs/DOMAIN.md:218`).
2. **Триггер:** председатель выдаёт колесо команде (`server/src/routes/law.routes.ts:19`); бросок — сервер.
3. **Стадии:**
   - S7 → `spinWheel` (`server/src/services/law.service.ts:274-338`), мгновенные призы `applyInstant` (`227-268`); «мешок цемента» — `applyArmed` (`344-417`); снятие — `cancel` (`420-432`).
   - S9 → `queue_priority` в `DETAILS_SELECT` (`server/src/services/submission.service.ts:695-700`) и порядок `getPending` (`841-842`).
   - S4/S5 → `consumeQueuePriority` (`server/src/services/submission.service.ts:853-868`) из `approve` (`1068`) и `reject` (`1120`).
4. **Состояние:** `team_law_effects(law='wheel_of_fortune')`; призы пишут `team_adjustments` через `bumpAdjustments` (`server/src/services/purchase.service.ts:388-404`), `team_purchase_tokens` через `mintToken` (`server/src/services/law.service.ts:213-224`), `sectors.fortification_level` + `sector_fortification_awards` (`388-399`).
5. **Время жизни:** мгновенные — одно действие (`status='applied'`); `queue_priority` — до разбора любой заявки команды; `fortification` — до ручного применения.

   | Приз | Вес | Эффект | Код |
   |---|---|---|---|
   | `influence` | 18 | `+round(2·mult)` влияния | `server/src/services/law.service.ts:233-237` |
   | `experience` | 18 | `+round(50·mult)` опыта | `238-242` |
   | `upgrade_point` | 14 | `upgrade_points_delta +1` | `243-246` |
   | `trader_token` | 12 | плавающий жетон торговца | `247-250` |
   | `queue_priority` | 12 | armed | `79-87` |
   | `saboteur_token` | 10 | плавающий жетон диверсанта | `251-254` |
   | `fortification` | 10 | armed, нужен свой сектор | `96-104`, `344-417` |
   | `jackpot` | 6 | опыт до следующего уровня + `round(12·mult)` влияния + жетон мастера | `255-264` |

6. **Случайность:** `rollPrize` — `Math.random` по весам (`server/src/services/law.service.ts:133-142`). Результат — `team_law_effects.kind` (`314-327`) и аудит `law.wheel_spin`. Если выпал armed-приз, который у команды уже висит, приз детерминированно заменяется на `experience` (`295-307`); исходный бросок не сохраняется.
7. **Инварианты:** `CHECK law/kind` (`server/src/migrations/084_helping_hand.sql:11-31`); команда из активного сезона (`server/src/services/law.service.ts:284-291`). «Мешок цемента» проверяет свой сектор, не база, `< 3` (`378-386`); ядро и особые не проверяются.
8. **Взаимодействия:**
   - «Мешок цемента» пишет `sector_fortification_awards` и чеканит жетон торговца (`server/src/services/law.service.ts:395-399`) — как одобренное укрепление (`server/src/services/submission.service.ts:984-995`); ср. «кирпичи» М25 без жетона.
   - `sector_fortification_awards` — событие стрика (`server/src/services/trophy.service.ts:165-167`) ⇒ «мешок цемента» продлевает стрик М40.
   - `queue_priority` гаснет на разборе *любой* заявки команды, не на конкретной; сброс (`dropPending`) его не тратит (`server/src/services/submission.service.ts:847-852`).
   - Множитель наград: мгновенные призы умножаются на глобальный `reward_multiplier` (`server/src/services/purchase.service.ts:379-385`).
9. **Аудит:** `law.wheel_spin` (`server/src/controllers/law.controller.ts:37-47`), `law.effect_apply` (`61-69`), `law.effect_cancel` (`152-160`) — после. Гашение `queue_priority` в `audit_log` не пишется (только `team_law_effects.status`).
10. **Клиент:** `client/src/features/map/LawPanel.tsx`, `client/src/features/map/FortuneWheelModal.tsx` (анимация до выпавшего сектора), `client/src/features/laws/LawsPage.tsx`, `client/src/features/admin/laws-api.ts`, `client/src/features/map/AdminReviewQueue.tsx` (`184`).

### М08. Граффити

1. **Термин:** «Граффити» (`docs/DOMAIN.md:217`).
2. **Триггер:** председатель (`server/src/routes/law.routes.ts:20`, `22`); автоматически — при захвате.
3. **Стадии:**
   - S7 → `paintGraffiti` (`server/src/services/law.service.ts:446-529`), `washGraffiti` (`532-568`).
   - S1 → `bordersOwnTerritory` читает `graffiti_team_id` (`server/src/services/submission.service.ts:62-73`, условие `68`).
   - S4 → `clearGraffitiOnCapture` (`server/src/services/law.service.ts:574-591`) из `applyApprovedEffect` (`server/src/services/submission.service.ts:929`).
   - S8 → раскраска клетки (`client/src/features/map/HexMap.tsx:228-229`), зеркало соседства (`client/src/features/map/MapPage.tsx:173-182`).
4. **Состояние:** `sectors.graffiti_team_id` (`server/src/migrations/083_graffiti.sql:17-18`), `team_law_effects(law='graffiti', kind='graffiti', sector_id)`.
5. **Время жизни:** до смывания, перекраски другой командой (`server/src/services/law.service.ts:490-500`) или одобренного захвата сектора.
6. **Случайность:** нет.
7. **Инварианты:** запрет для баз, особых, ядра, занятых другой командой, своих (`server/src/services/law.service.ts:477-488`). Статус `capturing` не проверяется: у сектора в процессе первичного захвата `captured_by_team_id IS NULL`, и условия `480-485` его пропускают. «Одна краска на сектор» — единственной колонкой.
8. **Взаимодействия:** расширяет правило соседства М30, досягаемость (якорь) не меняет (`server/src/services/law.service.ts:443-444`); не снимается землетрясением М04 и особым захватом М35 (в `server/src/services/congress.service.ts:255-268` и `server/src/services/special-sector.service.ts:142-151` очистки нет).
9. **Аудит:** `law.graffiti_paint` (`server/src/controllers/law.controller.ts:80-90`), `law.graffiti_wash` (`130-138`) — после. Автоснятие при захвате и перекраска чужой краски в `audit_log` отдельно не пишутся.
10. **Клиент:** `client/src/features/map/LawPanel.tsx`, `client/src/features/map/HexMap.tsx`, `client/src/features/map/MapPage.tsx`, `client/src/features/map/types.ts`, `client/src/features/admin/laws-api.ts`, `client/src/features/admin/TimelapsePage.tsx`.

### М09. Рука помощи

1. **Термин:** «Рука помощи» (`docs/DOMAIN.md:216`).
2. **Триггер:** председатель раздаёт всем командам (`server/src/routes/law.routes.ts:21`).
3. **Стадии:** S7 → `grantHelpingHand` (`server/src/services/law.service.ts:610-655`); S3 → `rerollTask` (`server/src/services/submission.service.ts:1353-1364`, `1387-1392`); S9 → `extra_reroll` в `DETAILS_SELECT` (`670-675`).
4. **Состояние:** `team_law_effects(law='helping_hand', kind='extra_reroll')`.
5. **Время жизни:** до траты на реролл или снятия.
6. **Случайность:** нет (сам реролл случаен — М32).
7. **Инварианты:** «не больше одного» — сервисная проверка `EXISTS … status='armed'` с `FOR UPDATE OF t` (`server/src/services/law.service.ts:616-637`); в БД нет.
8. **Взаимодействия:** тратится только когда исчерпан лимит удачи М32 (`server/src/services/submission.service.ts:1354`).
9. **Аудит:** раздача — `law.helping_hand` (`server/src/controllers/law.controller.ts:105-115`), после; трата — только внутри `submission.reroll` (`server/src/controllers/submission.controller.ts:73-81`), без признака руки помощи в метаданных.
10. **Клиент:** `client/src/features/map/LawPanel.tsx`, `client/src/features/map/SectorPage.tsx` (`155-158`, `203`), `client/src/features/admin/laws-api.ts`, `client/src/features/admin/submissions-api.ts`.

---

## 4. Случайные встречи

### М10. Каталог 100 встреч

1. **Термин:** случайные встречи (`docs/DOMAIN.md:23-27`).
2. **Триггер:** автоматически на старте захвата/перезахвата; разрешение — председатель.
3. **Стадии:**
   - S2 → `rollForCapture` (`server/src/services/encounter.service.ts:246-264`) из `startAction` (`server/src/services/submission.service.ts:609-617`).
   - S3 → `resolve` (`server/src/services/encounter.service.ts:418-465`) → `evaluate` (`server/src/services/encounter-engine.ts:213-295`) → `applyEffect` (`server/src/services/encounter.service.ts:363-412`).
   - S9 → `toInstanceView` пересчитывает `evaluate` при каждом чтении (`server/src/services/encounter.service.ts:305-329`).
   - S7 → `setActive` (`server/src/services/encounter.service.ts:117-121`).
4. **Состояние:** читает `random_encounters(active)`, характеристики/влияние/опыт/уровень (`snapshot`, `266-275`); пишет `encounter_instances` (`server/src/migrations/052_create_random_encounters.sql:12-24`), через `adminSetResources` — `team_adjustments.influence_delta/experience_delta` (`server/src/services/team-stats.service.ts:214-287`), через `adminSetStats` — `team_stat_upgrades` (`309-371`), через `adjustUpgradePointsDelta` — `team_adjustments.upgrade_points_delta` (`295-305`).
5. **Время жизни:** экземпляр — до разрешения; эффект — постоянный.
6. **Случайность:**
   - Выбор встречи — `ORDER BY random()` (`server/src/services/encounter.service.ts:253`) → `encounter_instances.encounter_number`.
   - Выбор характеристики `random` — `Math.random` (`server/src/services/encounter-engine.ts:102`), встречи №46 и №96.
   - Бросок в `gamble` — `Math.random() < chance` (`server/src/services/encounter-engine.ts:291`), 8 встреч (№10, 16, 40, 50, 60, 66, 90, 100).
   - Сохраняется: `choice`, `outcome_text`, `applied` (конкретный эффект, JSON) (`server/src/services/encounter.service.ts:443-448`). Сам бросок не сохраняется. `applied` — номинальный эффект до ограничения нулём (`367`, `372`, `390`), фактическая дельта не пишется.
   - Превью (`toInstanceView`) и разрешение вызывают `evaluate` независимо (`308-313` и `426-432`), поэтому для `random` и `gamble` показанное председателю может не совпасть с применённым.
7. **Инварианты:**
   - `resolve` не транзакционен: проверка `status !== 'pending'` (`server/src/services/encounter.service.ts:422`), затем `applyEffect` (несколько независимых запросов, внутри `adminSetStats` — своя транзакция `server/src/services/team-stats.service.ts:332-369`), затем `UPDATE encounter_instances` (`server/src/services/encounter.service.ts:443-448`); блокировки строки экземпляра нет.
   - `CHECK status IN ('pending','resolved')` (`server/src/migrations/052_create_random_encounters.sql:18`), `kind/polarity/roster_stat CHECK` (`server/src/migrations/071_rework_random_encounters.sql:14-22`).
   - Экземпляр не связан с исходом заявки: `reject` и `dropPending` его не трогают (в `server/src/services/submission.service.ts` нет обращений к `encounter_instances`); удаляется только каскадом при удалении заявки (`server/src/migrations/052_create_random_encounters.sql:14`).
8. **Состав каталога** (`server/src/services/encounter-catalog.ts:433`): 100 записей, 50 `negative` (1–50) и 50 `positive` (51–100); по видам: `flat` 54, `check` 36, `gamble` 8, `sum` 2 (подсчитано по `CATALOG`; определения видов — `server/src/services/encounter-catalog.ts:33-43`). Обнуление характеристики — №46–50 (`219-263`), подарок характеристик — №96–98 (`400-416`), уровень — №99, №100 (`417-431`). Проверки `check` по характеристикам: интеллект 10, лидерство 8, выносливость 7, удача 6, сила 5.
9. **Взаимодействия:**
   - Обнуление/подарок компенсируется в `upgrade_points_delta` (`server/src/services/encounter.service.ts:402-410`); «Переборка» М27 удаляет все `team_stat_upgrades`, но не трогает `upgrade_points_delta` (`server/src/services/purchase.service.ts:504-514`), а доступные очки = `level − count + delta` (`server/src/services/team-stats.service.ts:107`).
   - `adminSetStats` удаляет и перевставляет строки характеристики с новыми `level` (`server/src/services/team-stats.service.ts:337-358`), что меняет порядок, из которого дроп М39 удаляет строки (там `ORDER BY random()`, так что порядок не важен).
   - Опыт `level` добирается до порога `experienceForLevel` (`server/src/services/encounter.service.ts:354-361`, `375-379`) — четвёртая копия формулы уровня (М34).
   - Встреча не использует `reward_multiplier`.
10. **Аудит:** `encounter.resolve` (`server/src/controllers/encounter.controller.ts:82-90`) — после; розыгрыш на старте в `audit_log` не пишется (метаданные `submission.*` без встречи, `server/src/controllers/submission.controller.ts:40`); `setActive` не аудируется (`server/src/controllers/encounter.controller.ts:14-28`).
11. **Клиент:** `client/src/features/map/SectorActionModal.tsx` (`225-257`), `client/src/features/admin/AdminEncountersPage.tsx`, `client/src/features/admin/encounters-api.ts`.

### М11. Проверка по составу

1. **Термин:** проверка по составу (`docs/DOMAIN.md:28-31`).
2. **Триггер:** генерация строк — председатель; розыгрыш — как М10.
3. **Стадии:** S7 → `syncRosterChecks` (`server/src/services/encounter.service.ts:169-218`), `setTarget` (`221-238`); S3 → ветка `isRosterNumber` в `evaluate` (`server/src/services/encounter-engine.ts:222-233`).
4. **Состояние:** `random_encounters(kind='roster', number ≥ 901, target_team_id, target_child_id, roster_stat)`; читает `season_participants.category`, `children`, капитана (`server/src/services/encounter.service.ts:138-153`, `52-61`).
5. **Время жизни:** до следующей синхронизации; лишние слоты деактивируются (`209-215`).
6. **Случайность:** своей нет; попадает в пул общим `ORDER BY random()` (`253`).
7. **Инварианты:** номера `ROSTER_NUMBER_BASE = 901` (`server/src/services/encounter-catalog.ts:440-444`); характеристика по кругу `ROSTER_STATS[i % 5]` (`server/src/services/encounter.service.ts:36`, `186`); чемпион: `mvp` > `winner` > прочие, затем по имени (`145-147`), иначе капитан (`64-70`). Синхронизация не транзакционна (цикл отдельных `pool.query`, `179-215`).
8. **Взаимодействия:** «попадание» — только если действующая команда = привязанная (`server/src/services/encounter-engine.ts:225`): +2 влияния и +2 к характеристике, иначе +20 опыта (`138-150`). Далее — те же каналы, что М10.
9. **Аудит:** `encounter.roster_sync` (`server/src/controllers/encounter.controller.ts:53-59`) — после; `setTarget` не аудируется (`server/src/controllers/encounter.controller.ts:29-43`).
10. **Клиент:** `client/src/features/admin/AdminEncountersPage.tsx`, `client/src/features/admin/encounters-api.ts`.

---

## 5. Лавки, жетоны, торговцы

### М12. Жетоны покупки

1. **Термин:** персонажи на карте, жетоны покупки (`docs/DOMAIN.md:110-113`, `225`).
2. **Триггер:** автоматически (захват сектора с персонажем, поднятое укрепление) и председатель (законы, диверсия, ручное гашение).
3. **Стадии и источники чеканки:**

   | Источник | Лавка | `sector_id` | Код |
   |---|---|---|---|
   | Одобренный (пере)захват сектора с `merchant_type` | как у сектора | сектор | `server/src/services/submission.service.ts:957-968` (S4) |
   | Поднятый уровень укрепления | trader | NULL | `server/src/services/submission.service.ts:988-995` (S4), М13 |
   | Свинский поступок | saboteur | NULL | `server/src/services/congress.service.ts:156-164` (S7) |
   | Колесо: купоны/джекпот | trader / saboteur / master | NULL | `server/src/services/law.service.ts:213-224`, `247-259` (S7) |
   | «Мешок цемента» | trader | NULL | `server/src/services/law.service.ts:399` (S7) |
   | Диверсия `trader_point` | trader | NULL | `server/src/services/diversion.service.ts:217-225` (S7) |

   Трата: покупка `spendToken` (`server/src/services/purchase.service.ts:293-320`), диверсия `spendSaboteurToken` (`server/src/services/diversion.service.ts:181-199`), ручное гашение `merchant.service.spendToken` (`server/src/services/merchant.service.ts:49-59`). Удаление: при генерации карты (`server/src/services/map-generator.service.ts:633-637`).
4. **Состояние:** `team_purchase_tokens(team_id, sector_id, merchant_type, spent_at)` (`server/src/migrations/055_create_merchants.sql:12-22`, `server/src/migrations/062_veto_and_merchant_tokens.sql:21-22`).
5. **Время жизни:** до траты или перегенерации карты.
6. **Случайность:** нет.
7. **Инварианты:** `UNIQUE(team_id, sector_id)` — жетон за сектор один на команду, повторный захват тем же не чеканит (`ON CONFLICT DO NOTHING`, `server/src/services/submission.service.ts:961-966`); плавающие (`NULL`) не ограничены. Списание старейшего с `FOR UPDATE SKIP LOCKED` (`server/src/services/purchase.service.ts:298-310`).
8. **Взаимодействия:** жетон мастера/торговца → М15–М27, жетон диверсанта → М28.
9. **Аудит:** чеканка в `audit_log` отдельно не пишется; `sector.capture` несёт `merchant` (`server/src/controllers/submission.controller.ts:141`), но не `merchant_token_minted`/`fortify_token_minted`; ручное гашение — `merchant.token_spend` (`server/src/controllers/merchant.controller.ts:20-26`), после.
10. **Клиент:** `client/src/features/map/MerchantTokenTray.tsx`, `client/src/features/map/PurchasePanel.tsx`, `client/src/features/map/DiversionPanel.tsx`, `client/src/features/team/TeamPage.tsx`, `client/src/features/admin/AdminMerchantsPage.tsx`, `client/src/features/admin/merchant-api.ts`, `client/src/features/map/AdminReviewQueue.tsx`.

### М13. Укрепление чеканит жетон торговца

1. **Термин:** в `docs/DOMAIN.md` не описано; в коде — «Поднятый уровень укрепления чеканит жетон торговца» (`server/src/services/submission.service.ts:988-990`).
2. **Триггер:** автоматически при одобрении `fortify`, если уровень вырос.
3. **Стадии:** S4 → `applyApprovedEffect`, ветка `fortify` (`server/src/services/submission.service.ts:971-998`).
4. **Состояние:** пишет `team_purchase_tokens(sector_id NULL, 'trader')` и `sector_fortification_awards`.
5. **Время жизни:** жетон — до траты.
6. **Случайность:** нет.
7. **Инварианты:** условие `raised = next > sector.fortification_level` (`982`); при уровне 3 старт запрещён (`392-394`). Плавающий жетон, чтобы не столкнуться с `UNIQUE(team_id, sector_id)` (`988-990`).
8. **Взаимодействия:** «мешок цемента» М07 тоже чеканит (`server/src/services/law.service.ts:399`); «кирпичи» М25 — нет (`server/src/services/purchase.service.ts:463-495`); `remove_fortification` жетон не забирает.
9. **Аудит:** `fortify_token_minted` возвращается в ответе (`server/src/services/submission.service.ts:1087`), в метаданные `sector.fortify` не попадает (`server/src/controllers/submission.controller.ts:141`).
10. **Клиент:** `client/src/features/map/AdminReviewQueue.tsx`, `client/src/features/admin/submissions-api.ts`.

### М14. Размещение и перемещение торговцев

1. **Термин:** персонажи на фиксированных секторах (`docs/DOMAIN.md:225`, `258-262`).
2. **Триггер:** председатель при генерации карты; разовые миграции.
3. **Стадии:** S7 → `assignMerchantsAfterGeneration` (`server/src/services/map-generator.service.ts:607-624`) из `generateMap` (`678-754`, вызов `730`); миграции `server/src/migrations/072_merchants_fixed_sectors.sql:12-33` и `server/src/migrations/080_merchants_on_new_sectors.sql:13-38`. Во время игры (в цикле действия) `merchant_type` не меняется — других записей колонки нет.
4. **Состояние:** `sectors.merchant_type` (`server/src/migrations/055_create_merchants.sql:8-10`).
5. **Время жизни:** до следующей генерации карты.
6. **Случайность:** `shuffle` (`server/src/services/map-generator.service.ts:314-321`) виды по клеткам `MERCHANT_SECTOR_NUMBERS = [18, 19, 13, 7, 6, 12]` (`588`), `MERCHANT_KINDS` по два каждого (`591-598`); миграция 080 — `ORDER BY random()` (`server/src/migrations/080_merchants_on_new_sectors.sql:19`). Результат — только текущее состояние колонки; прежнее не сохраняется.
7. **Инварианты:** только средние, не особые, не базы (`server/src/services/map-generator.service.ts:612-620`); `CHECK merchant_type IN (…)` (`server/src/migrations/055_create_merchants.sql:9-10`).
8. **Взаимодействия:** М12 (чеканка по `merchant_type`). Скрытость от игроков: обнуление в `getCurrentForSector` (`server/src/services/submission.service.ts:834-835`); `rowToSectorPublic` колонку не отдаёт (`server/src/services/sector.service.ts:29-58`).
9. **Аудит:** `map.generate` (`server/src/controllers/map-generator.controller.ts:17`) — после; метаданные — число секторов и пресет (`server/src/controllers/map-generator.controller.ts:22`), раскладки торговцев в них нет.
10. **Клиент:** `client/src/features/map/HexMap.tsx` (`75`, `162-163`, `647`), `client/src/features/admin/AdminMerchantsPage.tsx`.

### М15. Слоты имплантов (общая механика покупки)

1. **Термин:** слоты имплантов (`docs/DOMAIN.md:241-243`).
2. **Триггер:** председатель проводит покупку (`server/src/routes/purchase.routes.ts:17-21`).
3. **Стадии:** S7 → `buy` (`server/src/services/purchase.service.ts:524-636`), `cancel` (`639-651`); S9 → `armedForUser` (`691-730`), `list` (`240-273`).
4. **Состояние:** `team_purchases`, `team_purchase_tokens.spent_at`.
5. **Время жизни:** instant — `applied`; armed — до `consumed`/`cancelled`. Отмена жетон не возвращает (`638`).
6. **Случайность:** нет.
7. **Инварианты:** слоты `BASE_IMPLANT_SLOTS = 2` + число `extra_hand` в статусе `applied` (`32`, `323-336`); `getSlots` в транзакции не фильтрует по сезону (`327-332`), `list` — фильтрует (`254-266`). Дубль armed-товара запрещён (`554-565`). `CHECK kind/status/charges_left >= 0` (`server/src/migrations/078_purchases.sql:15-42`).
8. **Взаимодействия:** снятие armed-товаров — в М00 и других механиках (раздел 8).
9. **Аудит:** `purchase.buy` (`server/src/controllers/purchase.controller.ts:58-75`), `purchase.cancel` (`89-97`) — после.
10. **Клиент:** `client/src/features/map/PurchasePanel.tsx`, `client/src/features/admin/purchase-api.ts`, `client/src/features/team/TeamPage.tsx`.

### М16. Раздвоение (`split_capture`, мастер)

1. **Термин:** раздвоение (`docs/DOMAIN.md:119`).
2. **Триггер:** покупка; срабатывает автоматически на второй параллельной заявке.
3. **Стадии:** S1 → `startAction` (`server/src/services/submission.service.ts:506-519`); S2 → `consume` (`591-597`); S8 → `splitArmed` (`client/src/features/map/MapPage.tsx:840`).
4. **Состояние:** читает `COUNT(*)` `pending`-заявок команды; `team_purchases`.
5. **Время жизни:** до второй заявки (1 заряд, `server/src/services/purchase.service.ts:42-53`).
6. **Случайность:** нет.
7. **Инварианты:** предел «1, или 2 при раздвоении» — только в сервисе (`server/src/services/submission.service.ts:513-519`); уникальный индекс заменён обычным (`server/src/migrations/078_purchases.sql:55-62`). Обработчик ошибки по старому имени `idx_task_submissions_one_pending_per_team` (`server/src/services/submission.service.ts:634`) ссылается на удалённый индекс. Уникальность по сектору остаётся (`server/src/migrations/019_create_task_submissions.sql:23-25`).
8. **Взаимодействия:** третья заявка невозможна (`pendingCount === 1`, `server/src/services/submission.service.ts:515`).
9. **Аудит:** трата — внутри `submission.*` без признака (`server/src/controllers/submission.controller.ts:40`); в ответе `purchases` (`server/src/services/submission.service.ts:625`).
10. **Клиент:** `client/src/features/map/MapPage.tsx`, `client/src/features/admin/purchase-api.ts`.

### М17. К.И.П. (`kip`, мастер)

1. **Термин:** К.И.П. (`docs/DOMAIN.md:120`).
2. **Триггер:** покупка; автоматически на следующем старте.
3. **Стадии:** S2 → `takeArmed` (`server/src/services/submission.service.ts:524`), пул `buildKipTaskPool` (`318-329`), приоритет пула (`528-533`), `consume` (`598-604`).
4. **Состояние:** читает последнюю `approved`-заявку команды по `reviewed_at` (`323-325`).
5. **Время жизни:** до первого старта с непустым пулом; берётся при любом `action_type`.
6. **Случайность:** пул из одного задания ⇒ `pickRandom` детерминирован.
7. **Инварианты:** при пустом пуле имплант не тратится (`598`).
8. **Взаимодействия:** приоритет выше `hard_reset` М28 (`server/src/services/submission.service.ts:521-523`, `528-533`); реролл М32 строит обычный пул сектора (`1372`), т.е. уводит с задания К.И.П.
9. **Аудит:** как М16.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М18. Чип (`chip`, мастер)

1. **Термин:** чип (`docs/DOMAIN.md:121`).
2. **Триггер:** покупка с командой-целью.
3. **Стадии:** S7 → `applyInstant` `chip` (`server/src/services/purchase.service.ts:430-452`) + вставка копии (`609-625`).
4. **Состояние:** читает старейший armed-имплант цели; пишет копию в `team_purchases` покупателя (`status='armed'`, `token_id NULL`).
5. **Время жизни:** копия — как у оригинала, заряды копируются (`450`).
6. **Случайность:** нет (старейший по `created_at`).
7. **Инварианты:** свободный слот (`445`). Проверка дубля (`554-565`) выполняется только для armed-товаров, а чип — instant, поэтому копия вида, уже заряженного у покупателя, не отсекается.
8. **Взаимодействия:** может скопировать любой armed-товар (М16, М17, М19, М20, М22–М24).
9. **Аудит:** `purchase.buy` (запись о копии — `note`, отдельного события нет).
10. **Клиент:** `client/src/features/admin/purchase-api.ts`, `client/src/features/map/PurchasePanel.tsx`.

### М19. ЩИТ (`shield`, мастер)

1. **Термин:** ЩИТ (`docs/DOMAIN.md:122`).
2. **Триггер:** автоматически при диверсии по команде.
3. **Стадии:** S7 → `diversion.service.cast` (`server/src/services/diversion.service.ts:309-336`).
4. **Состояние:** `team_purchases` жертвы; `team_diversions(status='cancelled')`; жетон диверсанта списан.
5. **Время жизни:** до первой диверсии.
6. **Случайность:** нет.
7. **Инварианты:** проверяется только при `targetTeamId` (`311-313`); у `strip_fortification` цели нет (`needs_target: false`, `server/src/services/diversion.service.ts:43-50`), поэтому ЩИТ её не гасит.
8. **Взаимодействия:** гасит все диверсии с целью М28 до применения эффекта; стоит жетона диверсанту.
9. **Аудит:** `diversion.cast` (`server/src/controllers/diversion.controller.ts:38`) со статусом `cancelled` — после.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`, `client/src/features/team/TeamPage.tsx`.

### М20. Высокий старт (`high_start`, мастер)

1. **Термин:** высокий старт (`docs/DOMAIN.md:123-124`).
2. **Триггер:** автоматически при вводе мест особого события.
3. **Стадии:** S4 (особый захват) → `captureSpecialSector` (`server/src/services/special-sector.service.ts:100-122`).
4. **Состояние:** `team_purchases`; место в `special_sector_awards`.
5. **Время жизни:** до первого ввода результатов с участием команды.
6. **Случайность:** нет.
7. **Инварианты:** при 1-м месте имплант тратится без эффекта (`113-118`); при повторном вводе результатов того же сектора уже не срабатывает (`100-102`).
8. **Взаимодействия:** меняет место ⇒ награду `SPECIAL_PLACE_REWARDS` (`server/src/services/special-sector.service.ts:11-20`), стрик и «Чемпионов» М40 (`server/src/services/trophy.service.ts:169-171`, `224-230`).
9. **Аудит:** `sector.special_capture` с итоговыми местами (`server/src/controllers/sector.controller.ts:53-60`), без признака импланта.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М21. LEVEL UP (`level_up`, мастер)

1. **Термин:** LEVEL UP (`docs/DOMAIN.md:125`).
2. **Триггер:** покупка.
3. **Стадии:** S7 → `applyInstant` `level_up` (`server/src/services/purchase.service.ts:453-462`).
4. **Состояние:** `team_adjustments.experience_delta += gap`, `influence_delta += round(5·mult)`.
5. **Время жизни:** постоянно.
6. **Случайность:** нет.
7. **Инварианты:** `gap` — `experienceToNextLevel` (`server/src/services/purchase.service.ts:349-377`), копия формулы уровня (М34).
8. **Взаимодействия:** глобальный `reward_multiplier` (`379-385`).
9. **Аудит:** `purchase.buy`.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М22. Батут (`trampoline`, торговец)

1. **Термин:** батут (`docs/DOMAIN.md:144`).
2. **Триггер:** автоматически на старте, если сектор не граничит с территорией.
3. **Стадии:** S1 → `takeArmed` (`server/src/services/submission.service.ts:458`), `assertWithinReach(..., canJump)` (`147-157`); S2 → `consume` (`584-590`).
4. **Состояние:** `team_purchases.charges_left` (2 заряда, `server/src/services/purchase.service.ts:116-127`).
5. **Время жизни:** до двух прыжков.
6. **Случайность:** нет.
7. **Инварианты:** досягаемость от якоря не снимает (`server/src/services/submission.service.ts:134-142`). Срабатывает для любого действия с `captured_by_team_id !== teamId`, включая `remove_fortification` (`147`).
8. **Взаимодействия:** при телепорте не тратится (М05). Клиентская `computeAvailable` отсекает не граничащие сектора без учёта батута (`client/src/features/map/SectorActionModal.tsx:148-150`); `trampoline` в клиенте встречается только в `client/src/features/admin/purchase-api.ts`.
9. **Аудит:** как М16.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М23. Подзорная труба (`spyglass`, торговец)

1. **Термин:** подзорная труба (`docs/DOMAIN.md:145`).
2. **Триггер:** автоматически при проверке сверх бюджета интеллекта.
3. **Стадии:** S0 → `peekSector` (`server/src/services/submission.service.ts:1465-1477`, `1501-1506`, `1510`).
4. **Состояние:** `team_purchases.charges_left` (3 заряда, `server/src/services/purchase.service.ts:128-139`), `sector_peeks`.
5. **Время жизни:** до трёх проверок.
6. **Случайность:** нет.
7. **Инварианты:** тратится только на новой (не повторной) проверке (`server/src/services/submission.service.ts:1457-1465`).
8. **Взаимодействия:** М31 (бюджет), диверсия `false_scouting` действует и на проверку с трубы (`1481-1492`).
9. **Аудит:** не аудируется (`server/src/controllers/submission.controller.ts:88-104`).
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М24. Подушка безопасности (`airbag`, торговец)

1. **Термин:** подушка безопасности (`docs/DOMAIN.md:146`).
2. **Триггер:** автоматически при сбросе.
3. **Стадии:** S5 → `dropPending` (`server/src/services/submission.service.ts:1235-1261`).
4. **Состояние:** `team_purchases`; при подушке строка `team_penalties(reason='drop')` не вставляется.
5. **Время жизни:** до сброса.
6. **Случайность:** нет.
7. **Инварианты:** уровень до/после считается и при подушке (`1241`, `1275`), но без штрафа он не падает.
8. **Взаимодействия:** стрик М40 делится на сегменты только строками `team_penalties` с `reason = 'drop'` (`server/src/services/trophy.service.ts:209-212`); при подушке такой строки нет (`server/src/services/submission.service.ts:1243-1248`), поэтому сброс с подушкой стрик по коду не прерывает. Описание товара утверждает обратное (`server/src/services/purchase.service.ts:144-145`, `server/src/services/submission.service.ts:1235-1236`).
9. **Аудит:** `submission.drop` с `penalty: 0/0` (`server/src/controllers/submission.controller.ts:186-194`), без признака подушки.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`, `client/src/features/map/DropSectorConfirmModal.tsx`.

### М25. Кирпичи (`bricks`, торговец)

1. **Термин:** кирпичи (`docs/DOMAIN.md:147`).
2. **Триггер:** покупка с выбором сектора.
3. **Стадии:** S7 → `applyInstant` `bricks` (`server/src/services/purchase.service.ts:463-495`).
4. **Состояние:** `sectors.fortification_level += 1`, `sector_fortification_awards`.
5. **Время жизни:** постоянно (до потери сектора / снятия уровня).
6. **Случайность:** нет.
7. **Инварианты:** свой, не база, `< 3` (`470-478`); ядро и особые не проверяются.
8. **Взаимодействия:** жетон торговца **не** чеканит (ср. М13, М07); продлевает стрик через `sector_fortification_awards` (`server/src/services/trophy.service.ts:165-167`).
9. **Аудит:** `purchase.buy`.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`, `client/src/features/map/PurchasePanel.tsx`.

### М26. Дополнительная рука (`extra_hand`, торговец)

1. **Термин:** дополнительная рука (`docs/DOMAIN.md:148`).
2. **Триггер:** покупка.
3. **Стадии:** S7 → `applyInstant` `extra_hand` (`server/src/services/purchase.service.ts:496-503`); сам эффект — запись `applied`, которую считает `getSlots` (`323-336`).
4. **Состояние:** `team_purchases(kind='extra_hand', status='applied')`.
5. **Время жизни:** постоянно: явного удаления `team_purchases` в коде нет (только каскад при удалении команды/сезона, `server/src/migrations/078_purchases.sql:13`, `31`).
6. **Случайность:** нет.
7. **Инварианты:** см. М15.
8. **Взаимодействия:** М15.
9. **Аудит:** `purchase.buy`.
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М27. Переборка (`refit`, торговец)

1. **Термин:** переборка (`docs/DOMAIN.md:149`).
2. **Триггер:** покупка.
3. **Стадии:** S7 → `applyInstant` `refit` (`server/src/services/purchase.service.ts:504-514`).
4. **Состояние:** `DELETE FROM team_stat_upgrades WHERE team_id`.
5. **Время жизни:** постоянно.
6. **Случайность:** нет.
7. **Инварианты:** `upgrade_points_delta` не трогается.
8. **Взаимодействия:** М10 (компенсации в `upgrade_points_delta` от обнулений/подарков остаются), М34 (очки возвращаются через `level − count + delta`).
9. **Аудит:** `purchase.buy` (число строк — в `note`).
10. **Клиент:** `client/src/features/admin/purchase-api.ts`.

### М28. Диверсии (все 7 товаров диверсанта)

1. **Термин:** диверсант (`docs/DOMAIN.md:127-138`, `223`, `248-257`).
2. **Триггер:** председатель за команду-диверсанта (`server/src/controllers/diversion.controller.ts:26-59`); armed-диверсии снимаются автоматически действием жертвы.
3. **Общие стадии:** S7 → `cast` (`server/src/services/diversion.service.ts:277-393`), `cancel` (`396-407`).

   | Вид | Timing | Стадия срабатывания | Код срабатывания | Пишет |
   |---|---|---|---|---|
   | `trader_point` | instant | S7 | `server/src/services/diversion.service.ts:217-225` | `team_purchase_tokens` диверсанту |
   | `strip_fortification` | instant | S7 | `226-252` | `sectors.fortification_level − 1` |
   | `steal_influence` | instant | S7 | `253-267` | `team_penalties(influence=5, reason='diversion')` |
   | `hard_reset` | armed | S1 (якорь = база) + S2 (сложный пул) | `server/src/services/submission.service.ts:451-453`, `126-128`, `303-311`, `527-533`, `563-572` | `team_diversions.status` |
   | `opponent_move` | armed | S2 | `server/src/services/submission.service.ts:454`, `573-579` | только `team_diversions.status/note` |
   | `false_scouting` | armed | S0 | `server/src/services/submission.service.ts:1481-1492`, `348-363` | `sector_peeks.lie_task_ids` |
   | `no_reward` | armed | S4 | `server/src/services/submission.service.ts:897-901`, `914`, `931-952` | `sectors.no_reward`, `team_penalties(reason='diversion_no_reward')` |

4. **Состояние:** `team_diversions` (`server/src/migrations/076_diversions.sql:18-45`), жетоны.
5. **Время жизни:** instant — момент; armed — до ближайшего подходящего действия жертвы: `hard_reset` — только (пере)захват (`server/src/services/submission.service.ts:450-453`), `opponent_move` — любое действие (`454`), `no_reward` — одобрение (пере)захвата, `false_scouting` — новая проверка с непустым подменным пулом (`1485-1491`).
6. **Случайность:** подменный пул — `ORDER BY … random()` (`server/src/services/submission.service.ts:358`), сохраняется в `sector_peeks.lie_task_ids` (`1494-1498`), повторный просмотр возвращает ту же ложь (`1457-1463`).
7. **Инварианты:** дубль armed-вида на жертве запрещён сервисом (`server/src/services/diversion.service.ts:354-364`); цель ≠ диверсант (`289-291`); `CHECK kind/status` (`server/src/migrations/076_diversions.sql:21-40`). `strip_fortification` не проверяет базу (ср. `server/src/services/submission.service.ts:397-399`).
8. **Взаимодействия:**
   - ЩИТ М19 гасит всё, кроме `strip_fortification` и `trader_point` (нет цели).
   - `hard_reset` уступает К.И.П. в выборе пула (`server/src/services/submission.service.ts:528-533`); отсчёт от базы работает и при К.И.П. (`521-523`).
   - `no_reward`: компенсирующий опыт считается с текущим `reward_multiplier` и фиксируется числом (`933-946`), а опыт захвата пересчитывается по текущему множителю (1.3).
   - Стрик: диверсии его не трогают (`server/src/migrations/076_diversions.sql:9-11`), `reason='diversion'`/`'diversion_no_reward'` не делят сегменты (`server/src/services/trophy.service.ts:211`).
9. **Аудит:** `diversion.cast` (`server/src/controllers/diversion.controller.ts:38`), `diversion.cancel` (`68`) — после; срабатывание armed-диверсий в `audit_log` не пишется, только `team_diversions`.
10. **Клиент:** `client/src/features/map/DiversionPanel.tsx`, `client/src/features/admin/diversion-api.ts`, `client/src/features/map/SectorActionModal.tsx`, `client/src/features/map/MapPage.tsx`.

---

## 6. Правила от характеристик

### М29. Пробитие (сила)

1. **Термин:** пробитие (`docs/DOMAIN.md:55-66`).
2. **Триггер:** автоматически на старте перезахвата.
3. **Стадии:** S1 → `startAction` (`server/src/services/submission.service.ts:484-494`), `penetrationFromStrength` (`server/src/services/stat-thresholds.ts:8-13`); S8 → `client/src/features/map/SectorActionModal.tsx:166-192`, `299-307`.
4. **Состояние:** `team_stat_upgrades` (`getTeamStat`, `server/src/services/submission.service.ts:30-42`), `sectors.fortification_level`.
5. **Время жизни:** одно действие.
6. **Случайность:** нет.
7. **Инварианты:** только `recapture`; `remove_fortification` силы не требует (`406-408`). Пороги 5/8/10 → 1/2/3 совпадают с `docs/DOMAIN.md:61-66`.
8. **Взаимодействия:** М36 (укрепление), М05 (телепорт тоже проверяет пробитие).
9. **Аудит:** —
10. **Клиент:** `client/src/features/map/stat-thresholds.ts:4-9`, `client/src/features/map/SectorActionModal.tsx`.

### М30. Передвижение и соседство (выносливость)

1. **Термин:** очки передвижения (`docs/DOMAIN.md:68-79`, `docs/DOMAIN.md:229-231`).
2. **Триггер:** автоматически на старте.
3. **Стадии:** S1 → `assertWithinReach` (`server/src/services/submission.service.ts:119-159`), якорь `getTeamAnchor` (`83-97`), соседство `bordersOwnTerritory` (`62-73`); S8 → `client/src/features/map/MapPage.tsx:190-224`, `client/src/features/map/SectorActionModal.tsx:93-150`.
4. **Состояние:** `sector_captures` (последний по `captured_at`), `sectors.q/r`, `captured_by_team_id`, `graffiti_team_id`, `team_stat_upgrades`.
5. **Время жизни:** одно действие.
6. **Случайность:** нет.
7. **Инварианты:** `dist > reach` ⇒ отказ (`136-142`), где `reach = movementFromEndurance(endurance)` = 0/3/5/7/9 (`server/src/services/stat-thresholds.ts:16-22`). Соседство — только для не-своих секторов (`server/src/services/submission.service.ts:147`).
8. **Взаимодействия:** граффити М08 (соседство), `hard_reset` (якорь = база), батут М22 (пропуск соседства), телепорт М05 (полный пропуск), землетрясение и особый захват якорь не двигают (не пишут `sector_captures`), генерация карты пишет захват базы (`server/src/services/map-generator.service.ts:666-669`).
9. **Аудит:** —
10. **Клиент:** `client/src/features/map/stat-thresholds.ts:11-17`, `client/src/features/map/MapPage.tsx`, `client/src/features/map/SectorActionModal.tsx`, `client/src/features/map/HexMap.tsx` (якорь `160-161`, `565`).

### М31. Проверки (интеллект)

1. **Термин:** проверка (`docs/DOMAIN.md:81-93`).
2. **Триггер:** председатель за команду (`server/src/routes/sector.routes.ts:32`).
3. **Стадии:** S0 → `peekSector` (`server/src/services/submission.service.ts:1421-1524`); S4 → сброс бюджета `DELETE FROM sector_peeks` (`954`).
4. **Состояние:** `sector_peeks(team_id, sector_id, lie_task_ids)` (`server/src/migrations/063_checks_and_rerolls.sql:13-19`, `server/src/migrations/076_diversions.sql:56-57`).
5. **Время жизни:** до следующего одобренного (пере)захвата команды (не укрепления).
6. **Случайность:** нет (кроме `false_scouting`).
7. **Инварианты:** `UNIQUE(team_id, sector_id)` — повторная проверка бесплатна (`server/src/migrations/063_checks_and_rerolls.sql:18`, `server/src/services/submission.service.ts:1494-1497`). Бюджет 0/1/2/3/4 (`server/src/services/stat-thresholds.ts:25-31`). Проверка досягаемости при разведке не выполняется (в `peekSector` нет вызова `assertWithinReach`); особые запрещены (`server/src/services/submission.service.ts:1437-1439`).
8. **Взаимодействия:** труба М23, `false_scouting` М28.
9. **Аудит:** не аудируется (`server/src/controllers/submission.controller.ts:88-104`).
10. **Клиент:** `client/src/features/map/SectorActionModal.tsx` (`514`), `client/src/features/map/api.ts`, `client/src/features/map/stat-thresholds.ts:19-25`.

### М32. Рероллы (удача)

1. **Термин:** реролл (`docs/DOMAIN.md:95-106`).
2. **Триггер:** председатель за команду (`server/src/routes/submission.routes.ts:15`).
3. **Стадии:** S3 → `rerollTask` (`server/src/services/submission.service.ts:1323-1409`); S9 → `rerolls_max` в SQL (`663-668`).
4. **Состояние:** `task_submissions.task_id, reroll_count` (`server/src/migrations/063_checks_and_rerolls.sql:11`).
5. **Время жизни:** лимит на заявку (`reroll_count` у каждой заявки свой).
6. **Случайность:** `pickRandom` из пула без текущего задания (`server/src/services/submission.service.ts:1377-1378`). Новый `task_id` перезаписывает прежний; история заданий не хранится, аудит пишет только `reroll_count` (`server/src/controllers/submission.controller.ts:80`).
7. **Инварианты:** лимит `rerollsFromLuck` (`server/src/services/stat-thresholds.ts:34-39`) продублирован SQL `CASE` (`server/src/services/submission.service.ts:663-668`).
8. **Взаимодействия:** рука помощи М09 — сверх лимита (`1353-1364`); пул — всегда `buildTaskPool` сектора (`1372`), без К.И.П. и `hard_reset`.
9. **Аудит:** `submission.reroll` (`server/src/controllers/submission.controller.ts:73-81`) — после.
10. **Клиент:** `client/src/features/map/SectorPage.tsx` (`155-219`), `client/src/features/map/api.ts`.

### М33. Права от лидерства

1. **Термин:** лидерство, право вето (`docs/DOMAIN.md:48-53`).
2. **Факт по коду:** серверного права, выдаваемого лидерством, нет. Вето привязано к влиянию (`server/src/services/congress.service.ts:107-127`, отмечено в `docs/DOMAIN.md:232-233`). Лидерство читается: проверками встреч М10 (8 записей `check` по лидерству, напр. `server/src/services/encounter-catalog.ts:96`), лестницей кубка «Универсальные» `[4,5,6,7]` (`server/src/services/stat-thresholds.ts:58`), суммой характеристик в `sum`-встречах (`server/src/services/encounter-engine.ts:204-207`).
3. **Стадии:** S3 (встречи), S6 (кубок), S8 — значок короны у команды с максимальным лидерством (`client/src/features/map/TeamSidePanel.tsx:82-88`, вычисление `client/src/features/leaderboard/TeamsOverviewPage.tsx:67`, `116`).
4–11. Своего состояния, случайности, инвариантов и аудита нет.

### М34. Опыт, уровень, очки апгрейда (обнаружено)

1. **Термин:** опыт, уровень, очки апгрейда (`docs/DOMAIN.md:18-20`, `43-46`).
2. **Триггер:** расчёт — автоматически при чтении; трата очка — капитан команды.
3. **Стадии:**
   - S6 → `calculateLevel` (`server/src/services/team-stats.service.ts:34-49`), `getFullStats` (`130-192`); копии: `calculateLevelInTx` (`server/src/services/submission.service.ts:1151-1181`), `experienceToNextLevel` (`server/src/services/purchase.service.ts:349-377`), `experienceForLevel` (`server/src/services/encounter.service.ts:354-361`).
   - S7 → `upgradeStat` (`server/src/services/team-stats.service.ts:99-128`) из контроллера (`server/src/controllers/team-stats.controller.ts:23-60`); настройки `base_exp_threshold`, `exp_step` (`server/src/controllers/game-settings.controller.ts:22-39`).
4. **Состояние:** `team_stat_upgrades(team_id, stat_name, level)` (`server/src/migrations/009_create_team_stat_upgrades.sql:1-9`), `team_adjustments.upgrade_points_delta`, `game_settings`.
5. **Время жизни:** постоянно; уровень — производная, пересчитывается при каждом чтении, поэтому смена `base_exp_threshold`/`exp_step` меняет уровни задним числом.
6. **Случайность:** нет.
7. **Инварианты:** доступно = `level − count + delta` (`server/src/services/team-stats.service.ts:107`); `UNIQUE(team_id, level)` (`server/src/migrations/009_create_team_stat_upgrades.sql:8`); трата — только капитан своей команды (`server/src/controllers/team-stats.controller.ts:47-52`); `upgradeStat` без транзакции. Значения по умолчанию 50/10 зашиты только в копиях внутри транзакций (`server/src/services/submission.service.ts:1165-1166`, `server/src/services/purchase.service.ts:363-364`).
8. **Взаимодействия:** удаление характеристик — дроп М39, переборка М27, `adminSetStats` (встречи М10 и ручная правка М42). Снижение опыта телепортом, штрафом `no_reward`, встречей, пропорциональной наградой характеристик не удаляет — удаление по падению уровня есть только в `dropPending` (`server/src/services/submission.service.ts:1275-1292`).
9. **Аудит:** `upgradeStat` не аудируется; изменение настроек не аудируется (`server/src/controllers/game-settings.controller.ts:22-39`).
10. **Клиент:** `client/src/features/team/TeamPage.tsx`, `client/src/features/admin/AdminSettingsPage.tsx`, `client/src/features/admin/settings-api.ts`.

---

## 7. Прочие механики

### М35. Особые сектора

1. **Термин:** особые сектора (события) (`docs/DOMAIN.md:222`).
2. **Триггер:** председатель вводит итоговые места (`server/src/routes/sector.routes.ts:28`).
3. **Стадии:** S1 → запрет обычных действий и разведки (`server/src/services/submission.service.ts:440-442`, `1437-1439`); S4-аналог → `captureSpecialSector` (`server/src/services/special-sector.service.ts:67-171`); S6 → исключение из формул (`server/src/services/score-sql.ts:25`, `30`, `48`, `53`) и прибавка `special_sector_awards`.
4. **Состояние:** `special_sector_awards(sector_id, team_id, place, influence, experience)` (`server/src/migrations/056_create_special_sector_awards.sql:13-24`); `sectors.status, captured_by_team_id`.
5. **Время жизни:** постоянно; повторный ввод заменяет прежние места (`server/src/services/special-sector.service.ts:97-98`).
6. **Случайность:** нет.
7. **Инварианты:** место 1..8 (`server/src/migrations/065_special_place_up_to_8.sql:4-7`, `server/src/services/special-sector.service.ts:49-51`); одна строка на команду `UNIQUE(sector_id, team_id)` (`server/src/migrations/056_create_special_sector_awards.sql:22`); ничьи разрешены — `UNIQUE(sector_id, place)` снят (`server/src/migrations/068_special_shared_places.sql:5-6`); сектор получает первый в списке с лучшим местом (`server/src/services/special-sector.service.ts:140-151`); награды `SPECIAL_PLACE_REWARDS` фиксированы (`11-20`), `reward_multiplier` не применяется; `sector_captures` не пишется.
8. **Взаимодействия:** высокий старт М20 (`100-122`); кубки «Чемпионы», стрик (`server/src/services/trophy.service.ts:169-171`, `224-230`), «Правители» (владелец в `captured_count`, `181-183`); исключён из землетрясения, граффити, торговцев, заданий карты.
9. **Аудит:** `sector.special_capture` (`server/src/controllers/sector.controller.ts:53-60`) — после.
10. **Клиент:** `client/src/features/map/SpecialSectorModal.tsx`, `client/src/features/map/HexMap.tsx`, `client/src/features/map/MapPage.tsx`, `client/src/features/map/api.ts`.

### М36. Правила укрепления

1. **Термин:** укрепление (`docs/DOMAIN.md:35-37`).
2. **Триггер:** действия `fortify`/`remove_fortification`, товары, законы, диверсия.
3. **Стадии:**
   - S1 → `validateActionForSector` (`server/src/services/submission.service.ts:388-409`).
   - S4 → сброс уровня при (пере)захвате (`913`); `fortify` +1 с журналом и жетоном (`971-998`); `remove_fortification` −1 (`999-1009`).
   - S6 → бонус влияния от текущего уровня, опыт по журналу (1.2).
   - S7 → кирпичи (`server/src/services/purchase.service.ts:463-495`), мешок цемента (`server/src/services/law.service.ts:344-417`), `strip_fortification` (`server/src/services/diversion.service.ts:226-252`), землетрясение обнуляет (`server/src/services/congress.service.ts:263`), генерация карты обнуляет базу (`server/src/services/map-generator.service.ts:659-664`); разовые миграции `server/src/migrations/073_capture_grants_fortification.sql:4-7`, `server/src/migrations/074_clear_core_and_home_fortification.sql:3-6`, `server/src/migrations/075_fortification_awards.sql:21-26`.
4. **Состояние:** `sectors.fortification_level`, `sector_fortification_awards` (`server/src/migrations/075_fortification_awards.sql:9-14`).
5. **Время жизни:** уровень — пока сектор у владельца; опыт за уровень — постоянно (журнал не чистится при снятии/потере).
6. **Случайность:** нет.
7. **Инварианты:**
   - Потолок 3: `CHECK` в БД (`server/src/migrations/015_alter_sectors_add_map_columns.sql:11-12`) и три константы `MAX_FORTIFICATION = 3` (`server/src/services/submission.service.ts:28`, `server/src/services/purchase.service.ts:35`, `server/src/services/law.service.ts:42`). Настройка `max_fortification_level` редактируется (`server/src/controllers/game-settings.controller.ts:9`, `client/src/features/admin/AdminSettingsPage.tsx:29`), но сервисами не читается.
   - База: запрет перезахвата и снятия (`server/src/services/submission.service.ts:381-383`, `397-399`); `fortify` базы через задание не запрещён (`388-395`, клиент предлагает — `client/src/features/map/SectorActionModal.tsx:104-121`), кирпичи и цемент запрещают (`server/src/services/purchase.service.ts:473-475`, `server/src/services/law.service.ts:381-383`), `strip_fortification` не проверяет.
   - Ядро: запрета укрепления в рантайме нет ни в одном из путей; обнуление — только разовой миграцией 074.
8. **Взаимодействия:** пробитие М29, жетон М13, стрик (`server/src/services/trophy.service.ts:165-167`), землетрясение М04 (компенсация без бонуса укрепления).
9. **Аудит:** через `submission.*`/`sector.*`, `purchase.buy`, `law.effect_apply`, `diversion.cast`.
10. **Клиент:** `client/src/features/map/SectorActionModal.tsx`, `client/src/features/map/HexMap.tsx`, `client/src/features/map/PurchasePanel.tsx`, `client/src/features/map/LawPanel.tsx`, `client/src/features/map/DiversionPanel.tsx`.

### М37. Множитель наград ×1.5

1. **Термин:** в `docs/DOMAIN.md` отсутствует; «×1.5 награда» (`server/src/migrations/066_reward_multiplier.sql:1-5`).
2. **Триггер:** председатель (`server/src/routes/game-settings.routes.ts:12`).
3. **Стадии:** S7 → `setRewardBoost` (`server/src/services/game-settings.service.ts:89-128`); S4 → снимок на захвате (`server/src/services/submission.service.ts:915-920`); S6 → `influenceExpr`/`experienceExpr`; S7 → глобальный множитель для призов (`server/src/services/purchase.service.ts:379-385`).
4. **Состояние:** `game_settings(reward_multiplier)` (`server/src/migrations/066_reward_multiplier.sql:10-11`), `sectors.reward_multiplier NUMERIC(4,2)` (`6-7`).
5. **Время жизни:** флаг — до переключения; снимок на секторе — до следующего захвата или выключения флага.
6. **Случайность:** нет.
7. **Инварианты:** ядро всегда 1 (`server/src/services/submission.service.ts:916`, `server/src/services/game-settings.service.ts:104`). Включение ретроактивно поднимает сектора, у которых есть захват текущим владельцем за сегодня (`100-111`); выключение сбрасывает все сектора в 1 (`114-117`).
8. **Взаимодействия (где множитель применяется / нет):**
   - Применяется: базовое влияние и укрепление (`server/src/services/score-sql.ts:21-30`), опыт захватов и укреплений (`44-53`), компенсация `no_reward` (`server/src/services/submission.service.ts:933`), компенсация землетрясения (`server/src/services/congress.service.ts:244`), призы колеса (`server/src/services/law.service.ts:234`, `239`, `257`), LEVEL UP (`server/src/services/purchase.service.ts:455`).
   - Не применяется: штраф сброса (`server/src/services/submission.service.ts:1219-1239` — `influence_reward/experience_reward` без множителя), особые события (`server/src/services/special-sector.service.ts:126-131`), пропорциональная награда, встречи.
   - См. 1.3 о пересчёте опыта задним числом.
9. **Аудит:** не аудируется (`server/src/controllers/game-settings.controller.ts:41-49`).
10. **Клиент:** `client/src/features/map/MapPage.tsx` (`65-66`, `253-254`), `client/src/features/admin/AdminSettingsPage.tsx`, `client/src/features/admin/settings-api.ts`.

### М38. Пропорциональная награда по баллам команд

1. **Термин:** в `docs/DOMAIN.md` отсутствует.
2. **Триггер:** председатель (`server/src/routes/awards.routes.ts:10`).
3. **Стадии:** S7 → `applyProportionalAward` (`server/src/services/proportional-award.service.ts:81-181`), `splitProportionally` — метод наибольшего остатка (`43-66`).
4. **Состояние:** `team_adjustments.influence_delta/experience_delta` (`157-167`).
5. **Время жизни:** постоянно.
6. **Случайность:** нет; ничьи остатков — по баллам, затем по порядку ввода (`55-58`).
7. **Инварианты:** баллы ≥ 0, сумма > 0 (`114-123`); общий итог может быть отрицательным (`40-41`, `48`). Запись в одной транзакции (`154-176`).
8. **Взаимодействия:** отрицательный итог снижает опыт ⇒ уровень, без удаления характеристик (М34). Множитель не применяется. Клиентское зеркало расчёта — `client/src/features/admin/proportional-split.ts`.
9. **Аудит:** `team.proportional_award` (`server/src/controllers/proportional-award.controller.ts:28-38`) — после.
10. **Клиент:** `client/src/features/admin/AdminAwardsPage.tsx`, `client/src/features/admin/awards-api.ts`, `client/src/features/admin/proportional-split.ts`, `client/src/features/admin/AdminCongressPage.tsx`.

### М39. Сброс (дроп) и потеря характеристик

1. **Термин:** в `docs/DOMAIN.md` как «дроп» упомянут у подушки (`docs/DOMAIN.md:146`).
2. **Триггер:** председатель (`server/src/routes/submission.routes.ts:14`); сервис допускает и игрока своей команды (`server/src/services/submission.service.ts:1210-1212`).
3. **Стадии:** S5 → `dropPending` (`server/src/services/submission.service.ts:1183-1310`).
4. **Состояние:** `team_penalties(reason='drop', influence=floor(ir/2), experience=floor(er/2), sector_id, submission_id)` (`1238-1260`); откат сектора (`1263`); `task_submissions.status='rejected'` (`1265-1273`); `DELETE team_stat_upgrades` (`1278-1292`).
5. **Время жизни:** постоянно.
6. **Случайность:** по одной случайной строке характеристики на каждый потерянный уровень — `ORDER BY random()` (`1284`). Удалённые характеристики возвращаются только в ответе (`1302`); в аудит не пишутся (`server/src/controllers/submission.controller.ts:193`) — восстановить нельзя.
7. **Инварианты:** штраф считается от награды сектора для любого `action_type`, включая `fortify` и `remove_fortification` (`server/src/services/submission.service.ts:1219-1239`); без множителя. Уровень до/после — `calculateLevelInTx` внутри транзакции.
8. **Взаимодействия:** подушка М24; стрик М40 — строка `drop` открывает новый сегмент (`server/src/services/trophy.service.ts:202-217`); `queue_priority` не тратится (`server/src/services/submission.service.ts:850-851`); встреча, разыгранная на старте, остаётся `pending` (М10).
9. **Аудит:** `submission.drop` (`server/src/controllers/submission.controller.ts:186-194`) — после, с `penalty`, без `removed_stats`, `level_before/after`.
10. **Клиент:** `client/src/features/map/DropSectorConfirmModal.tsx`, `client/src/features/admin/submissions-api.ts`, `client/src/features/map/SectorPage.tsx`.

### М40. Кубки (только правила подсчёта, кратко)

1. **Термин:** кубки (`docs/DOMAIN.md:153-171`).
2. **Триггер:** расчёт при чтении; ручной победитель — председатель (`server/src/routes/trophy.routes.ts:16`).
3. **Стадии:** S6 → `METRICS_QUERY` (`server/src/services/trophy.service.ts:174-234`), `buildTrophy` (`272-337`); S7 → `setOverride` (`407-446`).

   | Кубок | Метрика | Код |
   |---|---|---|
   | Влиятельные | `influenceExpr` | `server/src/services/trophy.service.ts:69-76`, `179` |
   | Хранители ядра | владеет ядром → 1-е, иначе последнее | `77-83`, `197-201`, `284-288` |
   | Опытные | `experienceExpr` | `84-91`, `180` |
   | Правители | `COUNT(sectors WHERE captured_by_team_id)` (с базой, особыми, землетрясением) | `92-99`, `181-183` |
   | Универсальные | `thresholdCoverage`, тайбрейк — сумма очков | `100-108`; `server/src/services/stat-thresholds.ts:53-78` |
   | Несгибаемые | макс. длина ряда событий между строками `team_penalties.reason='drop'` | `server/src/services/trophy.service.ts:109-116`, `156-172`, `202-217` |
   | Захватчики | число одобренных `recapture` | `117-124`, `218-223` |
   | Чемпионы | число 1-х мест, тайбрейк `SUM(9 − place)` | `125-133`, `224-230` |

   События стрика: одобренные захват/перезахват, строки `sector_fortification_awards` (включая кирпичи и цемент), 1-е места особых событий (`156-172`).
4. **Состояние:** читает всё из 1.2; пишет только `trophy_overrides` (`server/src/migrations/077_trophy_overrides.sql:10-19`).
5. **Время жизни:** сезон; оверрайд — до снятия.
6. **Случайность:** нет.
7. **Инварианты:** PK `(season_id, trophy_key)` (`server/src/migrations/077_trophy_overrides.sql:18`); ранги — competition rank по паре (метрика, тайбрейк) (`server/src/services/trophy.service.ts:240`).
8. **Взаимодействия:** подушка М24 (не делит стрик), землетрясение М04 (Правители), высокий старт М20.
9. **Аудит:** `setOverride` и `setTrophiesVisible` не аудируются (`server/src/controllers/trophy.controller.ts:76`, `server/src/controllers/game-settings.controller.ts:51-59`).
10. **Клиент:** `client/src/features/trophies/TrophySection.tsx`, `client/src/features/admin/AdminTrophiesPage.tsx`, `client/src/features/seasons/FinalsPage.tsx`, `client/src/features/trophies/useTrophiesVisible.ts`.

### М41. Ручные правки ресурсов и характеристик (обнаружено)

1. **Термин:** в `docs/DOMAIN.md` отсутствует («корректировки» в формулах кубков, `docs/DOMAIN.md:157-158`).
2. **Триггер:** председатель (`server/src/routes/team-stats.routes.ts:12-13`); программно — встречи М10.
3. **Стадии:** S7 → `adminSetResources` (`server/src/services/team-stats.service.ts:214-287`), `adminSetStats` (`309-371`), `adjustUpgradePointsDelta` (`295-305`).
4. **Состояние:** `team_adjustments` (перезапись дельт так, чтобы итог совпал с целевым: `247-272`, `274-284`), `team_stat_upgrades`.
5. **Время жизни:** постоянно.
6. **Случайность:** нет.
7. **Инварианты:** цели ≥ 0 (`198-206`); `adminSetResources` вне транзакции (ряд `pool.query`), `adminSetStats` — в транзакции.
8. **Взаимодействия:** дельты `team_adjustments` общие для колеса, LEVEL UP, землетрясения, пропорциональной награды, встреч — `adminSetResources` пишет абсолютное значение дельты, сохраняя итог, но источник вклада не различается.
9. **Аудит:** `team.set_resources`, `team.set_stats` (`server/src/controllers/team-stats.controller.ts:83-91`, `110-118`) — после; при вызове из встречи — только `encounter.resolve`.
10. **Клиент:** `client/src/features/admin/team-modals.tsx`, `client/src/features/admin/teams-api.ts`.

### М42. Генерация карты и привязка заданий (обнаружено)

1. **Термин:** в `docs/DOMAIN.md` отсутствует.
2. **Триггер:** председатель (`server/src/routes/sector.routes.ts:13-15`).
3. **Стадии:** S7 → `generateMap` (`server/src/services/map-generator.service.ts:678-754`), `assignTasksAfterGeneration` (`323-383`), `rerollSectorTasks` (`444`), `clearSeasonSectors` (`627-639`), `repinTeams` (`642-671`).
4. **Состояние:** `sectors`, `sector_tasks`, `sector_captures` (база = первый захват), `team_purchase_tokens` (удаляются), `task_submissions` (удаляются).
5. **Время жизни:** до следующей генерации.
6. **Случайность:** `shuffle` на `Math.random` (`314-321`) — раздача заданий (`359`, `374`) и торговцев (М14); результат только в состоянии.
7. **Инварианты:** проверка числа заданий по сложностям (`294-312`); баз не меньше команд (`649-654`).
8. **Взаимодействия:** якорь М30 (захват базы, `666-669`), жетоны М12 (удаление), пул заданий `buildTaskPool` М00.
9. **Аудит:** `map.generate`, `map.reroll_tasks`, `map.clear` (`server/src/controllers/map-generator.controller.ts:17`, `55`, `80`) — после.
10. **Клиент:** `client/src/features/admin/AdminMapPage.tsx`, `client/src/features/admin/AdminSectorTasksPage.tsx`.

### М43. Организационные механики вне игрового цикла (обнаружено, кратко)

Распределение детей по командам (`server/src/services/distribution.service.ts:387`), очередь выбора цвета (`server/src/services/distribution.service.ts:469`), перекрут капитанов (`server/src/services/team.service.ts:432`) — случайные операции S7 до/между игровыми днями. На правила поля не влияют, кроме того что капитан не может действовать на поле (`server/src/services/submission.service.ts:263-266`) и один тратит очки апгрейда (М34). В `server/src/controllers/distribution.controller.ts` вызовов `audit.record` нет; перекрут капитанов — `team.reroll_captains` (`server/src/controllers/team.controller.ts:138`).

---

## 8. Сводные разделы

### 8.1. Матрица «механика × стадия»

Пусто = не затрагивает. Имена функций; `sub` = `submission.service`, `law` = `law.service`, `pur` = `purchase.service`, `div` = `diversion.service`, `enc` = `encounter.service`, `cong` = `congress.service`, `gs` = `game-settings.service`, `ts` = `team-stats.service`, `ss` = `special-sector.service`, `mg` = `map-generator.service`, `tr` = `trophy.service`.

| Механика | S0 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|---|
| М00 Базовый цикл | | sub.validateActionForSector | sub.buildTaskPool, pickRandom | | sub.applyApprovedEffect | sub.revertPendingEffect | score-sql | | SectorActionModal.computeAvailable | sub.DETAILS_SELECT |
| М01 Законы (текст) | | | | | | | | cong.createLaw/setLawStatus/deleteLaw | AdminCongressPage, LawsPage | cong.listPublicLaws |
| М02 Вето | | | | | | | influenceExpr | cong.vetoLaw | AdminCongressPage | |
| М03 Свинский поступок | | | | | | | | cong.piggishDeed | AdminCongressPage | |
| М04 Землетрясение | | | | | | | influenceExpr (no_reward) | cong.earthquake | AdminCongressPage | |
| М05 Телепорт | | sub.assertTeleport | | | | | experienceExpr (штраф) | | SectorActionModal (teleport) | |
| М06 active_law | | sub.assertTeleport | | | | | | gs.setActiveLaw | MapPage | gs.getActiveLaw |
| М07 Колесо | | | | | sub.consumeQueuePriority | sub.consumeQueuePriority (reject) | score-sql (adjustments) | law.spinWheel, applyArmed, cancel | FortuneWheelModal, LawPanel | sub.getPending (ORDER BY) |
| М08 Граффити | | sub.bordersOwnTerritory | | | law.clearGraffitiOnCapture | | | law.paintGraffiti, washGraffiti | HexMap, MapPage.capturedKeys | |
| М09 Рука помощи | | | | sub.rerollTask | | | | law.grantHelpingHand | SectorPage | sub.DETAILS_SELECT.extra_reroll |
| М10 Встречи | | | enc.rollForCapture | enc.resolve, evaluate, applyEffect | | | ts.adminSetResources/adminSetStats | enc.setActive | SectorActionModal, AdminEncountersPage | enc.toInstanceView |
| М11 Проверка по составу | | | enc.rollForCapture | evaluate (isRosterNumber) | | | | enc.syncRosterChecks, setTarget | AdminEncountersPage | |
| М12 Жетоны | | | | | sub.applyApprovedEffect (merchant) | | | pur.spendToken, div.spendSaboteurToken, merchant.spendToken, mg.clearSeasonSectors | MerchantTokenTray | ts.getPurchaseTokens |
| М13 Жетон за укрепление | | | | | sub.applyApprovedEffect (fortify) | | | | AdminReviewQueue | |
| М14 Торговцы | | | | | | | | mg.assignMerchantsAfterGeneration | HexMap (merchantMarkers) | sub.getCurrentForSector (скрытие) |
| М15 Слоты | | | | | | | | pur.buy, getSlots, cancel | PurchasePanel | pur.armedForUser, list |
| М16 Раздвоение | | sub.startAction (pendingCount) | pur.consume | | | | | pur.buy | MapPage.splitArmed | |
| М17 К.И.П. | | | sub.buildKipTaskPool | | | | | pur.buy | | |
| М18 Чип | | | | | | | | pur.applyInstant(chip) | PurchasePanel | |
| М19 ЩИТ | | | | | | | | div.cast | TeamPage | |
| М20 Высокий старт | | | | | ss.captureSpecialSector | | | pur.buy | | |
| М21 LEVEL UP | | | | | | | score-sql (adjustments) | pur.applyInstant(level_up) | | |
| М22 Батут | | sub.assertWithinReach(canJump) | pur.consume | | | | | pur.buy | | |
| М23 Труба | sub.peekSector | | | | | | | pur.buy | | |
| М24 Подушка | | | | | | sub.dropPending | tr (стрик) | pur.buy | DropSectorConfirmModal | |
| М25 Кирпичи | | | | | | | score-sql, tr (стрик) | pur.applyInstant(bricks) | PurchasePanel | |
| М26 Доп. рука | | | | | | | | pur.applyInstant(extra_hand), getSlots | | |
| М27 Переборка | | | | | | | ts (доступные очки) | pur.applyInstant(refit) | | |
| М28 Диверсии | sub.peekSector (false_scouting) | sub.assertWithinReach (hard_reset) | sub.startAction (hard pool, opponent_move) | | sub.applyApprovedEffect (no_reward) | | influenceExpr, team_penalties | div.cast, applyInstant, cancel | DiversionPanel | |
| М29 Пробитие | | sub.startAction | | | | | | | SectorActionModal | |
| М30 Передвижение | | sub.assertWithinReach, getTeamAnchor, bordersOwnTerritory | | | | | | | MapPage.reachableIds | ts.getFullStats (anchor) |
| М31 Проверки | sub.peekSector | | | | sub.applyApprovedEffect (DELETE sector_peeks) | | | | SectorActionModal | |
| М32 Рероллы | | | | sub.rerollTask | | | | | SectorPage | sub.DETAILS_SELECT.rerolls_max |
| М33 Лидерство | | | | evaluate (check/sum) | | | tr (universal) | | TeamSidePanel (корона) | |
| М34 Уровень/очки | | | | | | sub.calculateLevelInTx | ts.calculateLevel, getFullStats | ts.upgradeStat | TeamPage | |
| М35 Особые сектора | sub.peekSector (запрет) | sub.startAction (запрет) | | | ss.captureSpecialSector | | score-sql (is_special) | | SpecialSectorModal | |
| М36 Укрепление | | sub.validateActionForSector | | | sub.applyApprovedEffect (fortify/remove/сброс) | | score-sql | pur (bricks), law.applyArmed, div (strip), cong.earthquake | SectorActionModal | |
| М37 ×1.5 | | | | | sub.applyApprovedEffect (снимок) | | score-sql | gs.setRewardBoost | MapPage | pur.rewardMultiplier |
| М38 Пропорц. награда | | | | | | | score-sql (adjustments) | applyProportionalAward | AdminAwardsPage | |
| М39 Сброс | | | | | | sub.dropPending | tr (сегменты стрика) | | DropSectorConfirmModal | |
| М40 Кубки | | | | | | | tr.METRICS_QUERY, buildTrophy | tr.setOverride | TrophySection, AdminTrophiesPage | |
| М41 Ручные правки | | | | | | | score-sql | ts.adminSetResources, adminSetStats | team-modals | |
| М42 Генерация карты | | | | | | | | mg.generateMap, rerollSectorTasks | AdminMapPage | |

### 8.2. Взаимодействия (пары механик с доказательствами)

| # | Пара | Характер | Доказательство |
|---|---|---|---|
| 1 | К.И.П. ↔ `hard_reset` | приоритет пула: К.И.П. > сложный > сектор | `server/src/services/submission.service.ts:521-533` |
| 2 | `hard_reset` ↔ Передвижение | якорь = база вместо последнего захвата | `server/src/services/submission.service.ts:126-128`, `476` |
| 3 | Телепорт ↔ Передвижение/Батут | телепорт заменяет проверку досягаемости; батут не тратится | `server/src/services/submission.service.ts:461-479`, `584` |
| 4 | Телепорт ↔ `hard_reset` | диверсия снимается, сложный пул применяется | `server/src/services/submission.service.ts:451-453`, `527-533`, `563-572` |
| 5 | Телепорт ↔ Пробитие | пробитие проверяется и при телепорте | `server/src/services/submission.service.ts:484-494` |
| 6 | Телепорт ↔ Уровень | штраф опытом без удаления характеристик | `server/src/services/submission.service.ts:198-202`, `1275-1292` |
| 7 | Батут ↔ Соседство | пропуск соседства, не досягаемости | `server/src/services/submission.service.ts:147-157` |
| 8 | Граффити ↔ Соседство | краска = своя клетка | `server/src/services/submission.service.ts:68` |
| 9 | Граффити ↔ Захват | одобренный захват смывает краску | `server/src/services/submission.service.ts:929`, `server/src/services/law.service.ts:574-591` |
| 10 | Граффити ↔ Землетрясение | землетрясение краску не смывает | `server/src/services/congress.service.ts:255-268` |
| 11 | Раздвоение ↔ «одна заявка» | вторая заявка только с имплантом | `server/src/services/submission.service.ts:513-519` |
| 12 | Рука помощи ↔ Удача | тратится только сверх лимита | `server/src/services/submission.service.ts:1354-1364` |
| 13 | Реролл ↔ К.И.П./`hard_reset` | реролл берёт обычный пул сектора | `server/src/services/submission.service.ts:1372` |
| 14 | Труба ↔ Интеллект | тратится после исчерпания бюджета | `server/src/services/submission.service.ts:1465-1477` |
| 15 | `false_scouting` ↔ Проверка/Труба | подмена пула на любой новой проверке, ложь запоминается | `server/src/services/submission.service.ts:1457-1463`, `1481-1498` |
| 16 | Проверки ↔ Захват | бюджет сбрасывается на одобрении (пере)захвата | `server/src/services/submission.service.ts:954` |
| 17 | ЩИТ ↔ Диверсии | гашение до эффекта; не для диверсий без цели | `server/src/services/diversion.service.ts:309-336` |
| 18 | `no_reward` ↔ ×1.5 | компенсация фиксируется с текущим множителем | `server/src/services/submission.service.ts:931-946`; `server/src/services/score-sql.ts:44-48` |
| 19 | `no_reward` (диверсия) ↔ Землетрясение | общий флаг `sectors.no_reward`; перезаписывается следующим захватом | `server/src/services/submission.service.ts:914`, `server/src/services/congress.service.ts:264` |
| 20 | Подушка ↔ Сброс | штраф 0, строка `drop` не пишется | `server/src/services/submission.service.ts:1237-1261` |
| 21 | Подушка ↔ Стрик | нет строки `drop` ⇒ нет разрыва сегмента | `server/src/services/trophy.service.ts:209-212` |
| 22 | Сброс ↔ Уровень/Характеристики | потеря уровня удаляет случайные характеристики | `server/src/services/submission.service.ts:1275-1292` |
| 23 | Сброс ↔ Колесо (`queue_priority`) | сброс приоритет не тратит | `server/src/services/submission.service.ts:847-852` |
| 24 | Сброс/Отклонение ↔ Встреча | экземпляр встречи не закрывается | `server/src/services/submission.service.ts:1097-1141`, `1183-1310` (нет `encounter_instances`) |
| 25 | Укрепление ↔ Жетон торговца | поднятый уровень чеканит плавающий жетон | `server/src/services/submission.service.ts:982-996` |
| 26 | Мешок цемента ↔ Жетон торговца | чеканит | `server/src/services/law.service.ts:399` |
| 27 | Кирпичи ↔ Жетон торговца | не чеканит | `server/src/services/purchase.service.ts:463-495` |
| 28 | Кирпичи/Цемент ↔ Стрик | запись `sector_fortification_awards` = событие стрика | `server/src/services/purchase.service.ts:486-489`, `server/src/services/law.service.ts:395-398`, `server/src/services/trophy.service.ts:165-167` |
| 29 | Захват ↔ Укрепление | захват обнуляет уровень | `server/src/services/submission.service.ts:913` |
| 30 | Землетрясение ↔ Укрепление | обнуление без компенсации бонуса | `server/src/services/congress.service.ts:243-251`, `263` |
| 31 | Землетрясение ↔ Правители | сектор входит в `captured_count` | `server/src/services/trophy.service.ts:181-183` |
| 32 | Высокий старт ↔ Особые сектора | место −1 | `server/src/services/special-sector.service.ts:100-122` |
| 33 | Особые сектора ↔ Чемпионы/Стрик | 1-е место — событие | `server/src/services/trophy.service.ts:169-171`, `224-230` |
| 34 | Встречи ↔ Переборка | компенсация `upgrade_points_delta` переживает удаление характеристик | `server/src/services/encounter.service.ts:402-410`, `server/src/services/purchase.service.ts:504-514`, `server/src/services/team-stats.service.ts:107` |
| 35 | Встречи ↔ Ручные правки | встреча применяется через `adminSetResources/adminSetStats` | `server/src/services/encounter.service.ts:382-400` |
| 36 | ×1.5 ↔ Колесо/LEVEL UP | мгновенные призы умножаются | `server/src/services/law.service.ts:234`, `239`, `257`; `server/src/services/purchase.service.ts:455` |
| 37 | ×1.5 ↔ Сброс | штраф без множителя | `server/src/services/submission.service.ts:1219-1239` |
| 38 | ×1.5 ↔ Ядро | ядро исключено | `server/src/services/submission.service.ts:916`, `server/src/services/game-settings.service.ts:104` |
| 39 | Вето ↔ Влияние | обладатель вето — топ по влиянию | `server/src/services/congress.service.ts:123-127` |
| 40 | Свинский поступок ↔ Диверсии | жетон диверсанта | `server/src/services/congress.service.ts:156-164`, `server/src/services/diversion.service.ts:181-199` |
| 41 | Чип ↔ любые armed-товары | копия старейшего, мимо проверки дубля | `server/src/services/purchase.service.ts:430-452`, `554-565`, `609-625` |
| 42 | Торговцы ↔ Жетоны | `merchant_type` сектора → жетон | `server/src/services/submission.service.ts:957-968` |
| 43 | Генерация карты ↔ Жетоны/Якорь | жетоны удаляются; база — первый захват | `server/src/services/map-generator.service.ts:633-637`, `666-669` |
| 44 | Особые сектора ↔ все действия поля | запрет старта и разведки | `server/src/services/submission.service.ts:440-442`, `1437-1439` |

### 8.3. Покрытие аудитом

**Общий факт:** все вызовы `audit.record` сделаны в контроллерах после возврата сервиса, без
параметра `db`, т.е. вне транзакции изменения (1.5). Логируемые операции «внутри транзакции»
отсутствуют.

**Логируются (все — после транзакции):**

| Действие аудита | Контроллер | Что в метаданных не попадает |
|---|---|---|
| `submission.<type>` | `server/src/controllers/submission.controller.ts:33-41` | телепорт, списанные диверсии/импланты, розыгрыш встречи, штраф телепорта |
| `submission.reroll` | `server/src/controllers/submission.controller.ts:73-81` | прежний и новый `task_id`, трата руки помощи |
| `sector.<type>` (одобрение) | `server/src/controllers/submission.controller.ts:134-142` | `no_reward`, чеканка жетонов, смыв граффити, сброс проверок, `queue_priority` |
| `submission.reject` | `server/src/controllers/submission.controller.ts:160-168` | `queue_priority` |
| `submission.drop` | `server/src/controllers/submission.controller.ts:186-194` | подушка, `removed_stats`, уровни |
| `congress.*` (8 видов) | `server/src/controllers/congress.controller.ts:52`, `73`, `98`, `120`, `142`, `158`, `174`, `204` | распределение землетрясения |
| `law.*` (6 видов) | `server/src/controllers/law.controller.ts:37`, `61`, `80`, `105`, `130`, `152` | — |
| `purchase.buy`, `purchase.cancel` | `server/src/controllers/purchase.controller.ts:58`, `89` | — |
| `diversion.cast`, `diversion.cancel` | `server/src/controllers/diversion.controller.ts:38`, `68` | — |
| `encounter.resolve`, `encounter.roster_sync` | `server/src/controllers/encounter.controller.ts:82`, `53` | — |
| `sector.special_capture` | `server/src/controllers/sector.controller.ts:53` | трата высокого старта |
| `team.proportional_award` | `server/src/controllers/proportional-award.controller.ts:28` | — |
| `team.set_resources`, `team.set_stats` | `server/src/controllers/team-stats.controller.ts:83`, `110` | — |
| `merchant.token_spend` | `server/src/controllers/merchant.controller.ts:20` | — |
| `map.generate`, `map.reroll_tasks`, `map.clear` | `server/src/controllers/map-generator.controller.ts:17`, `55`, `80` | раскладка торговцев и заданий (`map.generate` пишет только число и пресет, `server/src/controllers/map-generator.controller.ts:22`) |

**Не логируются в `audit_log` (меняют состояние):**

| Операция | Где | Что меняет |
|---|---|---|
| Разведка (проверка) | `server/src/controllers/submission.controller.ts:88-104` | `sector_peeks`, заряд трубы, `false_scouting` |
| Трата очка апгрейда капитаном | `server/src/controllers/team-stats.controller.ts:23-60` | `team_stat_upgrades` |
| Переключение ×1.5 | `server/src/controllers/game-settings.controller.ts:41-49` | `game_settings`, `sectors.reward_multiplier` |
| Изменение настроек (`base_exp_threshold`, `exp_step`, …) | `server/src/controllers/game-settings.controller.ts:22-39` | `game_settings` (уровни всех команд) |
| Видимость кубков | `server/src/controllers/game-settings.controller.ts:51-59` | `game_settings` |
| Ручной победитель кубка | `server/src/controllers/trophy.controller.ts:76` | `trophy_overrides` |
| Вкл/выкл встречи, перепривязка проверки по составу | `server/src/controllers/encounter.controller.ts:14-43` | `random_encounters` |
| Распределение по командам, выбор цвета | `server/src/controllers/distribution.controller.ts` (нет `audit.record`) | `season_participants`, `teams.color` |
| Автосрабатывание armed-эффектов (диверсии, импланты, `queue_priority`, рука помощи) | `takeArmed/consume` в `submission.service`, `special-sector.service`, `diversion.service` | статусы в `team_diversions`/`team_purchases`/`team_law_effects` (свой журнал есть, в `audit_log` — нет) |
| Розыгрыш встречи | `server/src/services/encounter.service.ts:246-264` | `encounter_instances` |
| Чеканка жетонов при захвате/укреплении | `server/src/services/submission.service.ts:957-968`, `988-995` | `team_purchase_tokens` |
| Штрафы телепорта и `no_reward` | `server/src/services/submission.service.ts:198-202`, `941-946` | `team_penalties` |
| Удаление характеристик при сбросе | `server/src/services/submission.service.ts:1278-1292` | `team_stat_upgrades` |
| Автосмыв граффити, перекраска поверх | `server/src/services/law.service.ts:574-591`, `490-500` | `sectors.graffiti_team_id`, `team_law_effects` |

### 8.4. Источники случайности

| # | Источник | Где | Сохраняется результат | Восстановим ли |
|---|---|---|---|---|
| R1 | Выбор задания на старте | `server/src/services/submission.service.ts:367` (`Math.random`) | `task_submissions.task_id` | выбор — да; пул — нет |
| R2 | Выбор задания при реролле | `server/src/services/submission.service.ts:1378` | перезапись `task_id`, `reroll_count` | прежние задания — нет |
| R3 | Подменный пул `false_scouting` | `server/src/services/submission.service.ts:358` (`random()`) | `sector_peeks.lie_task_ids` | да, до сброса проверок (`954`) |
| R4 | Удаление характеристик при сбросе | `server/src/services/submission.service.ts:1284` (`random()`) | нет (строки удалены, в аудите нет) | нет |
| R5 | Выбор встречи | `server/src/services/encounter.service.ts:253` (`random()`) | `encounter_instances.encounter_number` | да |
| R6 | Характеристика `random` во встрече | `server/src/services/encounter-engine.ts:102` | `encounter_instances.applied` (после разрешения) | итог — да; превью пересчитывается |
| R7 | Бросок `gamble` | `server/src/services/encounter-engine.ts:291` | исход в `applied`/`outcome_text`, выбор в `choice` | исход — да, бросок — нет |
| R8 | Приз колеса | `server/src/services/law.service.ts:133-142` | `team_law_effects.kind` | да (при замене дубля исходный бросок теряется, `297-307`) |
| R9 | Землетрясение: команды и сектора | `server/src/services/congress.service.ts:189`, `212` | только состояние секторов | из аудита — нет (только число) |
| R10 | Раздача заданий по карте | `server/src/services/map-generator.service.ts:314-321`, `359`, `374` | `sector_tasks` / `sectors.task_id` | текущее — да, прежнее — нет |
| R11 | Раскладка торговцев | `server/src/services/map-generator.service.ts:609`; `server/src/migrations/080_merchants_on_new_sectors.sql:19` | `sectors.merchant_type` | текущее — да |
| R12 | Организационные (дети, цвет, капитаны, коды) | `server/src/services/distribution.service.ts:387`, `469`; `server/src/services/team.service.ts:432`; `server/src/services/children-list.service.ts:21` | в состоянии | вне игровых правил |

Сидов и детерминированного ГПСЧ в коде нет; клиент случайность не генерирует (в `client/src` вызовов `Math.random` нет), анимация колеса доигрывает серверный результат (`server/src/services/law.service.ts:23-26`).

### 8.5. Врезки механик в `submission.service.ts`

Условия и ветки, специфичные для механики, расположенные внутри функций базового цикла. Все номера строк в этой таблице — `server/src/services/submission.service.ts`.

| # | Функция | Строки | Условие / действие | Механика |
|---|---|---|---|---|
| 1 | `bordersOwnTerritory` | `68` | `OR graffiti_team_id = $1` | Граффити |
| 2 | `assertWithinReach` | `126-128` | `fromHome ? getTeamHomeBase` | Диверсия `hard_reset` |
| 3 | `assertWithinReach` | `132-142` | `dist > movementFromEndurance(endurance)` | Передвижение |
| 4 | `assertWithinReach` | `147-156` | `captured_by_team_id !== teamId && !bordersOwnTerritory` | Соседство (Передвижение) |
| 5 | `assertWithinReach` | `149-155` | `canJump` → `return true` | Батут |
| 6 | `assertTeleport` | `168-203` | `active_law !== 'teleport'`, `experience < TELEPORT_COST`, штраф | Телепорт / active_law |
| 7 | `validateActionForSector` | `373`, `381`, `397` | `sector.is_home_base` | Укрепление (базы) |
| 8 | `validateActionForSector` | `392` | `fortification_level >= MAX_FORTIFICATION` | Укрепление |
| 9 | `validateActionForSector` | `406` | `fortification_level <= 0` | Укрепление |
| 10 | `startAction` | `440-442` | `sector.is_special` | Особые сектора |
| 11 | `startAction` | `451-453` | `isSectorRun ? takeArmed('hard_reset')` | Диверсии |
| 12 | `startAction` | `454` | `takeArmed('opponent_move')` | Диверсии |
| 13 | `startAction` | `458` | `takeArmed('trampoline')` | Батут |
| 14 | `startAction` | `461-466` | `if (teleport)` | Телепорт |
| 15 | `startAction` | `472-478` | `hardResetId !== null`, `trampolineId !== null` | Диверсии, Батут |
| 16 | `startAction` | `484-494` | `recapture && fortification_level > penetration` | Пробитие |
| 17 | `startAction` | `513-519` | `pendingCount === 1 ? takeArmed('split_capture')` | Раздвоение |
| 18 | `startAction` | `524-525` | `takeArmed('kip')`, `buildKipTaskPool` | К.И.П. |
| 19 | `startAction` | `527-533` | `kipPool > hardPool > buildTaskPool` | К.И.П., Диверсии |
| 20 | `startAction` | `563-572` | `if (hardResetId) consume` | Диверсии |
| 21 | `startAction` | `573-579` | `if (opponentMoveId) consume` | Диверсии |
| 22 | `startAction` | `584-590` | `trampolineId && jumped` | Батут |
| 23 | `startAction` | `591-597` | `if (splitId)` | Раздвоение |
| 24 | `startAction` | `598-604` | `kipId && kipPool.length > 0` | К.И.П. |
| 25 | `startAction` | `609-617` | `capture \|\| recapture` → `rollForCapture` | Встречи |
| 26 | `startAction` (catch) | `634` | `constraint === 'idx_task_submissions_one_pending_per_team'` | Раздвоение («одна заявка») |
| 27 | `DETAILS_SELECT` | `663-668` | `CASE COUNT(luck)` → `rerolls_max` | Рероллы |
| 28 | `DETAILS_SELECT` | `670-675` | `EXISTS extra_reroll armed` | Рука помощи |
| 29 | `DETAILS_SELECT` | `693` | `s.merchant_type` | Торговцы |
| 30 | `DETAILS_SELECT` | `695-700` | `EXISTS queue_priority armed` | Колесо |
| 31 | `getCurrentForSector` | `835` | `role === 'admin' ? details : merchant_type null` | Торговцы |
| 32 | `getPending` | `841-842` | `ORDER BY queue_priority DESC` | Колесо |
| 33 | `approve`/`reject` → `consumeQueuePriority` | `853-868`, `1068`, `1120` | `takeArmed('queue_priority')` | Колесо |
| 34 | `applyApprovedEffect` | `897-901` | `takeArmed('no_reward')` | Диверсии |
| 35 | `applyApprovedEffect` | `913` | `fortification_level = 0` | Укрепление |
| 36 | `applyApprovedEffect` | `914` | `no_reward = $3` | Диверсии |
| 37 | `applyApprovedEffect` | `915-920` | `CASE core THEN 1 ELSE reward_multiplier` | ×1.5 |
| 38 | `applyApprovedEffect` | `929` | `clearGraffitiOnCapture` | Граффити |
| 39 | `applyApprovedEffect` | `931-952` | `if (noRewardId)` штраф опытом | Диверсии |
| 40 | `applyApprovedEffect` | `954` | `DELETE FROM sector_peeks` | Проверки |
| 41 | `applyApprovedEffect` | `960-968` | `if (merchantType)` жетон | Жетоны / Торговцы |
| 42 | `applyApprovedEffect` | `982-987` | `if (raised)` `sector_fortification_awards` | Укрепление |
| 43 | `applyApprovedEffect` | `991-995` | `if (raised)` жетон торговца | Жетон за укрепление |
| 44 | `applyApprovedEffect` | `999-1008` | `remove_fortification` −1 | Укрепление |
| 45 | `dropPending` | `1237-1248` | `takeArmed('airbag')` | Подушка |
| 46 | `dropPending` | `1238-1239`, `1249-1260` | половина награды → `team_penalties('drop')` | Сброс |
| 47 | `dropPending` | `1275-1292` | `levelsLost` → удалить случайные характеристики | Сброс |
| 48 | `rerollTask` | `1349-1350` | `rerollsFromLuck(luck)` | Рероллы |
| 49 | `rerollTask` | `1353-1364`, `1387-1392` | `reroll_count >= cap` → `extra_reroll` | Рука помощи |
| 50 | `peekSector` | `1437-1439` | `sector.is_special` | Особые сектора |
| 51 | `peekSector` | `1441-1442` | `checksFromIntelligence` | Проверки |
| 52 | `peekSector` | `1457-1463` | повторный просмотр → `lie_task_ids` | Диверсии (`false_scouting`) |
| 53 | `peekSector` | `1465-1477` | `used >= cap` → `takeArmed('spyglass')` | Труба |
| 54 | `peekSector` | `1481-1492` | `takeArmed('false_scouting')` | Диверсии |
| 55 | `peekSector` | `1501-1506`, `1510` | `consume`/`chargesLeft('spyglass')` | Труба |

**Счёт по механикам:**

| Механика | Врезок | № |
|---|---|---|
| Диверсии (`hard_reset`, `opponent_move`, `no_reward`, `false_scouting`) | 12 | 2, 11, 12, 15, 19, 20, 21, 34, 36, 39, 52, 54 |
| Укрепление (включая базы) | 6 | 7, 8, 9, 35, 42, 44 |
| Батут | 4 | 5, 13, 15, 22 |
| К.И.П. | 3 | 18, 19, 24 |
| Раздвоение | 3 | 17, 23, 26 |
| Колесо фортуны (`queue_priority`) | 3 | 30, 32, 33 |
| Подзорная труба | 2 | 53, 55 |
| Граффити | 2 | 1, 38 |
| Особые сектора | 2 | 10, 50 |
| Рука помощи | 2 | 28, 49 |
| Рероллы (удача) | 2 | 27, 48 |
| Проверки (интеллект) | 2 | 40, 51 |
| Передвижение / соседство (выносливость) | 2 | 3, 4 |
| Торговцы / жетоны | 3 | 29, 31, 41 |
| Сброс | 2 | 46, 47 |
| Телепорт / active_law | 2 | 6, 14 |
| Пробитие (сила) | 1 | 16 |
| Встречи | 1 | 25 |
| ×1.5 | 1 | 37 |
| Жетон за укрепление | 1 | 43 |
| Подушка | 1 | 45 |

Врезка 15 и 19 учтены у двух механик каждая, поэтому сумма по строкам (57) больше числа врезок (55).

---

## 9. Расхождения `docs/DOMAIN.md` и кода

| # | Документ | Код |
|---|---|---|
| 1 | Очки передвижения 0/1/2/3 (`docs/DOMAIN.md:74-79`); радиус «1 + очки передвижения» (`docs/DOMAIN.md:211`, `docs/DOMAIN.md:229-231`) | `movementFromEndurance` 0/3/5/7/9 (`server/src/services/stat-thresholds.ts:16-22`); отказ при `dist > reach` без «+1» (`server/src/services/submission.service.ts:134-136`) |
| 2 | Вето у команды с наибольшим лидерством (`docs/DOMAIN.md:50`) | по влиянию (`server/src/services/congress.service.ts:123-127`); отмечено в `docs/DOMAIN.md:232-233` |
| 3 | «Одно вето на съезд» (`docs/DOMAIN.md:214`) | одно на сезон (`server/src/services/congress.service.ts:115-121`) |
| 4 | Персонажи на С18, С19, С13, С7, С6, С12 (`docs/DOMAIN.md:225`) и на С9, С14, С15, С10, С5, С4 (`docs/DOMAIN.md:258-259`) | код — первый набор (`server/src/services/map-generator.service.ts:588`); второй — состояние после миграции 072 (`server/src/migrations/072_merchants_fixed_sectors.sql:19-26`), переписанное 080 |
| 5 | Подушка: «стрик сбивается» (`docs/DOMAIN.md:146`) | стрик делится только строками `drop`, которых при подушке нет (М24) |
| 6 | Укрепление «всегда даёт половину влияния и опыта» (`docs/DOMAIN.md:35-37`) | опыт — за строку журнала, влияние — пока держится уровень (`server/src/services/score-sql.ts:26-30`, `49-53`) |
| 7 | Настройка потолка укрепления (редактируется в админке) | не читается; потолок — константа 3 (М36) |
| 8 | «Раздвоение — начать захват сразу двух секторов» (`docs/DOMAIN.md:119`) | вторая заявка может быть любым действием (проверка не смотрит `action_type`, `server/src/services/submission.service.ts:506-519`) |
