-- Ядро и домашние базы не должны стоять укреплёнными: разовая правка 073
-- накинула им +1 вместе со всеми захваченными секторами. Снимаем.
UPDATE sectors
   SET fortification_level = 0
 WHERE is_home_base = true
    OR difficulty_id IN (SELECT id FROM difficulty_levels WHERE slug = 'core');
