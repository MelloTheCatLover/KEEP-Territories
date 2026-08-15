-- Механические законы съезда: то, что председатель включает руками, а движок
-- отыгрывает сам. Первый такой закон — «Колесо фортуны»: председатель даёт
-- колесо команде, оно крутится и выдаёт плюшку из фиксированного набора.
--
-- Хранится тем же способом, что диверсии (076) и покупки (078): одна запись =
-- одно применение закона. Мгновенные плюшки срабатывают сразу ('applied'),
-- остальные ложатся команде ('armed') и снимаются либо её действием на карте
-- ('consumed'), либо председателем ('cancelled').
--
-- Влияние и опыт закон не считает сам: плюс идёт через team_adjustments,
-- жетоны — через team_purchase_tokens, укрепление — через
-- sectors.fortification_level и sector_fortification_awards. Формулы
-- score-sql.ts менять не нужно.

CREATE TABLE team_law_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  -- Какой закон сработал. Пока один, но список открыт для следующих.
  law VARCHAR(32) NOT NULL CHECK (law IN ('wheel_of_fortune')),
  -- Что именно выпало (плюшка колеса).
  kind VARCHAR(32) NOT NULL CHECK (kind IN (
    'influence',        -- мелочь в кармане: +2 влияния
    'experience',       -- разминка: +50 опыта
    'upgrade_point',    -- тренировка: +1 очко апгрейда
    'trader_token',     -- купон торговца: жетон лавки торговца
    'saboteur_token',   -- тёмный сговор: жетон диверсанта
    'queue_priority',   -- без очереди: приоритет в очереди сдачи
    'fortification',    -- мешок цемента: бесплатное укрепление своего сектора
    'jackpot'           -- джекпот: уровень, влияние и жетон мастера
  )),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Сектор, на котором плюшка в итоге сработала (пока только «мешок цемента»).
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'armed'
    CHECK (status IN ('applied', 'armed', 'consumed', 'cancelled')),
  -- Человекочитаемый итог для журнала председателя и страницы законов.
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_team_law_effects_team ON team_law_effects(team_id);
-- Горячий путь: «висит ли на команде незакрытая плюшка такого вида» —
-- очередь сдачи спрашивает это на каждый показ списка заявок.
CREATE INDEX idx_team_law_effects_armed
  ON team_law_effects(team_id, kind)
  WHERE status = 'armed';
