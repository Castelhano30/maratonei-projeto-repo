// Cliente para o navegador: caminhos relativos `/api/*`, nunca a URL direta da API (AD-2).
import { createApiClient } from './client';

export { ApiError } from './errors';
export { createApiClient, type ApiClient } from './client';

export const api = createApiClient();
