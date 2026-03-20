// GET /api/classes/members?class_id=xxx&view=instructor|student
// 클래스 참여자(수강생+강사) 목록 반환
// view=instructor → 이름, 전화번호, 잔여수강권 포함
// view=student → 닉네임만 반환

export async function onRequestGet(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const classId = url.searchParams.get('class_id');
    const view = url.searchParams.get('view') || 'student'; // default: student

    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (!classId) {
        return new Response(JSON.stringify({ success: false, error: 'class_id is required' }), { status: 400, headers: cors });
    }

    try {
        // 1. 클래스 기본 정보 (유연한 컬럼 조회)
        let classInfo = null;
        try {
            classInfo = await env.DB.prepare(
                'SELECT * FROM classes WHERE id = ?'
            ).bind(classId).first();
        } catch (e) {
            console.warn('[Members API] classes query failed:', e.message);
        }

        if (!classInfo) {
            return new Response(JSON.stringify({ success: false, error: '클래스를 찾을 수 없습니다' }), { status: 404, headers: cors });
        }

        // 2. 수강생 목록 (enrollments JOIN users) — 테이블 미존재 시 빈 배열
        let enrollments = [];
        try {
            const enrollResult = await env.DB.prepare(`
                SELECT 
                    e.user_id,
                    e.status,
                    e.created_at as enrolled_at,
                    u.name,
                    u.email,
                    u.phone,
                    u.profile_image_url,
                    u.nickname
                FROM enrollments e
                LEFT JOIN users u ON e.user_id = u.id
                WHERE e.class_id = ?
                ORDER BY e.created_at DESC
            `).bind(classId).all();
            enrollments = enrollResult.results || [];
        } catch (e) {
            console.warn('[Members API] enrollments query failed:', e.message);
            // enrollments 테이블이 없거나 컬럼 불일치 시 빈 배열로 진행
        }

        // 3. 수강권 정보 (user_passes 테이블 — 컬럼명 호환)
        let passes = [];
        try {
            const passResult = await env.DB.prepare(`
                SELECT * FROM user_passes WHERE class_id = ?
            `).bind(classId).all();
            passes = passResult.results || [];
        } catch (e) {
            console.warn('[Members API] user_passes query failed:', e.message);
        }

        const passMap = {};
        let totalIssued = 0;
        let totalUsed = 0;
        passes.forEach(p => {
            const remaining = p.remaining_count ?? p.count ?? p.remaining ?? 0;
            const total = p.total_count ?? p.total ?? remaining;
            passMap[p.user_id] = { remaining_count: remaining, total_count: total };
            totalIssued += total;
            totalUsed += (total - remaining);
        });

        // 4. 강사 정보
        let instructor = null;
        try {
            if (classInfo.creator_id) {
                instructor = await env.DB.prepare(
                    'SELECT * FROM users WHERE id = ?'
                ).bind(classInfo.creator_id).first();
            }
        } catch (e) {
            console.warn('[Members API] instructor query failed:', e.message);
        }

        // 5. 뷰에 따른 데이터 필터링
        const members = enrollments.map(e => {
            const passInfo = passMap[e.user_id] || {};
            const isCreator = e.user_id === classInfo.creator_id;

            if (view === 'instructor') {
                // 강사 뷰: 모든 정보 공개
                return {
                    user_id: e.user_id,
                    nickname: e.nickname || e.name || '사용자',
                    name: e.name || '',
                    phone: e.phone || '',
                    email: e.email || '',
                    profile_image_url: e.profile_image_url || '',
                    remaining_passes: passInfo.remaining_count || 0,
                    total_passes: passInfo.total_count || 0,
                    role: isCreator ? 'instructor' : 'student',
                    enrolled_at: e.enrolled_at,
                    status: e.status
                };
            } else {
                // 수강생 뷰: 닉네임만
                return {
                    user_id: e.user_id,
                    nickname: e.nickname || e.name || '사용자',
                    profile_image_url: e.profile_image_url || '',
                    role: isCreator ? 'instructor' : 'student'
                };
            }
        });

        // 강사도 목록에 포함 (이미 수강생 목록에 있을 수 있음)
        const instructorInList = members.find(m => m.user_id === classInfo.creator_id);
        if (!instructorInList && instructor) {
            const instrPassInfo = passMap[instructor.id] || {};
            const instrData = view === 'instructor' ? {
                user_id: instructor.id,
                nickname: instructor.nickname || instructor.name || '강사',
                name: instructor.name || '',
                phone: instructor.phone || '',
                email: instructor.email || '',
                profile_image_url: instructor.profile_image_url || '',
                remaining_passes: instrPassInfo.remaining_count || 0,
                total_passes: instrPassInfo.total_count || 0,
                role: 'instructor',
                enrolled_at: null,
                status: 'active'
            } : {
                user_id: instructor.id,
                nickname: instructor.nickname || instructor.name || '강사',
                profile_image_url: instructor.profile_image_url || '',
                role: 'instructor'
            };
            members.unshift(instrData); // 강사를 맨 위에
        }

        return new Response(JSON.stringify({
            success: true,
            data: {
                class_info: {
                    id: classInfo.id,
                    title: classInfo.title,
                    category: classInfo.category,
                    image_url: classInfo.image_url,
                    creator_id: classInfo.creator_id
                },
                members,
                total_members: members.length,
                pass_stats: {
                    total_issued: totalIssued,
                    total_used: totalUsed
                }
            }
        }), { headers: cors });

    } catch (err) {
        console.error('[D1 API] Members Error:', err);
        return new Response(JSON.stringify({
            success: false,
            error: '멤버 목록 조회 실패',
            detail: err.message
        }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}
