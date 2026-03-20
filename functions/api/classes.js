// functions/api/classes.js — 클래스 목록 조회 API
// GET /api/classes?category=&q=&limit=&offset=

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const method = request.method;

    // GET: 클래스 목록 조회
    if (method === 'GET') {
        const category = url.searchParams.get('category') || '';
        const query = url.searchParams.get('q') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        try {
            let sql = 'SELECT c.*, u.name AS creator_name FROM classes c LEFT JOIN users u ON c.creator_id = u.id WHERE 1=1';
            const params = [];

            if (category) {
                sql += ' AND c.category LIKE ?';
                params.push(`%${category}%`);
            }
            if (query) {
                sql += ' AND (c.title LIKE ? OR c.category LIKE ? OR c.keywords LIKE ?)';
                params.push(`%${query}%`, `%${query}%`, `%${query}%`);
            }

            sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const { results } = await db.prepare(sql).bind(...params).all();

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

            const enriched = results.map(cls => ({
                ...cls,
                avg_rating: reviewStats[cls.id]?.avg_rating || '0.0',
                review_count: reviewStats[cls.id]?.review_count || 0
            }));

            return Response.json({ success: true, data: enriched, meta: { limit, offset, count: enriched.length } });

        } catch (error) {
            console.error('[API /classes GET] Error:', error);
            return Response.json({ success: false, error: error.message }, { status: 500 });
        }
    }

    // PATCH: 클래스 정보 부분 수정 (승인 상태 등)
    if (method === 'PATCH') {
        try {
            const body = await request.json();
            const id = body.id;
            if (!id) return Response.json({ success: false, error: 'ID is required' }, { status: 400 });

            const updates = [];
            const values = [];

            // 허용된 필드들
            const allowed = ['title', 'category', 'is_approved', 'price', 'max_capacity', 'is_hidden'];
            allowed.forEach(key => {
                if (body[key] !== undefined) {
                    updates.push(`${key} = ?`);
                    values.push(body[key]);
                }
            });

            if (updates.length === 0) return Response.json({ success: false, error: 'No fields to update' }, { status: 400 });

            updates.push("updated_at = datetime('now')");
            values.push(id);

            await db.prepare(`UPDATE classes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
            return Response.json({ success: true, message: 'Class updated successfully' });

        } catch (error) {
            console.error('[API /classes PATCH] Error:', error);
            return Response.json({ success: false, error: error.message }, { status: 500 });
        }
    }

    // DELETE: 클래스 삭제
    if (method === 'DELETE') {
        try {
            const id = url.searchParams.get('id');
            if (!id) return Response.json({ success: false, error: 'ID is required' }, { status: 400 });

            // 연관 데이터 전체 삭제
            const tables = [
                'enrollments', 'reviews', 'chats', 'class_notices', 'coupons', 
                'class_participants', 'class_boards', 'class_gatherings', 
                'user_passes', 'user_passes_fb'
            ];

            for (const table of tables) {
                await db.prepare(`DELETE FROM ${table} WHERE class_id = ?`).bind(id).run();
            }

            // 최종적으로 클래스 삭제
            await db.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();
            
            return Response.json({ success: true, message: 'Class and all related data deleted successfully' });

        } catch (error) {
            console.error('[API /classes DELETE] Error:', error);
            return Response.json({ success: false, error: error.message }, { status: 500 });
        }
    }

    return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
