import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './test/renderApp';

describe('App', () => {
  it('shows the FlowBoard heading', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'FlowBoard' })).toBeInTheDocument();
  });
});
