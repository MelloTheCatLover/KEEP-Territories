-- Захват сектора теперь сразу даёт базовое укрепление 1 (см. submission
-- service). Догоняем уже захваченные сектора: +1 к уровню, потолок — 3.
UPDATE sectors
   SET fortification_level = LEAST(fortification_level + 1, 3)
 WHERE status = 'captured'
   AND captured_by_team_id IS NOT NULL;
