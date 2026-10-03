import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuração de ambiente inválida:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

// Nunca inclui o valor recebido na mensagem: só o nome da variável e o motivo.
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => {
        const name = issue.path.join('.') || '(raiz)';
        return issue.code === 'invalid_type' && source[name] === undefined
          ? `${name}: variável obrigatória ausente`
          : `${name}: valor inválido`;
      }),
    );
  }
  return result.data;
}

export function loadEnv(): Env {
  return parseEnv(process.env);
}
