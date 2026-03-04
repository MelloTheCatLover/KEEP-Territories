import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { validateEnv, env } from './config/env';
import { testConnection } from './config/db';

validateEnv();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
