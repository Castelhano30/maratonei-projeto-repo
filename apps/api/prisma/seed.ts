// Seed sintético de desenvolvimento (AD-15): nunca dado pessoal real. Idempotente.
// Ainda não há tabelas de domínio; cada história que cria uma tabela acrescenta aqui os seus dados.
import { createPrisma } from '../src/db.js';

const url = process.env['DATABASE_URL'] ?? process.env['DIRECT_URL'];
if (!url) {
  console.error('DATABASE_URL (ou DIRECT_URL) ausente: não há onde semear.');
  process.exit(1);
}

const db = createPrisma(url);
try {
  await db.$queryRaw`SELECT 1`;
  console.log('Seed sintético concluído (sem tabelas de domínio ainda).');
} finally {
  await db.$disconnect();
}
