-- Товары мастера и торговца переезжают из офлайна в движок — тем же способом,
-- что и диверсии (076): жетон покупки списывается, а купленный товар живёт
-- записью со статусом. Мгновенные срабатывают сразу ('applied'), остальные
-- лежат у команды «имплантом» ('armed') и снимаются её действием на карте
-- ('consumed') либо председателем ('cancelled').
--
-- Влияние и опыт покупки не считают сами: плюс идёт через team_adjustments,
-- минус — через team_penalties, укрепление — через sectors.fortification_level
-- и sector_fortification_awards. Формулы score-sql.ts менять не нужно.

CREATE TABLE team_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  merchant VARCHAR(16) NOT NULL CHECK (merchant IN ('master', 'trader')),
  kind VARCHAR(32) NOT NULL CHECK (kind IN (
    -- мастер
    'split_capture',  -- раздвоение: захват сразу двух секторов
    'kip',            -- К.И.П.: копируй, инициализируй, побеждай
    'chip',           -- чип: копия импланта другой команды
    'shield',         -- ЩИТ: защита от одной диверсии
    'high_start',     -- высокий старт: преимущество в особом событии
    'level_up',       -- LEVEL UP: уровень + бонус эры
    -- торговец
    'trampoline',     -- батут: два прыжка через сектор
    'spyglass',       -- подзорная труба: три проверки сверх интеллекта
    'airbag',         -- подушка безопасности: сброс без штрафа
    'bricks',         -- кирпичи: бесплатное укрепление
    'extra_hand',     -- дополнительная рука: +1 слот под имплант
    'refit'           -- переборка: пересборка характеристик
  )),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Цель для «чипа» (у кого копируем) — у остальных товаров цели нет.
  target_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  -- Сектор для «кирпичей», либо сектор, на котором сработал заряженный товар.
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  -- Списанный жетон покупки. SET NULL, чтобы чистка жетонов не сносила историю.
  token_id UUID REFERENCES team_purchase_tokens(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'armed'
    CHECK (status IN ('applied', 'armed', 'consumed', 'cancelled')),
  -- Сколько срабатываний осталось: батут покупается сразу на два прыжка,
  -- подзорная труба — на три проверки. У остальных 1.
  charges_left SMALLINT NOT NULL DEFAULT 1 CHECK (charges_left >= 0),
  -- Человекочитаемый итог для журнала председателя.
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_team_purchases_team ON team_purchases(team_id);
-- Горячий путь: «есть ли у команды заряженный товар такого вида».
CREATE INDEX idx_team_purchases_armed
  ON team_purchases(team_id, kind)
  WHERE status = 'armed';

-- «Раздвоение» — единственный товар, ломающий правило «одно действие на
-- команду»: пока оно заряжено, команда ведёт две заявки сразу. Уникальный
-- индекс из 024 этого не позволяет, поэтому предел переезжает в код
-- (submission.service: одна заявка, две — если заряжено раздвоение).
DROP INDEX IF EXISTS idx_task_submissions_one_pending_per_team;
CREATE INDEX idx_task_submissions_pending_per_team
  ON task_submissions (team_id)
  WHERE status = 'pending';
