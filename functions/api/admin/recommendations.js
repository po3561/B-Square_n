// functions/api/admin/recommendations.js — 추천 클래스 폴더 관리 API (V2)
// GET /api/admin/recommendations
// POST /api/admin/recommendations (대량 저장)

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const method = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    try {
        if (method === 'GET') {
            const { results: folders } = await db.prepare('SELECT folder_id, title, description, type, category, class_ids, sort_order FROM recommendations ORDER BY sort_order ASC').all();
            
            const enrichedFolders = [];
            for (const folder of folders) {
                let classIds = [];
                try {
                    classIds = JSON.parse(folder.class_ids || '[]');
                } catch {
                    classIds = [];
                }

                let folderClasses = [];
                if (classIds.length > 0) {
                    const placeholders = classIds.map(() => '?').join(',');
                    const { results } = await db
                        .prepare(`
                            SELECT 
                                c.id, c.title, c.thumbnail, c.image_url, c.category, c.price, 
                                c.instructor_name, c.creator_id AS instructor_id, c.discount_rate,
                                COALESCE(s.avg_rating, 0) AS avg_rating, 
                                COALESCE(s.review_count, 0) AS review_count
                            FROM classes c
                            LEFT JOIN class_stats s ON c.id = s.class_id
                            WHERE c.id IN (${placeholders})
                        `)
                        .bind(...classIds)
                        .all();
                    folderClasses = classIds.map(id => results.find(c => String(c.id) === String(id))).filter(Boolean);
                }

                enrichedFolders.push({
                    folder_id: folder.folder_id,
                    title: folder.title,
                    description: folder.description || '',
                    category: folder.category || 'all',
                    type: folder.type || 'regular',
                    sort_order: folder.sort_order,
                    class_ids: classIds,
                    classes: folderClasses
                });
            }

            return new Response(JSON.stringify({ success: true, data: enrichedFolders }), { headers: cors });
        }

        if (method === 'POST') {
            const body = await request.json();
            const { folders } = body; // Array of { id, title, classIds, order }

            if (!Array.isArray(folders)) {
                return new Response(JSON.stringify({ success: false, error: 'Folders array is required' }), { status: 400, headers: cors });
            }

            // [Critical Fix] 특정 타입(popular/regular)만 삭제하고 저장하여 상호 간섭 방지
            const targetType = folders.length > 0 ? (folders[0].type || 'regular') : 'regular';
            await db.prepare('DELETE FROM recommendations WHERE type = ?').bind(targetType).run();

            if (folders.length > 0) {
                const stmts = folders.map(f => {
                    return db.prepare('INSERT INTO recommendations (folder_id, title, description, type, category, class_ids, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        .bind(f.id, f.title, f.description || '', f.type || 'regular', f.category || 'all', JSON.stringify(f.classIds || []), f.order || 0);
                });
                await db.batch(stmts);
            }

            return new Response(JSON.stringify({ success: true, message: 'Saved successfully' }), { headers: cors });
        }

        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: cors });

    } catch (err) {
        console.error('[API /admin/recommendations] Error:', err);
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}
