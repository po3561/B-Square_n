// functions/api/recommendations.js — 추천 클래스 폴더 조회 API (V2)
// GET /api/recommendations

export async function onRequest(context) {
    const db = context.env.DB;

    try {
        // 1. 추천 폴더 목록 가져오기 (정렬순)
        const { results: folders } = await db
            .prepare('SELECT folder_id, title, description, type, category, class_ids, sort_order FROM recommendations ORDER BY sort_order ASC')
            .all();

        if (!folders || folders.length === 0) {
            return Response.json({
                success: true,
                data: []
            });
        }

        // 2. 각 폴더의 class_ids를 파싱하고 클래스 정보 매칭
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
                // 한 번에 조회 (IN 절 사용)
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
                
                // 순서 보장 (classIds 순서대로)
                folderClasses = classIds.map(id => results.find(c => String(c.id) === String(id))).filter(Boolean);
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
        });

    } catch (error) {
        console.error('[API /recommendations] Error:', error);
        return Response.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
