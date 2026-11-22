import type { FlowboardClient } from '../../src/lib/supabase.js';

export type ApprovalAction = 'delete_task' | 'delete_board';

export type ApprovalView = {
  id: string;
  action: ApprovalAction;
  target_id: string;
  target_label: string;
  detail: Record<string, unknown>;
  expires_at: string;
};

export type ClaimResult =
  | { code: 'ok'; claim_token: string; target_label: string; run_state: string; run_state_mac: string }
  | { code: 'not_found' | 'already_decided' | 'expired' | 'mismatch' };

/** Server-side approval persistence. Every state change is checked in Postgres (see the M11 migration). */
export interface ApprovalStore {
  create(action: ApprovalAction, targetId: string, runState: string, runStateMac: string): Promise<ApprovalView>;
  claim(id: string, action: ApprovalAction, targetId: string): Promise<ClaimResult>;
  reject(id: string, action: ApprovalAction, targetId: string): Promise<{ code: string }>;
  execute(id: string, claimToken: string, action: ApprovalAction, targetId: string): Promise<{ code: string; target_label?: string }>;
}

export class ApprovalError extends Error {
  constructor(readonly reason: 'target_not_found' | 'too_many_pending' | 'failed') {
    super(reason);
    this.name = 'ApprovalError';
  }
}

function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

export class SupabaseApprovalStore implements ApprovalStore {
  constructor(private readonly db: FlowboardClient) {}

  async create(action: ApprovalAction, targetId: string, runState: string, runStateMac: string): Promise<ApprovalView> {
    const { data, error } = await this.db.rpc('agent_create_approval', {
      p_action: action,
      p_target: targetId,
      p_run_state: runState,
      p_run_state_mac: runStateMac,
    });
    if (error) {
      const code = pgCode(error);
      throw new ApprovalError(code === 'P0002' ? 'target_not_found' : code === '53400' ? 'too_many_pending' : 'failed');
    }
    return data as unknown as ApprovalView;
  }

  async claim(id: string, action: ApprovalAction, targetId: string): Promise<ClaimResult> {
    const { data, error } = await this.db.rpc('agent_claim_approval', { p_id: id, p_action: action, p_target: targetId });
    if (error) throw new ApprovalError('failed');
    return data as unknown as ClaimResult;
  }

  async reject(id: string, action: ApprovalAction, targetId: string): Promise<{ code: string }> {
    const { data, error } = await this.db.rpc('agent_reject_approval', { p_id: id, p_action: action, p_target: targetId });
    if (error) throw new ApprovalError('failed');
    return data as unknown as { code: string };
  }

  async execute(id: string, claimToken: string, action: ApprovalAction, targetId: string) {
    const { data, error } = await this.db.rpc('agent_execute_approval', { p_id: id, p_claim: claimToken, p_action: action, p_target: targetId });
    if (error) return { code: pgCode(error) === 'P0002' ? 'target_missing' : 'failed' };
    return data as unknown as { code: string; target_label?: string };
  }
}
