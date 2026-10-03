# UX-8: atualização ao voltar o foco para a janela

**Decisão (história 0.6):** confirmada. O TanStack Query refaz as consultas ativas quando a janela volta ao foco (`refetchOnWindowFocus` ligado, `staleTime` 0). Não há tempo real no MVP.

**Como vale:** a mudança feita por outra pessoa aparece ao abrir ou recarregar a tela e ao voltar o foco. Quem a apresenta não precisa de código próprio: toda consulta herda o padrão do provedor em `apps/web/components/query-provider.tsx`.

**Retentativa:** o provedor não reexecuta consultas por conta própria. A retentativa automática (só GET, até 2 vezes, só em falha de infraestrutura) é do cliente da API em `apps/web/lib/api`.

**Testado em:** `apps/web/components/query-provider.test.tsx`, com evento de foco simulado.

**Desbloqueia:** a atualização entre pessoas das histórias 3.8 e 5.5.
