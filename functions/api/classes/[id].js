// functions/api/classes/[id].js — 특정 클래스 상세 조회 API
// GET /api/classes/:id

export async function onRequest(context) {
    const db = context.env.DB;
    const classId = context.params.id;

    if (!classId) {
        return Response.json(
            { success: false, error: '클래스 ID가 필요합니다.' },
            { status: 400 }
        );
    }

    try {
        // 1. 클래스 기본 정보 + 작성자 이름
        const classData = await db
            .prepare(`
                SELECT c.*, u.name AS creator_name, u.profile_image_url AS creator_profile_image
                FROM classes c
                LEFT JOIN users u ON c.creator_id = u.id
                WHERE c.id = ?
            `)
            .bind(classId)
            .first();

        if (!classData) {
            return Response.json(
                { success: false, error: '클래스를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 2. 리뷰 통계
        const reviewStats = await db
            .prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE class_id = ?')
            .bind(classId)
            .first();

        // 3. 수강생 수
        const enrollmentCount = await db
            .prepare('SELECT COUNT(*) as count FROM enrollments WHERE class_id = ?')
            .bind(classId)
            .first();

        // 4. 일일 평균 채팅 연산
        let chatCount = 0;
        let dailyChatAvg = 0;
        try {
            const chatResult = await db
                .prepare('SELECT COUNT(*) as count FROM chats WHERE class_id = ?')
                .bind(classId)
                .first();
            chatCount = chatResult?.count || 0;
            
            if (classData.created_at) {
                const createdDate = new Date(classData.created_at);
                const now = new Date();
                const diffTime = now.getTime() - createdDate.getTime();
                let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 0) diffDays = 1;
                dailyChatAvg = (chatCount / diffDays).toFixed(1);
            }
        } catch (e) {
            console.warn('Chat stats query failed (table might not exist):', e.message);
        }

        // 5. JSON 문자열 필드 파싱 및 합산
        const result = {
            ...classData,
            avg_rating: reviewStats?.avg_rating ? parseFloat(reviewStats.avg_rating).toFixed(1) : '0.0',
            review_count: reviewStats?.review_count || 0,
            enrollment_count: enrollmentCount?.count || 0,
            daily_chat_avg: dailyChatAvg,
            // JSON 문자열 필드를 객체로 파싱
            image_urls: safeParseJSON(classData.image_urls, []),
            curriculum: safeParseJSON(classData.curriculum, []),
            sub_instructors: safeParseJSON(classData.sub_instructors, []),
            target_audience: safeParseJSON(classData.target_audience, []),
            objectives: safeParseJSON(classData.objectives, [])
        };

        return Response.json({ success: true, data: result });

    } catch (error) {
        console.error('[API /classes/:id] Error:', error);
        return Response.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

function safeParseJSON(str, fallback) {
    if (!str) return fallback;
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}
