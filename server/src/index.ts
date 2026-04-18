import './types/express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { validateEnv, env } from './config/env';
import { testConnection } from './config/db';
import authRoutes from './routes/auth.routes';
import teamRoutes from './routes/team.routes';
import taskRoutes from './routes/task.routes';
import sectorRoutes from './routes/sector.routes';
import submissionRoutes from './routes/submission.routes';
import teamStatsRoutes from './routes/team-stats.routes';
import gameSettingsRoutes from './routes/game-settings.routes';
import difficultyRoutes from './routes/difficulty.routes';
import { errorHandler } from './middleware/error.middleware';
import { AppError } from './types/errors';

validateEnv();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/sectors', sectorRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/teams/:teamId/stats', teamStatsRoutes);
app.use('/api/settings', gameSettingsRoutes);
app.use('/api/difficulties', difficultyRoutes);

app.use((_req, _res, next) => {
  next(new AppError(404, 'Route not found'));
});

app.use(errorHandler);

const start = async () => {
  try {
    await testConnection();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
