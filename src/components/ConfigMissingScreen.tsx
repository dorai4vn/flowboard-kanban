import { describeSupabaseConfig, SUPABASE_ENV_VARS } from '../lib/supabase';
import { StatusScreen } from './StatusScreen';

/** Shown when the build has no Supabase config. Lists variable NAMES with present/missing — never values. */
export function ConfigMissingScreen({ env = import.meta.env }: { env?: Record<string, string | undefined> }) {
  const status = describeSupabaseConfig(env);
  return (
    <StatusScreen title="Thiếu cấu hình Supabase.">
      <ul className="space-y-1 text-left font-mono text-xs">
        {SUPABASE_ENV_VARS.map((name) => (
          <li key={name} className={status[name] === 'present' ? 'text-emerald-300' : 'text-red-300'}>
            <span>{name}</span>: {status[name] === 'present' ? 'có' : 'thiếu'}
          </li>
        ))}
      </ul>
      <p className="max-w-sm text-xs text-muted">
        Biến VITE_* được gắn vào lúc build. Trên Vercel: thêm biến cho đúng môi trường (Preview/Production) rồi tạo deployment mới. Khi chạy
        local: tạo file .env.local từ .env.example.
      </p>
    </StatusScreen>
  );
}
