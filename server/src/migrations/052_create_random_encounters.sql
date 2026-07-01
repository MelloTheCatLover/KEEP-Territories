-- Random encounters: rolled when a team starts capturing a sector. The outcome
-- depends on the acting team's stats. `random_encounters` is the pool (number +
-- narrative, toggleable); `encounter_instances` are rolled occurrences awaiting
-- admin resolution on the dedicated admin page.

CREATE TABLE random_encounters (
  number INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE encounter_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES task_submissions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
  encounter_number INTEGER NOT NULL REFERENCES random_encounters(number),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  choice VARCHAR(20),
  outcome_text TEXT,
  applied JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_encounter_instances_status ON encounter_instances(status, created_at DESC);
CREATE INDEX idx_encounter_instances_team ON encounter_instances(team_id);

INSERT INTO random_encounters (number, title) VALUES
  (1,  'Ты встретил старого путника, помоги ему.'),
  (2,  'Ты встретил загадочную даму. Ей нужна твоя помощь.'),
  (3,  'Перед тобой странный мужчина в очках. Он просит твоей помощи, поможешь?'),
  (4,  'Перед тобой странный зверь.'),
  (5,  'Ты перед окном в странный дом.'),
  (6,  'Странная бабуля спросила у тебя дороги.'),
  (7,  'Перед тобой грозный мужчина.'),
  (8,  'Перед тобой конверт. Откроешь?'),
  (9,  'Перед тобой конверт. Откроешь?'),
  (10, 'Перед тобой конверт. Откроешь?'),
  (11, 'Перед тобой конверт. Откроешь?'),
  (12, 'Перед тобой конверт. Откроешь?'),
  (13, 'Перед тобой конверт. Откроешь?'),
  (14, 'Качок: руби 4 силы.'),
  (15, 'Силовое противостояние команд.'),
  (16, 'Джигирис Данил в твоей команде?'),
  (17, 'Выбери команду, которая пересоберёт характеристики.'),
  (18, 'Проверка интеллекта.'),
  (19, 'Борьба за лидерство.'),
  (20, 'Бушуева Леля в твоей команде?'),
  (21, 'Зайцев Родион в твоей команде?'),
  (22, 'Кундаль Алина в твоей команде?'),
  (23, 'Лаврухина Аврора в твоей команде?'),
  (24, 'Попова Маша в твоей команде?'),
  (25, 'Испытание на все характеристики.'),
  (26, 'Проверка силы.'),
  (27, 'Проверка силы.'),
  (28, 'Учёный нуждается в совете.'),
  (29, 'Совет от меня.'),
  (30, 'Странное условие.'),
  (31, 'Перегрузка.'),
  (32, 'Подарок.');
