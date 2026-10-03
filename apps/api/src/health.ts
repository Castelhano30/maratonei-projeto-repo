import { Router } from 'express';
import pg from 'pg';

export type DatabaseCheck = () => Promise<void>;

// Abre uma conexão curta e faz `select 1`. A 0.5 troca isto pelo Prisma.
export function createDatabaseCheck(connectionString: string, timeoutMs = 2000): DatabaseCheck {
  return async () => {
    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
    });
    // Evita que um erro assíncrono da conexão derrube o processo.
    client.on('error', () => {});
    await client.connect();
    try {
      await client.query('select 1');
    } finally {
      await client.end();
    }
  };
}

export function createHealthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  // Só informa que o processo vive. Nunca toca o banco: é o alvo do monitor externo.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok' });
    } catch (error) {
      req.log.warn({ err: error }, 'banco indisponível');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
