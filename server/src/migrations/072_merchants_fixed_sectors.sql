-- Персонажи (мастер / диверсант / торговец) переезжают со случайных средних
-- секторов на фиксированные: С9, С14 — мастера, С15, С10 — диверсанты,
-- С5, С4 — торговцы. Так админ знает заранее, кого куда ставить, а карта
-- перегенерируется в те же клетки (map-generator.service: MERCHANT_PLACEMENT).
--
-- Уже выданные жетоны покупки не трогаем: они привязаны к сектору и команде,
-- которая его брала, и остаются в истории.

UPDATE sectors SET merchant_type = NULL WHERE merchant_type IS NOT NULL;

UPDATE sectors s
   SET merchant_type = p.kind
  FROM (VALUES
         ('master',   9),
         ('master',  14),
         ('saboteur', 15),
         ('saboteur', 10),
         ('trader',   5),
         ('trader',   4)
       ) AS p(kind, number),
       difficulty_levels dl
 WHERE dl.id = s.difficulty_id
   AND dl.slug = 'medium'
   AND s.number = p.number
   AND s.is_special = false
   AND s.is_home_base = false;
