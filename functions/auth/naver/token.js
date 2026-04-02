import { options } from '../../api/_lib/http.js';
import { handleOAuthTokenLogin } from '../../api/_lib/oauth.js';

export async function onRequestPost(context) {
  return handleOAuthTokenLogin(context, 'naver');
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
