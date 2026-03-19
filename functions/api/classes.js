// functions/api/classes.js — 클래스 목록 조회 API
// GET /api/classes?category=&q=&limit=&offset=

export async function onRequest(context) {
    const db = context.env.DB;
    const url = new URL(context.request.url);

    const category = url.searchParams.get('category') || '';
    const query = url.searchParams.get('q') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    try {
        let sql = 'SELECT c.*, u.name AS creator_name FROM classes c LEFT JOIN users u ON c.creator_id = u.id WHERE 1=1';
        const params = [];

        // 카테고리 필터
        if (category) {
            sql += ' AND c.category LIKE ?';
            params.push(`%${category}%`);
        }

        // 검색어 필터 (제목, 카테고리, 키워드)
        if (query) {
            sql += ' AND (c.title LIKE ? OR c.category LIKE ? OR c.keywords LIKE ?)';
            params.push(`%${query}%`, `%${query}%`, `%${query}%`);
        }

        sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const { results } = await db.prepare(sql).bind(...params).all();

        // 각 클래스에 대한 리뷰 평균/개수도 가져오기
        const classIds = results.map(c => c.id);
        let reviewStats = {};

        if (classIds.length > 0) {
            const placeholders = classIds.map(() => '?').join(',');
            const { results: stats } = await db
                .prepare(`SELECT class_id, AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE class_id IN (${placeholders}) GROUP BY class_id`)
                .bind(...classIds)
                .all();

            stats.forEach(s => {
                reviewStats[s.class_id] = {
                    avg_rating: s.avg_rating ? parseFloat(s.avg_rating).toFixed(1) : '0.0',
                    review_count: s.review_count || 0
                };
            });
        }

        // 결과에 리뷰 통계 병합
        const enriched = results.map(cls => ({
            ...cls,
            avg_rating: reviewStats[cls.id]?.avg_rating || '0.0',
            review_count: reviewStats[cls.id]?.review_count || 0
        }));

        return Response.json({
            success: true,
            data: enriched,
            meta: { limit, offset, count: enriched.length }
        });

    } catch (error) {
        console.error('[API /classes] Error:', error);
        return Response.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
