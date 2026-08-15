-- Персонажи (мастер / диверсант / торговец) переезжают на новые клетки:
-- С18, С19, С13, С7, С6, С12. Кто на какой клетке — случайно: клетки известны
-- заранее, а расклад по видам новый (map-generator.service:
-- MERCHANT_SECTOR_NUMBERS + MERCHANT_KINDS, та же случайная раздача при
-- перегенерации карты).
--
-- Только активный сезон: карты архивных смен — это история, их персонажи
-- остаются там, где стояли во время игры.
--
-- Уже выданные жетоны покупки не трогаем: они привязаны к сектору и команде,
-- которая его брала, и остаются в истории.

UPDATE sectors
   SET merchant_type = NULL
 WHERE merchant_type IS NOT NULL
   AND season_id = (SELECT id FROM seasons WHERE status = 'active');

WITH cells AS (
  SELECT s.id, row_number() OVER (ORDER BY random()) AS pos
    FROM sectors s
    JOIN difficulty_levels dl ON dl.id = s.difficulty_id
   WHERE s.season_id = (SELECT id FROM seasons WHERE status = 'active')
     AND dl.slug = 'medium'
     AND s.is_special = false
     AND s.is_home_base = false
     AND s.number IN (18, 19, 13, 7, 6, 12)
), kinds AS (
  SELECT * FROM (VALUES
    (1, 'master'), (2, 'master'),
    (3, 'saboteur'), (4, 'saboteur'),
    (5, 'trader'), (6, 'trader')
  ) AS k(pos, kind)
)
UPDATE sectors s
   SET merchant_type = kinds.kind
  FROM cells
  JOIN kinds ON kinds.pos = cells.pos
 WHERE s.id = cells.id;
