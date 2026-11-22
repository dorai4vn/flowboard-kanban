import { handleChat } from '../../server/agent/handlers.js';
import { productionDeps } from '../../server/agent/productionDeps.js';

// Vercel Function (Node.js runtime, Web handler). The OpenAI key is read server-side from process.env only.
export const config = { maxDuration: 60 };

export async function POST(request: Request): Promise<Response> {
  return handleChat(request, productionDeps());
}
