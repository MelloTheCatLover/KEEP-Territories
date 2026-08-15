-- Закон «Рука помощи»: председатель раздаёт командам по одному
-- дополнительному рероллу.
--
-- Реролл тратится как обычный — просто сверх лимита от удачи. Больше одного
-- у команды не копится: раздача выдаёт его только тем, у кого сейчас нет,
-- поэтому повторное нажатие догоняет отставших, а не удваивает запас.
--
-- Хранится записью в журнале законов: 'armed' — лежит неистраченный,
-- 'consumed' — потрачен на перекрут, 'cancelled' — снят председателем.

ALTER TABLE team_law_effects DROP CONSTRAINT team_law_effects_law_check;
ALTER TABLE team_law_effects ADD CONSTRAINT team_law_effects_law_check
  CHECK (law IN ('wheel_of_fortune', 'graffiti', 'helping_hand'));

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
    'graffiti',
    -- рука помощи
    'extra_reroll'
  ));
