import { requireAdmin } from '../_lib/auth.js';
import { options } from '../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return options(context.request, context.env);
  }
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;
  return context.next();
}
