import { requireClassManager } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';

export async function onRequestPut(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { class_id, updates } = body;

        if (!class_id || !updates) {
            return json(request, env, { success: false, error: 'class_id 및 업데이트 항목이 필요합니다.' }, { status: 400 });
        }

        const auth = await requireClassManager(context, class_id);
        if (!auth.ok) return auth.response;

        const updateKeys = [];
        const updateValues = [];

        // 허용된 단일 스트링/숫자 필드
        const allowedFields = [
            'title', 'category', 'class_type', 'operating_mode', 'summary',
            'description', 'description_text', 'price', 'discount_rate', 'image_url',
            'is_free', 'coupon_pack', 'coupon_detail',
            'capacity_min', 'capacity_max',
            'tickets_price_one_time', 'tickets_pass_count', 'tickets_price_multi', 'tickets_price_monthly',
            'payment_card', 'payment_bank_transfer', 'payment_bank_name', 'payment_bank_account', 'payment_bank_holder',
            'instructor_phone', 'instructor_name', 'instructor_email'
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
            return json(request, env, { success: false, error: '업데이트할 항목이 제공되지 않았습니다.' }, { status: 400 });
        }

        updateKeys.push('updated_at = datetime(\'now\')');
        const query = `UPDATE classes SET ${updateKeys.join(', ')} WHERE id = ?`;
        updateValues.push(class_id);

        await env.DB.prepare(query).bind(...updateValues).run();

        return json(request, env, { success: true, message: '클래스가 성공적으로 수정되었습니다.' });

    } catch (err) {
        console.error('Update class error:', err);
        return json(request, env, { success: false, error: '클래스 업데이트 중 오류', detail: err.message }, { status: 500 });
    }
}

export async function onRequestOptions(context) {
    return options(context.request, context.env);
}
