import type { AgentInputItem } from '@openai/agents';
import { call, lastToolResult, lastUserText, say, ScriptedModel } from './scriptedModel.js';

type Task = { id: string; title: string; status_label: string; due_date: string | null };

/**
 * Deterministic "model" for local E2E runs ONLY (FLOWBOARD_AGENT_MODEL=scripted, refused on Vercel).
 * Understands a handful of fixed Vietnamese commands so UI flows can be tested without a real LLM.
 */
export function ruleBasedModel() {
  return new ScriptedModel((input: AgentInputItem[]) => {
    const text = lastUserText(input).trim();
    const last = lastToolResult(input);
    const lastIsTool = (input.at(-1) as { type?: string } | undefined)?.type === 'function_call_result';
    let m: RegExpExecArray | null;

    if (/^lỗi máy chủ/i.test(text)) throw new Error('simulated provider failure');

    if (!lastIsTool) {
      if (/^tạo công việc /i.test(text)) return [call('list_boards', {})];
      if ((m = /^(?:đổi tên|sửa) (.+?) thành (.+)$/i.exec(text))) return [call('search_tasks', { query: m[1]!, board_id: null, include_done: true })];
      if ((m = /^(?:hoàn thành|xong) (.+)$/i.exec(text))) return [call('search_tasks', { query: m[1]!, board_id: null, include_done: false })];
      if ((m = /^xóa (.+)$/i.exec(text))) return [call('search_tasks', { query: m[1]!, board_id: null, include_done: true })];
      if (/quá hạn/i.test(text)) return [call('get_focus', { kind: 'overdue' })];
      if (/hôm nay/i.test(text)) return [call('get_focus', { kind: 'today' })];
      return [say('Mình có thể giúp tạo, sửa, hoàn thành hoặc xóa công việc.')];
    }

    const value = last?.value as { ok?: boolean; error?: string; boards?: { id: string }[]; tasks?: Task[]; task?: Task; deleted?: string };
    if (value?.ok === false) return [say(`Không thực hiện được: ${value.error ?? 'lỗi'}. Chưa có gì thay đổi.`)];

    switch (last?.name) {
      case 'list_boards': {
        m = /^tạo công việc (.+?)(?: hạn (\d{4}-\d{2}-\d{2}))?$/i.exec(text)!;
        return [call('create_task', { board_id: value.boards![0]!.id, title: m[1]!, description: null, priority: null, due_date: m[2] ?? null, status: null })];
      }
      case 'search_tasks': {
        const hit = value.tasks?.[0];
        if (!hit) return [say('Mình không tìm thấy công việc phù hợp.')];
        if ((m = /^(?:đổi tên|sửa) (.+?) thành (.+)$/i.exec(text)))
          return [call('update_task', { task_id: hit.id, title: m[2]!, description: null, priority: null, due_date: null, clear_due_date: false })];
        if (/^(?:hoàn thành|xong) /i.test(text)) return [call('move_task', { task_id: hit.id, status: 'done' })];
        return [call('delete_task', { task_id: hit.id })];
      }
      case 'create_task':
        return [say(`Đã tạo công việc “${value.task!.title}” trong cột ${value.task!.status_label}.`)];
      case 'update_task':
        return [say(`Đã đổi tên thành “${value.task!.title}”.`)];
      case 'move_task':
        return [say(`Đã chuyển “${value.task!.title}” sang ${value.task!.status_label}.`)];
      case 'delete_task':
        return [say(`Đã xóa công việc “${value.deleted}”.`)];
      case 'get_focus': {
        const list = value.tasks ?? [];
        return [say(list.length ? `Có ${list.length} việc: ${list.map((t) => t.title).join(', ')}.` : 'Không có việc nào.')];
      }
      default:
        return [say('Xong.')];
    }
  });
}
