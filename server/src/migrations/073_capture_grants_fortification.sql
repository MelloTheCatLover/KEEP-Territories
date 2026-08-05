-- Разовая правка баланса: всем захваченным на текущий момент секторам +1 к
-- укреплению, потолок — 3. Правила захвата не меняются: новые захваты
-- по-прежнему обнуляют укрепление.
UPDATE sectors
   SET fortification_level = LEAST(fortification_level + 1, 3)
 WHERE status = 'captured'
   AND captured_by_team_id IS NOT NULL;
