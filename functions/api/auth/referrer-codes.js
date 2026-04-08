import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

const REFERRER_GROUPS = [
  {
    label: '중부',
    options: [
      { value: 'aj001', label: '중부1' },
      { value: 'aj002', label: '중부2' },
      { value: 'aj003', label: '중부3' },
      { value: 'aj004', label: '중부4' },
      { value: 'aj005', label: '중부5' },
    ],
  },
  {
    label: '북부',
    options: [
      { value: 'ab001', label: '북부1' },
      { value: 'ab002', label: '북부2' },
      { value: 'ab003', label: '북부3' },
      { value: 'ab004', label: '북부4' },
      { value: 'ab005', label: '북부5' },
    ],
  },
  {
    label: '동부',
    options: [
      { value: 'ac001', label: '동부1' },
      { value: 'ac002', label: '동부2' },
      { value: 'ac003', label: '동부3' },
      { value: 'ac004', label: '동부4' },
      { value: 'ac005', label: '동부5' },
    ],
  },
  {
    label: '대학',
    options: [
      { value: 'as001', label: '대학1' },
      { value: 'as002', label: '대학2' },
      { value: 'as003', label: '대학3' },
      { value: 'as004', label: '대학4' },
    ],
  },
  {
    label: '행정',
    options: [
      { value: 'cs020', label: '행정' },
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
