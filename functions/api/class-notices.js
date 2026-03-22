// GET /api/class-notices — 클래스 공지 목록
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');

  try {
    let results;
    if (class_id) {
      ({ results } = await env.DB.prepare('SELECT * FROM class_notices WHERE class_id = ? ORDER BY created_at DESC').bind(class_id).all());
    } else {
      ({ results } = await env.DB.prepare('SELECT * FROM class_notices ORDER BY created_at DESC LIMIT 50').all());
    }

    return Response.json({ success: true, data: results });
  } catch (err) {
    return Response.json({ success: false, error: '클래스 공지 조회 오류', detail: err.message }, { status: 500 });
  }
}

// POST /api/class-notices — 클래스 공지 작성 (강사/운영자)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { class_id, title, content, author_name } = body;

    if (!class_id || !title) {
      return Response.json({ success: false, error: '필수 항목(class_id, title) 누락' }, { status: 400 });
    }

    const push_key = 'noti_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    await env.DB.prepare(
      'INSERT INTO class_notices (push_key, class_id, title, content, author_name, views) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(push_key, class_id, title, content || '', author_name || '강사', 0).run();

    return Response.json({ success: true, data: { id: push_key } }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: '클래스 공지 작성 오류', detail: err.message }, { status: 500 });
  }
}
