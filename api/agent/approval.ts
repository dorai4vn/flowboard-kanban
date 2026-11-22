import { handleApproval } from '../../server/agent/handlers.js';
import { productionDeps } from '../../server/agent/productionDeps.js';

// Vercel Function: approve/reject a pending deletion. All checks run in Postgres + server code.
export const config = { maxDuration: 60 };

export async function POST(request: Request): Promise<Response> {
  return handleApproval(request, productionDeps());
}
