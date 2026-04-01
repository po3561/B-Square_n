import { options } from '../../api/_lib/http.js';
import { handleOAuthCallback } from '../../api/_lib/oauth.js';

export async function onRequestGet(context) {
  return handleOAuthCallback(context, 'kakao');
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
