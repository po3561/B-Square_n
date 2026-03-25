import { requireClassManager, requireSession } from './_lib/auth.js';
import { json } from './_lib/http.js';
import { ensureClassesSchema, ensureReviewsSchema, ensureClassStatsSchema } from './_lib/schema.js';
import { ensureClassBookmarksSchema } from './_lib/class_support.js';

const RESPONSE_HEADERS = {
    'Cache-Control': 'public, max-age=15, stale-while-revalidate=120',
};

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const method = request.method;

    await ensureClassesSchema(db);
    await ensureReviewsSchema(db);
    await ensureClassStatsSchema(db);
    await ensureClassBookmarksSchema(db);

    // GET: 클래스 목록 조회
        if (method === 'GET') {
            const category = url.searchParams.get('category') || '';
            const query = url.searchParams.get('q') || '';
            const instructorId = url.searchParams.get('instructor_id') || url.searchParams.get('creator_id') || '';
            const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 500);
            const offset = parseInt(url.searchParams.get('offset')) || 0;
    
            try {
                let sql = `
                    SELECT
                        c.id,
                        c.creator_id,
                        c.title,
                        c.category,
                        c.keywords,
                        c.summary,
                        c.price,
                        c.discount_rate,
                        c.coupon_pack,
                        c.class_type,
                        c.operating_mode,
                        c.is_free,
                        c.instructor_phone,
                        c.instructor_name,
                        c.instructor_email,
                        c.current_participants,
                        c.thumbnail,
                        c.image_url,
                        c.created_at,
                        c.updated_at,
                        c.creator_id AS instructor_id,
                        u.name AS creator_name,
                        COALESCE(u.email, c.creator_email) AS creator_email,
                        u.phone AS creator_phone,
                        COALESCE(s.avg_rating, 0) AS avg_rating,
                        COALESCE(s.review_count, 0) AS review_count,
                        COALESCE(s.bookmark_count, 0) AS bookmark_count,
                        COALESCE(s.bookmark_count, 0) AS like_count,
                        COALESCE(c.is_public, 1) AS is_public
                    FROM classes c
                    LEFT JOIN users u ON u.id = c.creator_id
                    LEFT JOIN class_stats s ON s.class_id = c.id
                    WHERE COALESCE(c.is_public, 1) = 1
                `;
                const params = [];

                if (category) {
                    sql += ' AND c.category LIKE ?';
                    params.push(`%${category}%`);
                }
                if (instructorId) {
                    sql += ' AND c.creator_id = ?';
                    params.push(instructorId);
                }
            if (query) {
                sql += ' AND (c.title LIKE ? OR c.category LIKE ? OR c.keywords LIKE ? OR c.creator_email LIKE ? OR c.instructor_name LIKE ? OR c.instructor_email LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
                params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
            }

            sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const { results } = await db.prepare(sql).bind(...params).all();
            const enriched = (results || []).map((cls) => ({
                ...cls,
                avg_rating: cls.avg_rating ? Number(cls.avg_rating).toFixed(1) : '0.0',
                review_count: Number(cls.review_count || 0),
                bookmark_count: Number(cls.bookmark_count || 0),
                like_count: Number(cls.like_count || cls.bookmark_count || 0),
                is_public: Number(cls.is_public ?? 1) === 1,
            }));

            return json(request, env, { success: true, data: enriched, meta: { limit, offset, count: enriched.length } }, { headers: RESPONSE_HEADERS });
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
                'class_participants', 'class_boards', 'user_passes', 'class_bookmarks'
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
