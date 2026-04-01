import { json, options } from '../_lib/http.js';
import { listOAuthProviders } from '../_lib/oauth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  return json(request, env, {
    success: true,
    data: {
      providers: listOAuthProviders(env, request),
    },
  });
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
