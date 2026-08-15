-- Закон «Граффити»: команда красит сектор в свой цвет, и только.
--
-- Краска ничего не приносит: ни влияния, ни опыта, ни стрика, ни зачёта
-- захватов — сектор остаётся свободным (`status`, `captured_by_team_id`,
-- `sector_captures` не трогаются), укрепить его нельзя, потому что укрепляют
-- только свой захваченный. Единственный игровой смысл — по покрашенному
-- сектору команда «ходит»: он считается своей территорией в правиле
-- соседства, поэтому от него можно захватывать соседние.
--
-- Досягаемость (очки передвижения от выносливости) краска НЕ меняет: якорь —
-- по-прежнему последний захваченный сектор. Иначе бесплатная покраска любой
-- клетки карты обнулила бы всю систему передвижения.
--
-- Хранение — колонкой на секторе: краска одна на сектор, снимается нажатием
-- («смыть»), а также сама сходит, когда сектор кто-то захватывает.

ALTER TABLE sectors
  ADD COLUMN graffiti_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Горячий путь: «где сейчас краска этой команды» — спрашивает правило соседства.
CREATE INDEX idx_sectors_graffiti
  ON sectors(graffiti_team_id)
  WHERE graffiti_team_id IS NOT NULL;

-- Журнал законов принимает второй закон: одна покраска — одна запись
-- ('armed' пока краска держится → 'consumed', когда смыта).
ALTER TABLE team_law_effects DROP CONSTRAINT team_law_effects_law_check;
ALTER TABLE team_law_effects ADD CONSTRAINT team_law_effects_law_check
  CHECK (law IN ('wheel_of_fortune', 'graffiti'));

ALTER TABLE team_law_effects DROP CONSTRAINT team_law_effects_kind_check;
ALTER TABLE team_law_effects ADD CONSTRAINT team_law_effects_kind_check
  CHECK (kind IN (
    -- колесо фортуны
    'influence',
    'experience',
    'upgrade_point',
    'trader_token',
    'saboteur_token',
    'queue_priority',
    'fortification',
    'jackpot',
    -- граффити
    'graffiti'
  ));
