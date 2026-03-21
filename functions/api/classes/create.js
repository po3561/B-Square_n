// POST /api/classes/create — 클래스 생성 (D1 API)
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    console.log('[API] Class Create Request keys:', Object.keys(body));

    if (!body.title || (!body.instructor_id && !body.creator_id)) {
      return new Response(JSON.stringify({ success: false, error: '필수 항목(제목, 작성자)을 확인해주세요.' }), { status: 400, headers: cors });
    }

    const classId = 'cls_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    // 프론트엔드 데이터 구조 → DB 컬럼 매핑
    const image_urls = JSON.stringify(body.image_urls || []);
    const curriculum = JSON.stringify(body.curriculum || []);
    const sub_instructors = JSON.stringify(body.sub_instructors || []);
    const target_audience = JSON.stringify(body.target_audience || []);
    const objectives = JSON.stringify(body.objectives || []);
    const keywords = Array.isArray(body.keywords) ? body.keywords.join(',') : (body.keywords || '');

    // 중첩 객체 안전 접근 (프론트엔드: instructor_info.name / bank_info.name 등)
    const instructorName = body.instructor_info?.name || body.instructor_name || '';
    const instructorPhone = body.instructor_info?.phone || body.instructor_phone || '';
    const instructorEmail = body.instructor_info?.email || body.instructor_email || '';
    const bankName = body.bank_info?.name || body.payment_bank_name || '';
    const bankAccount = body.bank_info?.account || body.payment_bank_account || '';
    const bankHolder = body.bank_info?.holder || body.payment_bank_holder || '';
    const payCard = body.payment_methods?.card ? 1 : (body.payment_card || 1);
    const payBank = body.payment_methods?.bank ? 1 : (body.payment_bank_transfer || 0);

    // capacity: 프론트엔드가 capacity_min/capacity_max 로 직접 보냄
    const capacityMin = body.capacity_min || body.capacity?.min || 0;
    const capacityMax = body.capacity_max || body.capacity?.max || 0;

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
      body.instructor_id || body.creator_id,
      body.instructor_email || body.creator_email || '',
      body.title,
      body.category || null,
      keywords,
      body.summary || null,
      body.description || null,
      body.description_text || null,
      body.price_one_time || body.price || 0,
      body.discount_rate || 0,
      body.coupon_pack ? 1 : 0,
      body.class_type || 'ONLINE',
      body.operating_mode || 'ONEDAY',
      capacityMin,
      capacityMax,
      body.price_one_time || null,
      body.pass_count || null,
      body.price_multi || null,
      body.price_monthly || null,
      payCard,
      payBank,
      bankName || null,
      bankAccount || null,
      bankHolder || null,
      body.is_free ? 1 : 0,
      instructorPhone || null,
      instructorName || null,
      instructorEmail || null,
      body.image_url || null,
      image_urls,
      curriculum,
      sub_instructors,
      target_audience,
      objectives,
      body.coupon_detail || null
    ).run();

    console.log(`[API] Class Created: ${classId}`);
    return new Response(JSON.stringify({ success: true, data: { id: classId } }), { status: 201, headers: cors });
  } catch (err) {
    console.error('[API] Create class error:', err);
    return new Response(JSON.stringify({ success: false, error: '클래스 생성 중 오류', detail: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
