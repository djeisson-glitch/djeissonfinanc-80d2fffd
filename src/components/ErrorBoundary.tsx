import { Component, type ReactNode } from 'react';

/**
 * Mostra uma mensagem visível em vez de tela branca quando um componente
 * filho joga erro durante o render. Sem isso, qualquer erro de runtime
 * silencioso (Invalid Date no date-fns, .map em undefined, etc) deixa o
 * usuário olhando pra nada e sem feedback.
 *
 * Reseta automaticamente quando a rota muda (key={pathname} no AppLayout).
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('ErrorBoundary capturou:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 max-w-3xl mx-auto">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-destructive">Algo deu errado nesta página</h2>
            <p className="text-sm text-muted-foreground">
              Um erro inesperado quebrou a renderização. O resto do app continua funcionando —
              tente voltar e abrir de novo, ou recarregar a página.
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Detalhes técnicos
              </summary>
              <pre className="mt-2 overflow-auto bg-background/50 p-2 rounded text-[10px] font-mono">
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack?.slice(0, 800)}
              </pre>
            </details>
            <div className="flex gap-2">
              <button
                onClick={() => this.setState({ error: null })}
                className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-sm px-3 py-1.5 rounded border hover:bg-muted"
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
