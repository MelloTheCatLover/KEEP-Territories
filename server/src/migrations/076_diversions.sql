-- Диверсии (товары диверсанта) переезжают из офлайна в движок.
--
-- Раньше жетон диверсанта только гасился админом («потрачено»), а эффект
-- отыгрывался на словах. Теперь применение диверсии — запись в журнале: она
-- списывает жетон (`team_purchase_tokens.spent_at`) и либо срабатывает сразу
-- (status = 'applied'), либо висит на команде-жертве до нужного момента
-- (status = 'armed' → 'consumed'), либо снимается админом ('cancelled').
--
-- Стрика диверсии не касаются: полоса — про занятие секторов, поэтому в
-- trophy.service стрик считается по-прежнему только по захватам и первым
-- местам в особых событиях.
--
-- Влияние/опыт не дублируются: диверсии ходят через те же каналы, что и
-- остальная игра (team_penalties — минус, team_adjustments — плюс,
-- sectors.fortification_level / no_reward — производное влияние), поэтому
-- формулы в score-sql.ts менять не нужно.

CREATE TABLE team_diversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL CHECK (kind IN (
    'trader_point',         -- очко покупки у следующего торговца
    'strip_fortification',  -- снять уровень укрепления с сектора на выбор
    'hard_reset',           -- следующий сектор как сложный + откат на базу
    'false_scouting',       -- следующая разведка покажет ложь
    'steal_influence',      -- забрать пять влияния у соперника
    'opponent_move',        -- следующий ход соперника делает диверсант
    'no_reward'             -- соперник не получает награду за сектор
  )),
  -- Кто применил (владелец жетона) и по кому. Цели нет только у 'trader_point'.
  caster_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  target_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  -- Сектор, если диверсия адресная ('strip_fortification'), либо сектор, на
  -- котором «заряженная» диверсия в итоге сработала.
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  -- Списанный жетон диверсанта. SET NULL, чтобы чистка жетонов не сносила
  -- историю применений.
  token_id UUID REFERENCES team_purchase_tokens(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'armed'
    CHECK (status IN ('applied', 'armed', 'consumed', 'cancelled')),
  -- Человекочитаемый итог: что именно произошло (для журнала админа).
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_team_diversions_caster ON team_diversions(caster_team_id);
-- Горячий путь: «висит ли на этой команде заряженная диверсия такого вида».
CREATE INDEX idx_team_diversions_armed
  ON team_diversions(target_team_id, kind)
  WHERE status = 'armed';

-- Ложная разведка должна лгать стабильно: повторный (бесплатный) просмотр уже
-- разведанного сектора обязан показать ту же ложь, иначе диверсия снимается
-- одним лишним кликом. Храним подсунутый пул прямо в записи разведки.
ALTER TABLE sector_peeks
  ADD COLUMN lie_task_ids UUID[];
