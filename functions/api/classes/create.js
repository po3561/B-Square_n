// POST /api/classes — 클래스 생성 (인증 필요)
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();

    if (!body.title || !body.creator_id) {
      return new Response(JSON.stringify({ success: false, error: '필수 항목(제목, 작성자)을 확인해주세요.' }), { status: 400, headers: cors });
    }

    const classId = 'cls_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    // JSON 필드 직렬화
    const image_urls = JSON.stringify(body.image_urls || []);
    const curriculum = JSON.stringify(body.curriculum || []);
    const sub_instructors = JSON.stringify(body.sub_instructors || []);
    const target_audience = JSON.stringify(body.target_audience || []);
    const objectives = JSON.stringify(body.objectives || []);

    await env.DB.prepare(`
      INSERT INTO classes (
        id, creator_id, creator_email, title, category, keywords, summary, 
        description, description_text, price, discount_rate, coupon_pack, 
        class_type, operating_mode, capacity_min, capacity_max, 
        tickets_price_one_time, tickets_pass_count, tickets_price_multi, tickets_price_monthly,
        payment_card, payment_bank_transfer, payment_bank_name, payment_bank_account, payment_bank_holder,
        is_free, instructor_phone, instructor_name, instructor_email,
        image_url, image_urls, curriculum, sub_instructors, target_audience, objectives,
        coupon_detail
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      classId,
      body.creator_id,
      body.creator_email || '',
      body.title,
      body.category || null,
      Array.isArray(body.keywords) ? body.keywords.join(',') : (body.keywords || null),
      body.summary || null,
      body.description || null,
      body.description_text || null,
      body.price || 0,
      body.discount_rate || 0,
      body.coupon_pack ? 1 : 0,
      body.class_type || 'VOD',
      body.operating_mode || 'ONEDAY',
      body.capacity?.min || null,
      body.capacity?.max || null,
      body.price_one_time || null,
      body.pass_count || null,
      body.price_multi || null,
      body.price_monthly || null,
      1, // payment_card (UI pills removed, default to allow)
      1, // payment_bank_transfer (UI pills removed, default to allow)
      body.bank_info?.name || null,
      body.bank_info?.account || null,
      body.bank_info?.holder || null,
      body.is_free ? 1 : 0,
      body.instructor_phone || null,
      body.instructor_name || null,
      body.instructor_email || null,
      body.image_url || null,
      image_urls,
      curriculum,
      sub_instructors,
      target_audience,
      objectives,
      body.coupon_detail || null
    ).run();

    return new Response(JSON.stringify({ success: true, data: { id: classId } }), { status: 201, headers: cors });
  } catch (err) {
    console.error('Create class error:', err);
    return new Response(JSON.stringify({ success: false, error: '클래스 생성 중 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
