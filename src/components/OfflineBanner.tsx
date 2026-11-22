import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  return (
    <div role="status" className="mb-4 flex items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-100">
      <WifiOff size={16} aria-hidden="true" className="shrink-0 text-amber-300" />
      Mất kết nối – đang ở chế độ chỉ đọc.
    </div>
  );
}
