import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  key?: string | number;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    const self = this as any;
    if (self.state.hasError) {
      return (
        <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-8 text-center space-y-4 my-4 max-w-2xl mx-auto">
          <AlertOctagon className="mx-auto text-red-400" size={36} />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              {self.props.fallbackTitle || 'Component Error Encountered'}
            </h3>
            <p className="text-xs text-red-300 font-mono bg-slate-950/80 p-3 rounded-lg border border-red-900/50 break-words max-h-32 overflow-y-auto">
              {self.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
          </div>
          <button
            onClick={() => self.setState({ hasError: false, error: null })}
            className="inline-flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition"
          >
            <RefreshCw size={14} />
            Try Reloading View
          </button>
        </div>
      );
    }

    return self.props.children;
  }
}
