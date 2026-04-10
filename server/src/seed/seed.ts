import { pool } from '../config/db';

interface DifficultyRow {
  id: string;
  slug: string;
}

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure difficulty_levels exist
    const diffResult = await client.query<DifficultyRow>(
      'SELECT id, slug FROM difficulty_levels ORDER BY influence_reward ASC'
    );

    if (diffResult.rows.length === 0) {
      console.log('No difficulty levels found. Run migrations first.');
      return;
    }

    const diffs: Record<string, string> = {};
    for (const row of diffResult.rows) {
      diffs[row.slug] = row.id;
    }
    console.log(`Found difficulties: ${Object.keys(diffs).join(', ')}`);

    // Seed tasks (2 per difficulty)
    const taskCount = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM tasks'
    );
    if (parseInt(taskCount.rows[0].count) === 0) {
      console.log('Seeding tasks...');
      const taskDefs = [
        { slug: 'easy',   title: 'Easy Question 1', question: 'What is 2 + 2?',         correct: '4',    wrong: ['3', '5'] },
        { slug: 'easy',   title: 'Easy Question 2', question: 'What color is the sky?',  correct: 'Blue', wrong: ['Red', 'Green'] },
        { slug: 'medium', title: 'Medium Question 1', question: 'What is 12 × 12?',      correct: '144',  wrong: ['132', '156'] },
        { slug: 'medium', title: 'Medium Question 2', question: 'Capital of France?',    correct: 'Paris', wrong: ['London', 'Berlin'] },
        { slug: 'hard',   title: 'Hard Question 1', question: 'Square root of 169?',     correct: '13',   wrong: ['11', '15'] },
        { slug: 'hard',   title: 'Hard Question 2', question: 'What is 7 factorial?',    correct: '5040', wrong: ['720', '2520'] },
        { slug: 'core',   title: 'Core Question 1', question: 'Binary of 255?',          correct: '11111111', wrong: ['11110000', '10101010'] },
        { slug: 'core',   title: 'Core Question 2', question: 'log₂(1024)?',             correct: '10',   wrong: ['8', '12'] },
      ];

      for (const t of taskDefs) {
        const diffId = diffs[t.slug];
        if (!diffId) continue;

        const taskRes = await client.query<{ id: string }>(
          `INSERT INTO tasks (title, question, difficulty_id) VALUES ($1, $2, $3) RETURNING id`,
          [t.title, t.question, diffId]
        );
        const taskId = taskRes.rows[0].id;

        await client.query(
          `INSERT INTO task_options (task_id, text, is_correct, sort_order) VALUES
           ($1, $2, true,  1),
           ($1, $3, false, 2),
           ($1, $4, false, 3)`,
          [taskId, t.correct, t.wrong[0], t.wrong[1]]
        );
      }
      console.log(`Seeded ${taskDefs.length} tasks.`);
    } else {
      console.log(`Tasks already exist (${taskCount.rows[0].count}), skipping.`);
    }

    // Seed sectors (hex grid, radius 2 = 19 sectors)
    const sectorCount = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM sectors'
    );
    if (parseInt(sectorCount.rows[0].count) === 0) {
      console.log('Seeding sectors...');

      // Axial coordinates for a hex grid of radius 2
      const hexCoords: Array<[number, number]> = [];
      const radius = 2;
      for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
          hexCoords.push([q, r]);
        }
      }

      const slugOrder = ['easy', 'easy', 'easy', 'easy', 'easy', 'easy',
                         'medium', 'medium', 'medium', 'medium', 'medium', 'medium',
                         'hard', 'hard', 'hard', 'hard',
                         'core', 'core', 'core'];

      for (let i = 0; i < hexCoords.length; i++) {
        const [q, r] = hexCoords[i];
        const slug = slugOrder[i % slugOrder.length];
        const diffId = diffs[slug] ?? diffs['easy'];
        await client.query(
          `INSERT INTO sectors (number, q, r, difficulty_id) VALUES ($1, $2, $3, $4)`,
          [i + 1, q, r, diffId]
        );
      }
      console.log(`Seeded ${hexCoords.length} sectors.`);
    } else {
      console.log(`Sectors already exist (${sectorCount.rows[0].count}), skipping.`);
    }

    console.log('Seed complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
