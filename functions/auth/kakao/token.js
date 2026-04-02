import { options } from '../../api/_lib/http.js';
import { handleOAuthTokenLogin } from '../../api/_lib/oauth.js';

export async function onRequestPost(context) {
  return handleOAuthTokenLogin(context, 'kakao');
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
