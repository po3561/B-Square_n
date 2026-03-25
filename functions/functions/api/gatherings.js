import { ensureGatheringsSchema } from './_lib/schema.js';
import { refreshClassStats } from './_lib/class_support.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  await ensureTables(env.DB);
  await ensureGatheringsSchema(env.DB);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const url = new URL(request.url);
  const class_id = url.searchParams.get('class_id');
  const action = url.searchParams.get('action');

  if (!class_id && action !== 'detail' && action !== 'participants') return new Response(JSON.stringify({ success: false, error: 'class_id 필요' }), { status: 400, headers: cors });

  try {
    if (action === 'participants') {
      const gathering_id = url.searchParams.get('gathering_id');
      try {
        const { results } = await env.DB.prepare(`
          SELECT p.*, u.name, u.profile_image_url
          FROM gathering_participants p
          LEFT JOIN users u ON p.user_id = u.id
          WHERE p.gathering_id = ?
        `).bind(gathering_id).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
      } catch (joinErr) {
        // users JOIN 실패 시 participants만
        const { results } = await env.DB.prepare(
          'SELECT * FROM gathering_participants WHERE gathering_id = ?'
        ).bind(gathering_id).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
      }
    }
    
    if (action === 'detail') {
        const gathering_id = url.searchParams.get('gathering_id');
        const gatherRes = await env.DB.prepare(`
          SELECT g.*, COALESCE(p.participant_count, 0) AS current_participants
          FROM class_gatherings g
          LEFT JOIN (
            SELECT gathering_id, COUNT(*) AS participant_count
            FROM gathering_participants
            GROUP BY gathering_id
          ) p ON p.gathering_id = g.id
          WHERE g.id = ?
        `).bind(gathering_id).first();
        if(!gatherRes) return new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404, headers: cors });
        
        return new Response(JSON.stringify({ success: true, data: gatherRes }), { headers: cors });
    }

    // Default: get gatherings for a class
    const { results } = await env.DB.prepare(`
      SELECT
        g.*,
        COALESCE(p.participant_count, 0) AS current_participants
      FROM class_gatherings g
      LEFT JOIN (
        SELECT gathering_id, COUNT(*) AS participant_count
        FROM gathering_participants
        GROUP BY gathering_id
      ) p ON p.gathering_id = g.id
      WHERE g.class_id = ?
      ORDER BY g.gathering_at ASC
    `
    ).bind(class_id).all();

    return new Response(JSON.stringify({ success: true, data: results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  await ensureTables(env.DB);
  await ensureGatheringsSchema(env.DB);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await request.json();
    const {
      action,
      class_id,
      instructor_id,
      title,
      description,
      location,
      gathering_at,
      deadline_at,
      capacity_min,
      capacity_max,
      max_capacity,
      gathering_id,
      user_id
    } = body;

    if (action === 'create') {
      const effectiveInstructorId = instructor_id || body.created_by || body.user_id;
      const effectiveCapacityMin = capacity_min ?? body.min_capacity ?? 0;
      const effectiveCapacityMax = capacity_max || max_capacity;
      const effectiveDeadlineAt = deadline_at || gathering_at;

      if (!class_id || !effectiveInstructorId || !title || !gathering_at || !effectiveDeadlineAt || !effectiveCapacityMax) {
        return new Response(JSON.stringify({ success: false, error: '필수 항목 누락' }), { status: 400, headers: cors });
      }

      // 사용자 요청: 3일 전 제한 제거
      // const gatheringDate = new Date(gathering_at);
      // const now = new Date();
      // ...

      const id = 'gather_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

      await env.DB.prepare(`
        INSERT INTO class_gatherings (id, class_id, instructor_id, title, description, location, gathering_at, deadline_at, capacity_min, capacity_max, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
      `).bind(id, class_id, effectiveInstructorId, title, description || '', location || '', gathering_at, effectiveDeadlineAt, effectiveCapacityMin, effectiveCapacityMax).run();

      await refreshClassStats(env.DB, class_id).catch((error) => {
        console.warn('[API /gatherings] refreshClassStats after gathering create failed:', error.message);
      });

      return new Response(JSON.stringify({ success: true, data: { id } }), { status: 201, headers: cors });
      
    } else if (action === 'join') {
      if (!gathering_id || !user_id) return new Response(JSON.stringify({ success: false, error: '필수 항목 누락' }), { status: 400, headers: cors });
      
      const gatherRes = await env.DB.prepare('SELECT status, capacity_max, class_id FROM class_gatherings WHERE id = ?').bind(gathering_id).first();
      if (!gatherRes) return new Response(JSON.stringify({ success: false, error: '모임을 찾을 수 없습니다.' }), { status: 404, headers: cors });
      if (gatherRes.status !== 'open') return new Response(JSON.stringify({ success: false, error: '모집이 마감된 모임입니다.' }), { status: 400, headers: cors });

      // 인원 수 마감 확인
      const cntRes = await env.DB.prepare('SELECT COUNT(*) as cnt FROM gathering_participants WHERE gathering_id = ?').bind(gathering_id).first();
      if (cntRes.cnt >= gatherRes.capacity_max) {
        // 자동 마감 처리
        await env.DB.prepare("UPDATE class_gatherings SET status = 'closed' WHERE id = ?").bind(gathering_id).run();
        return new Response(JSON.stringify({ success: false, error: '모집 인원이 마감되었습니다.' }), { status: 400, headers: cors });
      }

      // 이미 참여했는지 확인
      const existRes = await env.DB.prepare('SELECT * FROM gathering_participants WHERE gathering_id = ? AND user_id = ?').bind(gathering_id, user_id).first();
      if (existRes) return new Response(JSON.stringify({ success: false, error: '이미 참여한 모임입니다.' }), { status: 400, headers: cors });

      // 수강권(패스) 차감 처리 (월정액은 차감 없음, 횟수권은 -1)
      const partRes = await env.DB.prepare('SELECT remaining_passes, pass_type, role FROM class_participants WHERE class_id = ? AND user_id = ?').bind(gatherRes.class_id, user_id).first();
      
      // 강사가 아닐 경우만 수강권 체크
      if (partRes && partRes.role !== 'instructor') {
          if (partRes.pass_type === 'count' && partRes.remaining_passes <= 0) {
              return new Response(JSON.stringify({ success: false, error: '잔여 수강권이 부족합니다.' }), { status: 400, headers: cors });
          }
          if (partRes.pass_type === 'count' && partRes.remaining_passes > 0) {
              await env.DB.prepare('UPDATE class_participants SET remaining_passes = remaining_passes - 1 WHERE class_id = ? AND user_id = ?').bind(gatherRes.class_id, user_id).run();
          }
      }

      await env.DB.prepare('INSERT INTO gathering_participants (gathering_id, user_id) VALUES (?, ?)').bind(gathering_id, user_id).run();

      // 모집 인원이 다 찼다면 상태 업데이트
      if (cntRes.cnt + 1 >= gatherRes.capacity_max) {
        await env.DB.prepare("UPDATE class_gatherings SET status = 'closed' WHERE id = ?").bind(gathering_id).run();
      }

      return new Response(JSON.stringify({ success: true }), { headers: cors });
      
    } else if (action === 'leave') {
      if (!gathering_id || !user_id) return new Response(JSON.stringify({ success: false, error: '필수 항목 누락' }), { status: 400, headers: cors });
      
      // 패스 반환 로직? (필요하다면 구현)
      const gatherRes = await env.DB.prepare('SELECT class_id FROM class_gatherings WHERE id = ?').bind(gathering_id).first();
      if(gatherRes) {
          const partRes = await env.DB.prepare('SELECT pass_type, role FROM class_participants WHERE class_id = ? AND user_id = ?').bind(gatherRes.class_id, user_id).first();
          if (partRes && partRes.role !== 'instructor' && partRes.pass_type === 'count') {
             await env.DB.prepare('UPDATE class_participants SET remaining_passes = remaining_passes + 1 WHERE class_id = ? AND user_id = ?').bind(gatherRes.class_id, user_id).run();
          }
      }
      
      await env.DB.prepare('DELETE FROM gathering_participants WHERE gathering_id = ? AND user_id = ?').bind(gathering_id, user_id).run();
      
      return new Response(JSON.stringify({ success: true }), { headers: cors });
      
    } else if (action === 'close') {
       await env.DB.prepare("UPDATE class_gatherings SET status = 'closed' WHERE id = ?").bind(gathering_id).run();
       return new Response(JSON.stringify({ success: true }), { headers: cors });
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), { status: 400, headers: cors });
    }

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}

async function ensureTables(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS class_gatherings (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        instructor_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        gathering_at DATETIME NOT NULL,
        deadline_at DATETIME NOT NULL,
        capacity_min INTEGER DEFAULT 0,
        capacity_max INTEGER NOT NULL,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 자가 치유: 기존 테이블에 location 컬럼이 없는 경우 추가
    try {
      await db.prepare('ALTER TABLE class_gatherings ADD COLUMN location TEXT').run();
    } catch (e) {}

    try {
      await db.prepare('ALTER TABLE class_gatherings ADD COLUMN description TEXT').run();
    } catch (e) {}
    try {
      await db.prepare('ALTER TABLE class_gatherings ADD COLUMN capacity_min INTEGER DEFAULT 0').run();
    } catch (e) {}
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS gathering_participants (
        gathering_id TEXT NOT NULL REFERENCES class_gatherings(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (gathering_id, user_id)
      )
    `).run();
  } catch (e) {
    console.error("ensureTables error:", e);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
