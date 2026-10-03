import { Router } from 'express';
import pg from 'pg';

export type DatabaseCheck = () => Promise<void>;

// Abre uma conexão curta e faz `select 1`.
// Chamadas simultâneas dividem a mesma checagem, para que uma rajada em /ready
// não vire uma rajada de conexões no banco, e o conjunto tem prazo total.
export function createDatabaseCheck(connectionString: string, timeoutMs = 2000): DatabaseCheck {
  const run = async () => {
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
      await client.end().catch(() => {});
    }
  };

  let inflight: Promise<void> | undefined;
  return () => {
    inflight ??= withDeadline(run(), timeoutMs * 2).finally(() => {
      inflight = undefined;
    });
    return inflight;
  };
}

function withDeadline(work: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('tempo esgotado')), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
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
      // Só o código: a mensagem do driver pode trazer host ou dados da conexão.
      req.log.warn({ code: (error as { code?: string }).code }, 'banco indisponível');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
