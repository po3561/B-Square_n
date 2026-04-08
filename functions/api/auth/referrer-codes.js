import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

const REFERRER_GROUPS = [
  {
    label: '추천코드 그룹 A',
    options: [
      { value: 'aj001', label: '추천코드 01' },
      { value: 'aj002', label: '추천코드 02' },
      { value: 'aj003', label: '추천코드 03' },
      { value: 'aj004', label: '추천코드 04' },
      { value: 'aj005', label: '추천코드 05' },
    ],
  },
  {
    label: '추천코드 그룹 B',
    options: [
      { value: 'ab001', label: '추천코드 06' },
      { value: 'ab002', label: '추천코드 07' },
      { value: 'ab003', label: '추천코드 08' },
      { value: 'ab004', label: '추천코드 09' },
      { value: 'ab005', label: '추천코드 10' },
    ],
  },
  {
    label: '추천코드 그룹 C',
    options: [
      { value: 'ac001', label: '추천코드 11' },
      { value: 'ac002', label: '추천코드 12' },
      { value: 'ac003', label: '추천코드 13' },
      { value: 'ac004', label: '추천코드 14' },
      { value: 'ac005', label: '추천코드 15' },
    ],
  },
  {
    label: '추천코드 그룹 D',
    options: [
      { value: 'as001', label: '추천코드 16' },
      { value: 'as002', label: '추천코드 17' },
      { value: 'as003', label: '추천코드 18' },
      { value: 'as004', label: '추천코드 19' },
    ],
  },
  {
    label: '추천코드 그룹 E',
    options: [
      { value: 'cs020', label: '추천코드 20' },
    ],
  },
];

function normalizeCode(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cloneGroups(groups) {
  return groups.map((group) => ({
    label: group.label,
    options: group.options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  }));
}

function buildGroupsWithUsage(rows) {
  const usageMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = normalizeCode(row?.code);
    if (!code) continue;
    usageMap.set(code, Number(row?.usage_count || 0));
  }

  return REFERRER_GROUPS.map((group) => ({
    label: group.label,
    options: group.options.map((option) => ({
      value: option.value,
      label: option.label,
      usage_count: usageMap.get(normalizeCode(option.value)) || 0,
    })),
  }));
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await ensureAuthSchema(env.DB);

    const { results = [] } = await env.DB.prepare(`
      SELECT referrer_code AS code, COUNT(*) AS usage_count
      FROM users
      WHERE referrer_code IS NOT NULL
        AND TRIM(referrer_code) <> ''
      GROUP BY referrer_code
      ORDER BY usage_count DESC, referrer_code ASC
      LIMIT 200
    `).all();

    const groups = buildGroupsWithUsage(results);

    return json(request, env, {
      success: true,
      data: {
        source: results.length ? 'database' : 'fallback',
        groups,
      },
    });
  } catch (error) {
    console.error('[auth/referrer-codes] error:', error);
    return json(request, env, {
      success: true,
      data: {
        source: 'fallback',
        groups: cloneGroups(REFERRER_GROUPS),
      },
    });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
