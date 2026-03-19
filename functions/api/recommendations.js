// functions/api/recommendations.js — 추천 클래스 폴더 조회 API
// GET /api/recommendations

export async function onRequest(context) {
    const db = context.env.DB;

    try {
        // 1. 추천 폴더 목록 가져오기 (정렬순)
        const { results: folders } = await db
            .prepare('SELECT * FROM recommendations ORDER BY sort_order ASC')
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

            // 미리보기용 최대 3개
            const previewIds = classIds.slice(0, 3);
            let previewClasses = [];

            if (previewIds.length > 0) {
                const placeholders = previewIds.map(() => '?').join(',');
                const { results } = await db
                    .prepare(`SELECT id, title, thumbnail, image_url, category, price FROM classes WHERE id IN (${placeholders})`)
                    .bind(...previewIds)
                    .all();
                previewClasses = results || [];
            }

            enrichedFolders.push({
                id: folder.folder_id,
                title: folder.title,
                sort_order: folder.sort_order,
                total_classes: classIds.length,
                class_ids: classIds,
                preview_classes: previewClasses
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
