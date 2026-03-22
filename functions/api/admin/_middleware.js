import { requireAdmin } from '../_lib/auth.js';

export async function onRequest(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  return context.next();
}
