import { requireClassManager, requireSession } from './_lib/auth.js';
import { json } from './_lib/http.js';
import { ensureClassesSchema, ensureReviewsSchema } from './_lib/schema.js';

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const method = request.method;

    await ensureClassesSchema(db);
    await ensureReviewsSchema(db);

    // GET: 클래스 목록 조회
        if (method === 'GET') {
            const category = url.searchParams.get('category') || '';
            const query = url.searchParams.get('q') || '';
            const instructorId = url.searchParams.get('instructor_id') || url.searchParams.get('creator_id') || '';
            const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
            const offset = parseInt(url.searchParams.get('offset')) || 0;
    
            try {
                let sql = 'SELECT *, creator_id AS instructor_id FROM classes WHERE 1=1';
                const params = [];
    
                if (category) {
                    sql += ' AND category LIKE ?';
                    params.push(`%${category}%`);
                }
                if (instructorId) {
                    sql += ' AND creator_id = ?';
                    params.push(instructorId);
                }
            if (query) {
                sql += ' AND (title LIKE ? OR category LIKE ? OR keywords LIKE ?)';
                params.push(`%${query}%`, `%${query}%`, `%${query}%`);
            }

            sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
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

            return json(request, env, { success: true, data: enriched, meta: { limit, offset, count: enriched.length } });
        } catch (error) {
            return json(request, env, { success: false, error: '클래스 목록 조회 중 오류가 발생했습니다.', detail: error.message }, { status: 500 });
        }
    }

    if (method === 'PATCH') {
        const auth = await requireSession(context);
        if (!auth.ok) return auth.response;

        try {
            const body = await request.json();
            const id = body.id;
            if (!id) return json(request, env, { success: false, error: 'ID is required' }, { status: 400 });

            const classAuth = await requireClassManager(context, id);
            if (!classAuth.ok) return classAuth.response;

            const updates = [];
            const values = [];

            const allowed = ['title', 'category', 'is_approved', 'price'];
            allowed.forEach(key => {
                if (body[key] !== undefined) {
                    updates.push(`${key} = ?`);
                    values.push(body[key]);
                }
            });

            if (updates.length === 0) return json(request, env, { success: false, error: 'No fields to update' }, { status: 400 });

            updates.push("updated_at = datetime('now')");
            values.push(id);

            await db.prepare(`UPDATE classes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
            return json(request, env, { success: true, message: 'Class updated successfully' });

        } catch (error) {
            return json(request, env, { success: false, error: '클래스 수정 중 오류가 발생했습니다.', detail: error.message }, { status: 500 });
        }
    }

    if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) return json(request, env, { success: false, error: 'ID가 필요합니다.' }, { status: 400 });

        const auth = await requireClassManager(context, id);
        if (!auth.ok) return auth.response;

        try {
            await db.prepare('DELETE FROM gathering_participants WHERE gathering_id IN (SELECT id FROM class_gatherings WHERE class_id = ?)').bind(id).run();
            await db.prepare('DELETE FROM class_gatherings WHERE class_id = ?').bind(id).run();
            
            const tables = [
                'enrollments', 'reviews', 'chat_messages', 'class_notices', 'coupons',
                'class_participants', 'class_boards', 'user_passes'
            ];

            for (const table of tables) {
                try {
                    await db.prepare(`DELETE FROM ${table} WHERE class_id = ?`).bind(id).run();
                } catch (e) {
                    console.warn(`[API cleanup] Skipped ${table}:`, e.message);
                }
            }
            
            await db.prepare('UPDATE contacts SET source_class_id = NULL WHERE source_class_id = ?').bind(id).run();

            const result = await db.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();

            if (result.meta.changes === 0) {
                return json(request, env, { success: false, error: '삭제할 클래스를 찾을 수 없습니다.' }, { status: 404 });
            }

            return json(request, env, {
                success: true, 
                message: '클래스와 모든 연관 데이터가 영구적으로 삭제되었습니다.',
                id: id
            });

        } catch (error) {
            return json(request, env, { success: false, error: '영구 삭제 중 오류가 발생했습니다.', detail: error.message }, { status: 500 });
        }
    }

    return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
