import { Component } from 'react';

export default class RenderErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const label = this.props.label || 'Render';
    console.error(`[chinwag] ${label} error:`, error, info.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#b0b0b0',
            fontFamily: 'system-ui',
          }}
        >
          <p style={{ fontSize: '1.1rem' }}>Something went wrong.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              background: '#2a2a2a',
              color: '#e0e0e0',
              border: '1px solid #444',
              borderRadius: '6px',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
