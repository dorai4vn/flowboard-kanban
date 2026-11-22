import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AuthGate } from './auth/AuthGate';
import { createSupabaseAuth } from './auth/supabaseAuth';
import { StatusScreen } from './components/StatusScreen';
import { SupabaseRepository } from './data/supabaseRepository';
import { createSupabaseClient, readSupabaseConfig } from './lib/supabase';
import { createBoardStore, setAppStore } from './store/useBoardStore';

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const root = createRoot(document.getElementById('root')!);
const config = readSupabaseConfig();

if (!config) {
  root.render(
    <StatusScreen title="Thiếu cấu hình Supabase.">
      <p className="max-w-sm text-xs text-muted">Hãy tạo file .env.local từ .env.example (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) rồi chạy lại.</p>
    </StatusScreen>,
  );
} else {
  const client = createSupabaseClient(config.url, config.publishableKey);
  setAppStore(createBoardStore({ repo: new SupabaseRepository(client), prefs: safeLocalStorage(), initialOnline: navigator.onLine }));
  const auth = createSupabaseAuth(client);
  root.render(
    <StrictMode>
      <AuthGate auth={auth} />
    </StrictMode>,
  );
}
