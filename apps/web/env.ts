import { z } from 'zod';

// Lido só no servidor do Next (rewrites e SSR). Nunca importe este módulo em código do navegador.
const envSchema = z.object({
  INTERNAL_API_URL: z
    .url({ protocol: /^https?$/ })
    .refine((value) => {
      const url = new URL(value);
      return !url.search && !url.hash;
    })
    .default('http://localhost:3001'),
});

export type WebEnv = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): WebEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Só o nome da variável: o valor recebido pode ser sensível.
    const names = result.error.issues.map((issue) => issue.path.join('.') || '(raiz)');
    throw new Error(`Configuração de ambiente inválida: ${names.join(', ')}`);
  }
  return result.data;
}

export function loadEnv(): WebEnv {
  return parseEnv(process.env);
}
