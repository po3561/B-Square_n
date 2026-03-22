// functions/api/admin/recommendations.js — 추천 클래스 폴더 관리 API (V2)
// GET /api/admin/recommendations
// POST /api/admin/recommendations (대량 저장)

import { ensureRecommendationsSchema } from '../_lib/schema.js';

const JSON_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
};

function json(data, init = {}) {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: {
            ...JSON_HEADERS,
            ...(init.headers || {})
        }
    });
}

function normalizeFolder(rawFolder, fallbackType) {
    if (!rawFolder || typeof rawFolder !== 'object') return null;

    const id = String(rawFolder.id || rawFolder.folder_id || '').trim();
    const type = rawFolder.type === 'popular' ? 'popular' : fallbackType;
    const title = String(rawFolder.title || '').trim();
    const description = String(rawFolder.description || '').trim();
    const category = String(rawFolder.category || 'all').trim() || 'all';
    const classIds = Array.isArray(rawFolder.classIds)
        ? rawFolder.classIds.map(value => String(value).trim()).filter(Boolean)
        : [];
    const orderNumber = Number(rawFolder.order);
    const order = Number.isFinite(orderNumber) ? orderNumber : 0;

    if (!id) {
        return { error: 'Folder id is required' };
    }

    if (type === 'popular') {
        return {
            id,
            title: title || '지금 인기 있는 클래스',
            description,
            category,
            type,
            classIds,
            order
        };
    }

    if (!title) {
        return { error: 'Folder title is required' };
    }

    return {
        id,
        title,
        description,
        category,
        type,
        classIds,
        order
    };
}

function parseRequestTargetType(body) {
    const explicitType = body?.targetType;
    if (explicitType === 'popular' || explicitType === 'regular') {
        return explicitType;
    }

    if (Array.isArray(body?.folders) && body.folders.length > 0) {
        return body.folders[0]?.type === 'popular' ? 'popular' : 'regular';
    }

    return 'regular';
}

async function enrichFolders(db, folders) {
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
                    console.warn('[API /admin/recommendations] Missing class for recommendation entry:', id);
                }
                return classData || null;
            }).filter(Boolean);
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

    return enrichedFolders;
}

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const method = request.method;

    try {
        await ensureRecommendationsSchema(db);

        if (method === 'GET') {
            const { results: folders } = await db
                .prepare('SELECT folder_id, title, description, type, category, class_ids, sort_order FROM recommendations ORDER BY type ASC, sort_order ASC')
                .all();

            const enrichedFolders = await enrichFolders(db, folders || []);
            return json({ success: true, data: enrichedFolders });
        }

        if (method === 'POST') {
            const body = await request.json();
            const incomingFolders = Array.isArray(body?.folders) ? body.folders : null;

            if (!incomingFolders) {
                return json({ success: false, error: 'Folders array is required' }, { status: 400 });
            }

            const targetType = parseRequestTargetType(body);
            const normalizedFolders = [];

            for (const rawFolder of incomingFolders) {
                const normalized = normalizeFolder(rawFolder, targetType);
                if (!normalized) continue;
                if (normalized.error) {
                    return json({ success: false, error: normalized.error }, { status: 400 });
                }
                if (normalized.type !== targetType) {
                    return json({ success: false, error: 'Mixed recommendation types are not allowed in one request' }, { status: 400 });
                }
                normalizedFolders.push(normalized);
            }

            if (targetType === 'popular' && normalizedFolders.length !== 1) {
                return json({ success: false, error: 'Popular recommendations require exactly one folder payload' }, { status: 400 });
            }

            await db.prepare('DELETE FROM recommendations WHERE type = ?').bind(targetType).run();

            if (normalizedFolders.length > 0) {
                const stmts = normalizedFolders.map(folder =>
                    db.prepare('INSERT INTO recommendations (folder_id, title, description, type, category, class_ids, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        .bind(
                            folder.id,
                            folder.title,
                            folder.description || '',
                            folder.type,
                            folder.category || 'all',
                            JSON.stringify(folder.classIds || []),
                            folder.order || 0
                        )
                );
                await db.batch(stmts);
            }

            return json({ success: true, message: 'Saved successfully' });
        }

        return json({ success: false, error: 'Method not allowed' }, { status: 405 });
    } catch (err) {
        console.error('[API /admin/recommendations] Error:', err);
        return json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
    });
}
