-- Remove the auto-grade (sandbox) feature: code-based easy tasks, per-task test
-- cases, and submission code-run columns. Re-seed manual easy tasks so freshly
-- generated maps still have something to assign to easy sectors.

-- 1) Detach code tasks from sectors and delete them (cascade kills task_test_cases).
DELETE FROM sector_tasks
 WHERE task_id IN (SELECT id FROM tasks WHERE code_language IS NOT NULL);

DELETE FROM tasks WHERE code_language IS NOT NULL;

-- 2) Drop autograde schema.
DROP TABLE IF EXISTS task_test_cases;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_code_language_check;
ALTER TABLE tasks DROP COLUMN IF EXISTS code_language;
ALTER TABLE tasks DROP COLUMN IF EXISTS code_template;

ALTER TABLE task_submissions DROP COLUMN IF EXISTS code;
ALTER TABLE task_submissions DROP COLUMN IF EXISTS last_run_at;
ALTER TABLE task_submissions DROP COLUMN IF EXISTS last_run_results;
ALTER TABLE task_submissions DROP COLUMN IF EXISTS auto_approved;

-- 3) Re-seed manual easy tasks (same list as 027) if none remain.
DO $body$
DECLARE
  d_easy UUID;
BEGIN
  SELECT id INTO d_easy FROM difficulty_levels WHERE slug='easy';
  IF d_easy IS NULL THEN RETURN; END IF;
  IF (SELECT COUNT(*) FROM tasks WHERE difficulty_id = d_easy) > 0 THEN RETURN; END IF;

  INSERT INTO tasks (title, question, difficulty_id) VALUES
    ('Переменная',           'Что такое переменная? Приведите пример объявления переменной с присваиванием значения.', d_easy),
    ('Типы данных',          'Перечислите основные типы данных и опишите, что каждый из них хранит.', d_easy),
    ('Арифметические операторы','Перечислите арифметические операторы и приведите по одному примеру использования каждого.', d_easy),
    ('Условие if/else',      'Объясните синтаксис if/else и приведите пример: вывести «чётное» или «нечётное» для числа n.', d_easy),
    ('Цикл for',             'Опишите цикл for и напишите пример, выводящий числа от 1 до 10.', d_easy),
    ('Цикл while',           'Чем отличается цикл while от for? Приведите пример while-цикла.', d_easy),
    ('Функция',              'Что такое функция? Определите функцию sum(a, b), возвращающую сумму двух чисел.', d_easy),
    ('Параметры функции',    'Чем параметр отличается от аргумента? Приведите пример вызова функции с несколькими аргументами.', d_easy),
    ('Возврат значения',     'Зачем нужен оператор return? Что произойдёт, если его не указать?', d_easy),
    ('Комментарии',          'Зачем нужны комментарии в коде? Покажите однострочный и многострочный комментарии в любом языке.', d_easy),
    ('Целочисленное деление','Чем целочисленное деление отличается от обычного? Приведите пример (например, 7 / 2 и 7 // 2).', d_easy),
    ('Остаток от деления',   'Что вычисляет оператор % (mod)? Как с его помощью проверить, что число чётное?', d_easy),
    ('Операторы сравнения',  'Перечислите операторы сравнения (==, !=, <, >, <=, >=) и приведите пример использования в условии.', d_easy),
    ('Логические операторы', 'Опишите операторы and / or / not и приведите по одному примеру каждого в условии if.', d_easy),
    ('Ввод данных',          'Как считать число с клавиатуры в выбранном языке? Приведите пример.', d_easy),
    ('Вывод данных',         'Как вывести строку и значение переменной на экран? Приведите пример.', d_easy),
    ('Строка',               'Что такое строковый тип? Создайте переменную со строкой «Привет, мир!» и выведите её.', d_easy),
    ('Конкатенация строк',   'Как объединить две строки в одну? Покажите пример.', d_easy),
    ('Длина строки',         'Как узнать длину строки? Приведите пример вычисления длины слова «программирование».', d_easy),
    ('Список (массив)',      'Что такое список (массив)? Создайте список из 5 чисел и выведите его.', d_easy),
    ('Индексация',           'Как обратиться к элементу списка по индексу? Что такое индекс и с какого числа он начинается?', d_easy),
    ('Добавление в список',  'Как добавить элемент в конец списка? Приведите пример.', d_easy),
    ('Преобразование типов', 'Как преобразовать строку «42» в целое число и обратно? Зачем это нужно?', d_easy),
    ('Булев тип',            'Что такое тип bool? Какие у него значения и где он используется?', d_easy),
    ('Проверка чётности',    'Напишите алгоритм проверки чётности числа без использования %. Опишите идею.', d_easy),
    ('Максимум двух чисел',  'Напишите функцию, возвращающую наибольшее из двух чисел.', d_easy),
    ('Сумма цифр числа',     'Опишите алгоритм нахождения суммы цифр натурального числа.', d_easy),
    ('Реверс строки',        'Как развернуть строку (получить её в обратном порядке)? Приведите пример.', d_easy),
    ('Чтение нескольких чисел','Как считать с клавиатуры несколько чисел в одной строке через пробел? Приведите код.', d_easy),
    ('Константа',            'Чем константа отличается от переменной? Как принято объявлять константы в коде?', d_easy);
END $body$;

-- 4) Bind every easy task to every easy sector (same logic as 027/032 binding).
INSERT INTO sector_tasks (sector_id, task_id)
SELECT s.id, t.id
  FROM sectors s
  JOIN tasks t ON t.difficulty_id = s.difficulty_id
 WHERE s.difficulty_id = (SELECT id FROM difficulty_levels WHERE slug = 'easy')
ON CONFLICT (sector_id, task_id) DO NOTHING;
