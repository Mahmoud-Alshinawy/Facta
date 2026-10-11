import { Component, ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-black text-white p-8">
          <div className="max-w-md">
            <h1 className="text-xl font-bold mb-2 text-red-500">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-4">The app crashed. Please restart or check the console for details.</p>
            <pre className="bg-gray-900 rounded-lg p-4 text-xs overflow-auto max-h-64 text-red-300">
              {this.state.error?.stack || this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
