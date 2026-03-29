import { ensureOperationsSchema } from './_lib/schema.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

function normalizeText(value) {
  return String(value ?? '').trim();
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: CORS_HEADERS,
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    await ensureOperationsSchema(env.DB);
    const { results } = await env.DB.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
    return json({ success: true, data: results || [] });
  } catch (err) {
    console.error('[API /inquiries] GET error:', err);
    return json({ success: false, error: 'Inquiry lookup failed.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureOperationsSchema(env.DB);

    const body = await request.json();
    const name = normalizeText(body.name || body.user_name);
    const email = normalizeText(body.email || body.user_email);
    const category = normalizeText(body.category) || '일반 문의';
    const title = normalizeText(body.title || body.subject);
    const content = normalizeText(body.content);
    const userId = normalizeText(body.user_id || '');
    const submittedBy = normalizeText(body.submitted_by || body.user_id || '');

    if (!name || !email || !title || !content) {
      return json({ success: false, error: 'name, email, title and content are required.' }, { status: 400 });
    }

    const id = `inq_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await env.DB.prepare(`
      INSERT INTO inquiries (
        id, user_id, name, email, category, title, subject, content, submitted_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      userId || null,
      name,
      email,
      category,
      title,
      title,
      content,
      submittedBy || null,
    ).run();

    return json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    console.error('[API /inquiries] POST error:', err);
    return json({ success: false, error: 'Inquiry submission failed.' }, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    },
  });
}
