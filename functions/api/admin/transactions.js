// functions/api/admin/transactions.js — 관리자용 결제/수강 내역 조회 API
// GET /api/admin/transactions?limit=100&offset=0

import { json, options } from '../_lib/http.js';

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') {
        return options(request, env);
    }

    if (method !== 'GET') {
        return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
    }

    // 관리자 권한 체크 (실제 배포시에는 세션/쿠키 등을 통한 검증 필요)
    // 여기서는 간단히 구현

    try {
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 500);
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        // enrollments 테이블에서 전체 내역 조회 (유저 정보, 클래스 정보 포함)
        const { results } = await db.prepare(`
            SELECT 
                e.*, 
                u.name as user_name, 
                u.email as user_email,
                c.title as class_title
            FROM enrollments e
            LEFT JOIN users u ON e.user_id = u.id
            LEFT JOIN classes c ON e.class_id = c.id
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all();

        return json(request, env, {
            success: true,
            data: results
        });

    } catch (err) {
        console.error("[D1 API] Transactions Error:", err);
        return json(request, env, {
            success: false,
            error: '결제 내역 조회 실패',
            detail: err.message
        }, { status: 500 });
    }
}
