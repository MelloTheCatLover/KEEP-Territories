-- Ручное назначение победителя кубка.
--
-- Расчёт по метрике остаётся источником правды для всех остальных мест: оверрайд
-- только поднимает выбранную команду на 1-е место, остальные сдвигаются вниз с
-- сохранением своего относительного порядка. Так админ может выдать кубок за то,
-- что система не считает (offline-достижение, спорный судейский случай), не
-- переписывая журналы захватов и наград.
--
-- Одна запись на (сезон, кубок). Снятие оверрайда = удаление строки.
CREATE TABLE IF NOT EXISTS trophy_overrides (
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  trophy_key VARCHAR(32) NOT NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_id, trophy_key)
);

CREATE INDEX IF NOT EXISTS idx_trophy_overrides_team ON trophy_overrides(team_id);
