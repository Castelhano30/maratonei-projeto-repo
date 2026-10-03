import 'server-only';
import { cookies } from 'next/headers';
import { loadEnv } from '../../env';
import { createApiClient } from './client';

// Cliente para SSR: chama a API por INTERNAL_API_URL e repassa o cookie da requisição (AD-2).
export function createServerApi() {
  return createApiClient({
    baseUrl: loadEnv().INTERNAL_API_URL.replace(/\/$/, ''),
    getCookie: async () => (await cookies()).toString() || undefined,
  });
}
