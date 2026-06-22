-- Dedup children by surname + given name only, ignoring the patronymic and case.
-- Previously name_key was the whole whitespace-normalized full name, so adding
-- "Фамилия Имя Отчество" after "Фамилия Имя" created a second child (and a second
-- account). Recompute name_key to the lowercased first two name tokens so both
-- forms collapse onto the same registry entry going forward.

UPDATE children
SET name_key = lower(
  array_to_string(
    (regexp_split_to_array(btrim(full_name), '\s+'))[1:2],
    ' '
  )
);
