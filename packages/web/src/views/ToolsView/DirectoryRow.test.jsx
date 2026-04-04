// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Component {...props} />);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function loadDirectoryRow() {
  vi.resetModules();

  vi.doMock('../../components/ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon({ tool }) {
      return <span data-testid="tool-icon">{tool}</span>;
    },
  }));

  const mod = await import('./DirectoryRow.js');
  return { default: mod.default, VerdictBadge: mod.VerdictBadge, ConfidenceDot: mod.ConfidenceDot };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('VerdictBadge', () => {
  it('renders "Integrated" for integrated verdict', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: 'integrated' });

    expect(container.textContent).toBe('Integrated');

    unmount();
  });

  it('renders "Installable" for installable verdict', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: 'installable' });

    expect(container.textContent).toBe('Installable');

    unmount();
  });

  it('renders "Listed" for listed verdict', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: 'listed' });

    expect(container.textContent).toBe('Listed');

    unmount();
  });

  it('maps legacy "compatible" to "Integrated"', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: 'compatible' });

    expect(container.textContent).toBe('Integrated');

    unmount();
  });

  it('maps legacy "partial" to "Installable"', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: 'partial' });

    expect(container.textContent).toBe('Installable');

    unmount();
  });

  it('falls back to "Listed" for unknown verdict', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: 'unknown' });

    expect(container.textContent).toBe('Listed');

    unmount();
  });

  it('falls back to "Listed" for undefined verdict', async () => {
    const { VerdictBadge } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(VerdictBadge, { verdict: undefined });

    expect(container.textContent).toBe('Listed');

    unmount();
  });
});

describe('ConfidenceDot', () => {
  it('renders the level text for high confidence', async () => {
    const { ConfidenceDot } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(ConfidenceDot, { level: 'high' });

    expect(container.textContent).toBe('high');

    unmount();
  });

  it('renders "unknown" for undefined level', async () => {
    const { ConfidenceDot } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(ConfidenceDot, { level: undefined });

    expect(container.textContent).toBe('unknown');

    unmount();
  });
});

describe('DirectoryRow', () => {
  const baseEvaluation = {
    id: 'cursor',
    name: 'Cursor',
    category: 'ide',
    verdict: 'integrated',
    tagline: 'AI-powered IDE',
    mcp_support: true,
    confidence: 'high',
    evaluated_by: 'claude',
    evaluated_at: '2026-01-01T00:00:00Z',
    metadata: {},
    sources: [],
  };

  const categories = { ide: 'IDE', cli: 'CLI' };

  it('renders the tool name and verdict', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: baseEvaluation,
      categories,
      isExpanded: false,
      onToggle: vi.fn(),
    });

    expect(container.textContent).toContain('Cursor');
    expect(container.textContent).toContain('Integrated');
    expect(container.textContent).toContain('IDE');
    expect(container.textContent).toContain('MCP');

    unmount();
  });

  it('shows dash when mcp_support is false', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: { ...baseEvaluation, mcp_support: false },
      categories,
      isExpanded: false,
      onToggle: vi.fn(),
    });

    expect(container.textContent).toContain('\u2014');

    unmount();
  });

  it('truncates tagline over 60 characters', async () => {
    const longTagline = 'A'.repeat(70);
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: { ...baseEvaluation, tagline: longTagline },
      categories,
      isExpanded: false,
      onToggle: vi.fn(),
    });

    expect(container.textContent).toContain('A'.repeat(60));
    expect(container.textContent).toContain('\u2026');

    unmount();
  });

  it('calls onToggle when row button is clicked', async () => {
    const onToggle = vi.fn();
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: baseEvaluation,
      categories,
      isExpanded: false,
      onToggle,
    });

    const btn = container.querySelector('button');
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalled();

    unmount();
  });

  it('shows expanded detail when isExpanded is true', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: {
        ...baseEvaluation,
        metadata: {
          website: 'https://cursor.com',
          github: 'https://github.com/getcursor/cursor',
          install_command: 'brew install cursor',
          notable: 'First AI-native IDE',
        },
        sources: [
          {
            claim: 'Fastest AI coding tool',
            citations: [{ url: 'https://example.com/review', title: 'Review' }],
          },
        ],
      },
      categories,
      isExpanded: true,
      onToggle: vi.fn(),
    });

    expect(container.textContent).toContain('AI-powered IDE');
    expect(container.textContent).toContain('First AI-native IDE');
    expect(container.textContent).toContain('Website');
    expect(container.textContent).toContain('cursor.com');
    expect(container.textContent).toContain('GitHub');
    expect(container.textContent).toContain('getcursor/cursor');
    expect(container.textContent).toContain('Install');
    expect(container.textContent).toContain('brew install cursor');
    expect(container.textContent).toContain('1 sources cited');
    expect(container.textContent).toContain('Fastest AI coding tool');
    expect(container.textContent).toContain('Review');
    expect(container.textContent).toContain('claude');

    unmount();
  });

  it('hides expanded detail when isExpanded is false', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: {
        ...baseEvaluation,
        metadata: { website: 'https://cursor.com' },
      },
      categories,
      isExpanded: false,
      onToggle: vi.fn(),
    });

    expect(container.textContent).not.toContain('Website');

    unmount();
  });

  it('sets aria-expanded on the toggle button', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: baseEvaluation,
      categories,
      isExpanded: true,
      onToggle: vi.fn(),
    });

    const btn = container.querySelector('button');
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    unmount();
  });

  it('renders with no sources section when sources is empty', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: { ...baseEvaluation, sources: [] },
      categories,
      isExpanded: true,
      onToggle: vi.fn(),
    });

    expect(container.textContent).not.toContain('sources cited');

    unmount();
  });

  it('shows "unknown" for evaluated_by when absent', async () => {
    const { default: DirectoryRow } = await loadDirectoryRow();
    const { container, unmount } = renderComponent(DirectoryRow, {
      evaluation: { ...baseEvaluation, evaluated_by: undefined },
      categories,
      isExpanded: true,
      onToggle: vi.fn(),
    });

    expect(container.textContent).toContain('unknown');

    unmount();
  });
});
