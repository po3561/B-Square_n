// functions/api/classes/update.js — 클래스 상세 정보 수정 API
// PUT /api/classes/update
export async function onRequestPut(context) {
    const { request, env } = context;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    try {
        const body = await request.json();
        const { class_id, updates } = body;

        if (!class_id || !updates) {
            return new Response(JSON.stringify({ success: false, error: 'class_id 및 업데이트 항목이 필요합니다.' }), { status: 400, headers: cors });
        }

        // 인증 헤더 및 운영자 모드 플래그 확인 (Dev-Mode 우회)
        const isDevMode = request.headers.get('x-bsq-dev-mode') === 'true';
        let userId = null;

        if (!isDevMode) {
            // 실제라면 쿠키 세션을 파싱해야 하나, 여기서는 B-Square 인증 통과로 가정
            // 강사 본인인지 체크하는 로직이 향후 필요함.
            // (dev mode가 항상 true로 들어오도록 설정했으므로 우선 통과)
        }

        // 업데이트 쿼리 동적 생성
        const updateKeys = [];
        const updateValues = [];

        // 허용된 단일 스트링/숫자 필드
        const allowedFields = [
            'title', 'category', 'class_type', 'summary', 'description', 
            'price', 'discount_rate', 'image_url'
        ];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateKeys.push(`${field} = ?`);
                updateValues.push(updates[field]);
            }
        }

        // JSON 직렬화가 필요한 필드
        const jsonFields = ['keywords', 'target_audience', 'objectives', 'curriculum', 'image_urls', 'sub_instructors'];
        for (const field of jsonFields) {
            if (updates[field] !== undefined) {
                updateKeys.push(`${field} = ?`);
                const val = updates[field];
                updateValues.push(Array.isArray(val) ? JSON.stringify(val) : JSON.stringify([]));
            }
        }

        if (updateKeys.length === 0) {
            return new Response(JSON.stringify({ success: false, error: '업데이트할 항목이 제공되지 않았습니다.' }), { status: 400, headers: cors });
        }

        const query = `UPDATE classes SET ${updateKeys.join(', ')} WHERE id = ?`;
        updateValues.push(class_id);

        await env.DB.prepare(query).bind(...updateValues).run();

        return new Response(JSON.stringify({ success: true, message: '클래스가 성공적으로 수정되었습니다.' }), { status: 200, headers: cors });

    } catch (err) {
        console.error('Update class error:', err);
        return new Response(JSON.stringify({ success: false, error: '클래스 업데이트 중 오류', detail: err.message }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-BSQ-Dev-Mode'
        }
    });
}
