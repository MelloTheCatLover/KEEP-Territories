-- More random encounters: a few "nothing" fake-outs and stat-wiping curses,
-- plus threshold/gamble variety. Logic lives in encounter-engine.ts.

INSERT INTO random_encounters (number, title) VALUES
  (33, 'Ты нашёл старый сундук. Открываешь его...'),
  (34, 'Вдалеке мерцает мираж.'),
  (35, 'Тебя охватило странное предчувствие.'),
  (36, 'Древнее проклятие настигло команду.'),
  (37, 'Катаклизм! Земля уходит из-под ног.'),
  (38, 'Загадочный торговец предлагает сделку.'),
  (39, 'Перед тобой фонтан молодости.'),
  (40, 'Испытание на прочность.'),
  (41, 'Испытание разума.'),
  (42, 'Ва-банк: рискнёшь всем ради награды?')
ON CONFLICT (number) DO NOTHING;
