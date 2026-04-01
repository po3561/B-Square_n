import { options } from '../../api/_lib/http.js';
import { handleOAuthLogout } from '../../api/_lib/oauth.js';

export async function onRequestGet(context) {
  return handleOAuthLogout(context, 'naver');
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
