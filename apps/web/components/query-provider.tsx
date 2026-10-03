'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // UX-8: a mudança feita por outra pessoa aparece ao voltar o foco para a janela.
        refetchOnWindowFocus: true,
        // O cliente da API já reexecuta GET em falha de infraestrutura (AD-17).
        retry: false,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
