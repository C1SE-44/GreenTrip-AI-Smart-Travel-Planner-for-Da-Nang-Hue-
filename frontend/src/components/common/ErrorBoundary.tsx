import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 800, margin: '40px auto', background: '#fff', border: '1px solid #fee2e2', borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
          <h2 style={{ color: '#dc2626', fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>
            ⚠️ Đã xảy ra lỗi giao diện (Runtime Error)
          </h2>
          <p style={{ color: '#4b5563', fontSize: 14, marginBottom: 16 }}>
            {this.state.error?.message || 'Lỗi không xác định'}
          </p>
          <pre style={{ background: '#f8fafc', padding: 16, borderRadius: 8, fontSize: 12, overflowX: 'auto', color: '#1e293b', border: '1px solid #e2e8f0', marginBottom: 20 }}>
            {this.state.error?.stack}
          </pre>
          {this.state.errorInfo && (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: 'pointer', color: '#6b7280', fontSize: 13, fontWeight: 600 }}>Chi tiết Component Stack</summary>
              <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto', marginTop: 8 }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{ padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Xóa LocalStorage & Tải lại
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '8px 18px', background: '#111827', color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
