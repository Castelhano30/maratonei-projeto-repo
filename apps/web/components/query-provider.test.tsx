import { useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider } from './query-provider';

afterEach(cleanup);

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  window.dispatchEvent(new Event('visibilitychange'));
}

function Probe({ fetcher }: { fetcher: () => Promise<number> }) {
  const { data, isError } = useQuery({ queryKey: ['probe'], queryFn: fetcher });
  if (isError) return <p>erro final</p>;
  return <p>valor: {data ?? 'carregando'}</p>;
}

describe('QueryProvider', () => {
  it('refaz a consulta ativa quando a janela volta ao foco (UX-8)', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => ++calls);
    render(
      <QueryProvider>
        <Probe fetcher={fetcher} />
      </QueryProvider>,
    );
    await waitFor(() => expect(screen.getByText('valor: 1')).toBeTruthy());

    // A janela some e volta: o TanStack Query escuta `visibilitychange`.
    await act(async () => {
      setVisibility('hidden');
      setVisibility('visible');
    });

    await waitFor(() => expect(screen.getByText('valor: 2')).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('não reexecuta sozinho uma consulta que falhou (a retentativa é do cliente)', async () => {
    const fetcher = vi.fn(async (): Promise<number> => {
      throw new Error('falha');
    });
    render(
      <QueryProvider>
        <Probe fetcher={fetcher} />
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('erro final')).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
