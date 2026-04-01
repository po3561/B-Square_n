import { options } from '../../api/_lib/http.js';
import { handleOAuthLogout } from '../../api/_lib/oauth.js';

export async function onRequestGet(context) {
  return handleOAuthLogout(context, 'kakao');
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
