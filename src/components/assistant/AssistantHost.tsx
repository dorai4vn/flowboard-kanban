import type { AssistantApi } from '../../assistant/api';
import { useAssistant } from '../../assistant/useAssistant';
import { AssistantPanel } from './AssistantPanel';

/** Always mounted while signed in, so the conversation survives closing and reopening the panel. */
export function AssistantHost({ api, today, online, open, onChanged, onClose }: {
  api: AssistantApi;
  today: string;
  online: boolean;
  open: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const chat = useAssistant(api, today, onChanged);
  if (!open) return null;
  return <AssistantPanel messages={chat.messages} busy={chat.busy} online={online} onSend={chat.send} onDecide={chat.decide} onClose={onClose} />;
}
