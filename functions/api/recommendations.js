// functions/api/recommendations.js — 추천 클래스 폴더 조회 API (V2)
// GET /api/recommendations

const RESPONSE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
};

export async function onRequest(context) {
    const db = context.env.DB;

    try {
        const { results: folders } = await db
            .prepare('SELECT folder_id, title, description, type, category, class_ids, sort_order FROM recommendations ORDER BY type ASC, sort_order ASC')
            .all();

        if (!folders || folders.length === 0) {
            return Response.json({
                success: true,
                data: []
            }, {
                headers: RESPONSE_HEADERS
            });
        }

        const enrichedFolders = [];

        for (const folder of folders) {
            let classIds = [];
            try {
                classIds = JSON.parse(folder.class_ids || '[]');
                if (!Array.isArray(classIds)) classIds = [];
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

                const classMap = new Map(results.map(item => [String(item.id), item]));
                folderClasses = classIds.map(id => {
                    const classData = classMap.get(String(id));
                    if (!classData) {
                        console.warn('[API /recommendations] Missing class for recommendation entry:', id);
                    }
                    return classData || null;
                }).filter(Boolean);
            }

            enrichedFolders.push({
                id: folder.folder_id,
                title: folder.title,
                description: folder.description || '',
                type: folder.type || 'regular',
                category: folder.category || 'all',
                sort_order: folder.sort_order,
                total_classes: classIds.length,
                classes: folderClasses
            });
        }

        return Response.json({
            success: true,
            data: enrichedFolders
        }, {
            headers: RESPONSE_HEADERS
        });
    } catch (error) {
        console.error('[API /recommendations] Error:', error);
        return Response.json(
            { success: false, error: error.message },
            {
                status: 500,
                headers: RESPONSE_HEADERS
            }
        );
    }
}
