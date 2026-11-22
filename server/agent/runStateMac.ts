import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Serialized SDK run state is stored server-side with an HMAC bound to the user, so only this server can
 * create a resumable state and a state cannot be moved to another account or edited in the database.
 */
export function signRunState(secret: string, userId: string, runState: string): string {
  return createHmac('sha256', `flowboard-runstate:${secret}`).update(`${userId}\n${runState}`).digest('base64url');
}

export function verifyRunState(secret: string, userId: string, runState: string, mac: string): boolean {
  const expected = Buffer.from(signRunState(secret, userId, runState));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
