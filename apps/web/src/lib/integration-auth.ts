/**
 * n8n (or other automation) calls back into OMS with a shared secret.
 * Send header: X-Integration-Secret: <N8N_INTEGRATION_SECRET>
 * or Authorization: Bearer <N8N_INTEGRATION_SECRET>
 */
export function verifyIntegrationSecret(req: Request): boolean {
  const secret = process.env.N8N_INTEGRATION_SECRET?.trim();
  if (!secret) return false;
  const h = req.headers.get("x-integration-secret");
  if (h === secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
