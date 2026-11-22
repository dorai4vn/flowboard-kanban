import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigMissingScreen } from '../components/ConfigMissingScreen';
import { describeSupabaseConfig } from './supabase';

describe('describeSupabaseConfig', () => {
  it('reports present/missing per variable without exposing values', () => {
    expect(describeSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: '  ' })).toEqual({
      VITE_SUPABASE_URL: 'present',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'missing',
    });
    expect(describeSupabaseConfig({})).toEqual({ VITE_SUPABASE_URL: 'missing', VITE_SUPABASE_PUBLISHABLE_KEY: 'missing' });
  });
});

describe('ConfigMissingScreen', () => {
  it('lists which variables the build received, never their values', () => {
    render(<ConfigMissingScreen env={{ VITE_SUPABASE_URL: 'https://secret-ref.supabase.co', MODE: 'production' }} />);
    expect(screen.getByText('Thiếu cấu hình Supabase.')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL').closest('li')).toHaveTextContent('VITE_SUPABASE_URL: có');
    expect(screen.getByText('VITE_SUPABASE_PUBLISHABLE_KEY').closest('li')).toHaveTextContent('VITE_SUPABASE_PUBLISHABLE_KEY: thiếu');
    expect(document.body.textContent).not.toContain('secret-ref');
  });
});
