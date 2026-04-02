import { json, options } from '../_lib/http.js';
import { ensureAuthSchema } from '../_lib/schema.js';

const GROUP_DEFINITIONS = [
  { prefix: 'aj', label: '중부' },
  { prefix: 'ab', label: '북부' },
  { prefix: 'ac', label: '동부' },
  { prefix: 'as', label: '대학' },
  { prefix: 'cs', label: '행정' },
];

const FALLBACK_GROUPS = [
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

function normalizeText(value) {
  return String(value ?? '').trim();
}

function getGroupLabel(code) {
  const value = normalizeText(code).toLowerCase();
  const group = GROUP_DEFINITIONS.find((item) => value.startsWith(item.prefix));
  return group?.label || '기타';
}

function getCodeLabel(code) {
  const value = normalizeText(code);
  if (!value) return '';

  const match = value.match(/^([a-z]{2})(\d+)$/i);
  if (!match) return value;

  const group = GROUP_DEFINITIONS.find((item) => item.prefix === match[1].toLowerCase());
  if (!group) return value;

  const number = String(Number(match[2]) || match[2]).replace(/^0+/, '') || '0';
  return `${group.label}${number}`;
}

function buildGroupsFromRows(rows) {
  const buckets = new Map();
  const groupOrder = new Map(GROUP_DEFINITIONS.map((group, index) => [group.label, index]));

  for (const row of rows) {
    const code = normalizeText(row?.code);
    if (!code) continue;

    const label = getGroupLabel(code);
    if (!buckets.has(label)) {
      buckets.set(label, []);
    }

    buckets.get(label).push({
      value: code,
      label: getCodeLabel(code),
      usage_count: Number(row?.usage_count || 0),
    });
  }

  return Array.from(buckets.entries())
    .sort((left, right) => {
      const leftIndex = groupOrder.has(left[0]) ? groupOrder.get(left[0]) : Number.MAX_SAFE_INTEGER;
      const rightIndex = groupOrder.has(right[0]) ? groupOrder.get(right[0]) : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left[0].localeCompare(right[0], 'ko');
    })
    .map(([label, options]) => ({
      label,
      options: options
        .sort((left, right) => {
          if (right.usage_count !== left.usage_count) {
            return right.usage_count - left.usage_count;
          }
          return left.label.localeCompare(right.label, 'ko');
        })
        .map(({ usage_count, ...option }) => option),
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

    const groups = results.length ? buildGroupsFromRows(results) : FALLBACK_GROUPS;

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
        groups: FALLBACK_GROUPS,
      },
    });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
