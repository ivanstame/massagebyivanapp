import React from 'react';

// Top-level error boundary so a render exception in any single
// component (modal, page, etc.) shows a recoverable error UI instead
// of unmounting the entire app and leaving the user staring at a
// blank white page. Logs to console + window so dev tools have a
// breadcrumb. Reset button forces a re-render of the subtree.

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info);
    this.setState({ info });
    try {
      window.__lastErrorBoundaryError = { error, info, at: new Date().toISOString() };
    } catch {}
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message || String(this.state.error);
    const stack = this.state.error?.stack || '';

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper-elev">
        <div className="max-w-lg w-full bg-paper-elev border border-line rounded-card shadow-atelier-sm p-6">
          <h1 className="font-display text-2xl text-ink mb-2">Something went wrong.</h1>
          <p className="text-sm text-ink-2 mb-4">
            The app hit an unexpected error. The page can usually recover by tapping the
            button below; if it keeps happening, paste the error text to whoever's helping
            you so they can fix it.
          </p>
          <div className="bg-paper-deep border border-line-soft rounded p-3 mb-4 max-h-48 overflow-auto">
            <p className="text-xs font-mono text-red-700 whitespace-pre-wrap">{message}</p>
            {stack && (
              <details className="mt-2">
                <summary className="text-[11px] text-ink-3 cursor-pointer">Stack trace</summary>
                <pre className="text-[10px] text-ink-3 whitespace-pre-wrap mt-1">{stack}</pre>
              </details>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 px-4 py-2 bg-[#B07A4E] text-white rounded font-medium text-sm hover:bg-[#8A5D36]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2 border border-line bg-paper-elev text-ink rounded font-medium text-sm hover:bg-paper-deep"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
