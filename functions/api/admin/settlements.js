import * as XLSX from 'xlsx';
import { buildSettlementWorkbook } from '../_lib/dashboard_finance.js';
import { json, options } from '../_lib/http.js';
import { ensureOperationsSchema } from '../_lib/schema.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSettlementQuery(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

function compactSettlementQuery(value) {
  return normalizeSettlementQuery(value).replace(/[^0-9a-z가-힣]+/g, '');
}

function tokenizeSettlementQuery(value) {
  return normalizeSettlementQuery(value)
    .split(/[\s,./|()\-_:]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildBigramSet(value) {
  const compact = compactSettlementQuery(value);
  if (compact.length < 2) return compact ? new Set([compact]) : new Set();
  const grams = new Set();
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  return grams;
}

function diceCoefficient(a, b) {
  const gramsA = buildBigramSet(a);
  const gramsB = buildBigramSet(b);
  if (!gramsA.size || !gramsB.size) return 0;

  let overlap = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) overlap += 1;
  }

  return (2 * overlap) / (gramsA.size + gramsB.size);
}

function settleNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settlementSearchFields(row = {}, scope = 'class') {
  const scopeKey = String(scope || 'class').toLowerCase() === 'instructor' ? 'instructor' : 'class';
  const common = [
    row.class_name,
    row.class_title,
    row.instructor_name,
    row.instructor_email,
    row.instructor_phone,
    row.bank_name,
    row.bank_account,
    row.bank_holder,
    row.admin_code,
    row.approval_code,
    row.batch_id,
    row.period_start,
    row.period_end,
    row.payout_date,
    row.category,
    row.keywords,
    row.coupon_detail,
    row.search_text,
  ];

  if (scopeKey === 'instructor') {
    common.push(row.class_count, row.settlement_count, row.class_titles);
  } else {
    common.push(row.order_count, row.class_count, row.source_type);
  }

  return common;
}

function settlementSearchText(row = {}, scope = 'class') {
  return settlementSearchFields(row, scope)
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function settlementSearchScore(row = {}, scope = 'class', query = '') {
  const normalizedQuery = normalizeSettlementQuery(query);
  if (!normalizedQuery) return 1;

  const compactQuery = compactSettlementQuery(normalizedQuery);
  if (!compactQuery) return 0;

  const tokens = tokenizeSettlementQuery(normalizedQuery);
  const queryDigits = compactQuery.replace(/[^0-9]+/g, '');
  const queryFields = settlementSearchFields(row, scope);

  let bestScore = 0;
  let tokenHits = 0;
  let digitHits = 0;

  for (const field of queryFields) {
    const normalizedField = normalizeSettlementQuery(field);
    if (!normalizedField) continue;

    const compactField = compactSettlementQuery(normalizedField);
    if (!compactField) continue;

    let score = 0;
    if (compactField === compactQuery) score += 1000;
    if (compactField.includes(compactQuery)) score += 350 + Math.min(100, compactQuery.length * 4);
    if (compactQuery.includes(compactField)) score += 180 + Math.min(60, compactField.length * 2);
    if (normalizedField.startsWith(normalizedQuery)) score += 120;
    if (normalizedField.includes(normalizedQuery)) score += 80;

    const fieldDigits = compactField.replace(/[^0-9]+/g, '');
    if (queryDigits && fieldDigits) {
      if (fieldDigits === queryDigits) score += 160;
      else if (fieldDigits.includes(queryDigits)) score += 90;
    }

    const fieldTokenHits = tokens.filter((token) => {
      const compactToken = compactSettlementQuery(token);
      return compactToken && compactField.includes(compactToken);
    }).length;

    if (fieldTokenHits) {
      tokenHits = Math.max(tokenHits, fieldTokenHits);
      score += fieldTokenHits * 35;
    }

    if (queryDigits && fieldDigits && fieldDigits.includes(queryDigits)) {
      digitHits = Math.max(digitHits, 1);
    }

    score += Math.round(diceCoefficient(compactField, compactQuery) * 120);

    if (score > bestScore) bestScore = score;
  }

  if (!bestScore && tokens.length) {
    const joined = compactSettlementQuery(queryFields.join(' '));
    const matchedTokens = tokens.filter((token) => {
      const compactToken = compactSettlementQuery(token);
      return compactToken && joined.includes(compactToken);
    }).length;
    if (matchedTokens) {
      tokenHits = Math.max(tokenHits, matchedTokens);
      bestScore = matchedTokens * 20;
    }
  }

  bestScore += tokenHits * 10;
  bestScore += digitHits * 20;
  return bestScore;
}

function settlementRowMatches(row = {}, scope = 'class', query = '') {
  return settlementSearchScore(row, scope, query) > 0;
}

function mergeSettlementRow(target = {}, source = {}) {
  if (!target || !source) return target || source;

  const stringFields = [
    'id',
    'batch_id',
    'batch_item_id',
    'class_id',
    'class_name',
    'class_title',
    'instructor_id',
    'instructor_name',
    'instructor_email',
    'instructor_phone',
    'profile_image_url',
    'bank_name',
    'bank_account',
    'bank_holder',
    'status',
    'approval_result',
    'admin_code',
    'payout_date',
    'period_start',
    'period_end',
    'source_type',
    'source_label',
    'coupon_detail',
    'category',
    'keywords',
  ];

  for (const field of stringFields) {
    if ((!target[field] || target[field] === '-') && source[field]) {
      target[field] = source[field];
    }
  }

  const numericFields = [
    'gross_revenue',
    'total_revenue',
    'refund_amount',
    'card_fee_amount',
    'tax_fee_amount',
    'platform_fee_amount',
    'net_revenue',
    'total_fee',
    'final_amount',
    'settlement_amount',
    'settlement_count',
    'class_count',
    'order_count',
    'payment_count',
    'refund_count',
  ];

  for (const field of numericFields) {
    const sourceValue = settleNumber(source[field], 0);
    const targetValue = settleNumber(target[field], 0);
    if (sourceValue > targetValue) {
      target[field] = sourceValue;
    } else if (!targetValue && sourceValue) {
      target[field] = sourceValue;
    }
  }

  if (!target.summary && source.summary) {
    target.summary = source.summary;
  }

  if (!target.search_text) {
    target.search_text = source.search_text || '';
  }

  return target;
}

function settlementCandidateKey(row = {}, scope = 'class') {
  const scopeKey = String(scope || 'class').toLowerCase() === 'instructor' ? 'instructor' : 'class';
  if (scopeKey === 'instructor') {
    return [
      row.instructor_id,
      row.instructor_email,
      row.instructor_phone,
      row.instructor_name,
    ].map((value) => String(value || '').trim()).filter(Boolean).join('|') || `instructor:${row.id || row.batch_id || row.class_id || row.admin_code || Math.random().toString(36).slice(2, 8)}`;
  }

  return [
    row.class_id,
    row.id,
    row.batch_item_id,
    row.class_title,
    row.class_name,
    row.instructor_name,
  ].map((value) => String(value || '').trim()).filter(Boolean).join('|') || `class:${row.id || row.batch_id || row.admin_code || Math.random().toString(36).slice(2, 8)}`;
}

function mapClassSearchRow(row = {}, latest = null) {
  const latestRow = latest || {};
  const grossRevenue = Number(latestRow.gross_revenue || latestRow.total_revenue || 0);
  const refundAmount = Number(latestRow.refund_amount || 0);
  const cardFee = Number(latestRow.card_fee_amount || 0);
  const taxFee = Number(latestRow.tax_fee_amount || 0);
  const platformFee = Number(latestRow.platform_fee_amount || 0);
  const totalFee = cardFee + taxFee + platformFee;
  const finalAmount = Number(latestRow.settlement_amount || latestRow.final_amount || 0);

  return {
    id: row.id,
    class_id: row.id,
    batch_id: latestRow.batch_id || null,
    batch_item_id: latestRow.batch_item_id || latestRow.id || null,
    class_name: row.title || row.class_title || row.class_name || '-',
    class_title: row.title || row.class_title || row.class_name || '-',
    instructor_id: row.creator_id || latestRow.instructor_id || null,
    instructor_name: row.instructor_name || latestRow.instructor_name || row.creator_name || '-',
    instructor_email: row.instructor_email || latestRow.instructor_email || row.creator_email || '',
    instructor_phone: row.instructor_phone || latestRow.instructor_phone || row.creator_phone || '',
    profile_image_url: row.profile_image_url || latestRow.profile_image_url || row.creator_profile_image_url || '',
    bank_name: row.payment_bank_name || latestRow.bank_name || '',
    bank_account: row.payment_bank_account || latestRow.bank_account || '',
    bank_holder: row.payment_bank_holder || latestRow.bank_holder || '',
    gross_revenue: grossRevenue,
    total_revenue: grossRevenue,
    refund_amount: refundAmount,
    card_fee_amount: cardFee,
    tax_fee_amount: taxFee,
    platform_fee_amount: platformFee,
    net_revenue: Math.max(0, grossRevenue - refundAmount),
    total_fee: totalFee,
    final_amount: finalAmount,
    settlement_amount: finalAmount,
    settlement_count: Number(latestRow.settlement_count || latestRow.order_count || row.current_participants || 0),
    class_count: Number(latestRow.class_count || 1),
    order_count: Number(latestRow.order_count || 0),
    payment_count: Number(latestRow.payment_count || 0),
    refund_count: Number(latestRow.refund_count || 0),
    status: latestRow.status || 'pending',
    approval_result: latestRow.approval_result || 'pending',
    admin_code: latestRow.admin_code || latestRow.manager_code || row.id || '-',
    payout_date: latestRow.payout_date || null,
    period_start: latestRow.period_start || null,
    period_end: latestRow.period_end || null,
    coupon_detail: row.coupon_detail || '',
    category: row.category || '',
    keywords: row.keywords || '',
    source_type: 'class',
    source_label: '클래스 정보',
  };
}

function formatMonth(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function buildPeriod(year, month, payoutDay) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const payoutDate = `${formatMonth(year, month)}-${String(Math.max(1, Math.min(28, payoutDay))).padStart(2, '0')}`;
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    payout_date: payoutDate,
  };
}

function generateBatchId(year, month) {
  return `STB_${String(year)}${String(month).padStart(2, '0')}`;
}

function generateManagerCode(year, month) {
  return `SET-${String(year)}${String(month).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function loadFeeSettings(db) {
  const existing = await db.prepare(`
    SELECT *
    FROM settlement_fee_settings
    WHERE id = 'global'
  `).first().catch(() => null);

  if (existing) {
    return {
      card_fee_rate: Number(existing.card_fee_rate || 6),
      tax_rate: Number(existing.tax_rate || 3.3),
      platform_fee_rate: Number(existing.platform_fee_rate || 1.7),
      payout_day: Number(existing.payout_day || 15),
      updated_by: existing.updated_by || null,
      updated_at: existing.updated_at || null,
    };
  }

  await db.prepare(`
    INSERT OR REPLACE INTO settlement_fee_settings (
      id, card_fee_rate, tax_rate, platform_fee_rate, payout_day, updated_at
    ) VALUES ('global', 6.0, 3.3, 1.7, 15, datetime('now'))
  `).run();

  return {
    card_fee_rate: 6,
    tax_rate: 3.3,
    platform_fee_rate: 1.7,
    payout_day: 15,
    updated_by: null,
    updated_at: null,
  };
}

async function computeBatchPreview(db, year, month) {
  const settings = await loadFeeSettings(db);
  const period = buildPeriod(year, month, settings.payout_day);

  const { results } = await db.prepare(`
    SELECT
      o.order_id,
      o.class_id,
      o.class_title,
      o.user_id,
      o.user_name,
      o.final_amount,
      o.amount,
      o.discount_amount,
      o.refund_amount,
      o.status,
      o.paid_at,
      o.created_at,
      c.creator_id AS instructor_id,
      COALESCE(c.instructor_name, owner.name, owner.username, '') AS instructor_name,
      COALESCE(c.instructor_email, owner.email, '') AS instructor_email,
      COALESCE(c.instructor_phone, owner.phone, '') AS instructor_phone,
      COALESCE(owner.profile_image_url, '') AS profile_image_url,
      c.payment_bank_name,
      c.payment_bank_account,
      c.payment_bank_holder
    FROM orders o
    LEFT JOIN classes c
      ON c.id = o.class_id
    LEFT JOIN users owner
      ON owner.id = c.creator_id
    WHERE o.class_id IS NOT NULL
      AND o.status IN ('paid', 'completed', 'partial_refunded', 'refunded')
      AND strftime('%Y', COALESCE(o.paid_at, o.created_at)) = ?
      AND strftime('%m', COALESCE(o.paid_at, o.created_at)) = ?
    ORDER BY COALESCE(o.paid_at, o.created_at) ASC
  `).bind(String(year), String(month).padStart(2, '0')).all();

  const classMap = new Map();
  const instructorSet = new Set();
  const orderUpdates = [];

  for (const row of results || []) {
    const classId = normalizeText(row.class_id);
    const instructorId = normalizeText(row.instructor_id);
    const key = classId || row.order_id;
    if (!classMap.has(key)) {
      classMap.set(key, {
        class_id: classId || null,
        class_title: row.class_title || 'Untitled class',
        instructor_id: instructorId || null,
        instructor_name: row.instructor_name || 'Unknown instructor',
        instructor_email: row.instructor_email || '',
        instructor_phone: row.instructor_phone || '',
        profile_image_url: row.profile_image_url || '',
        bank_name: row.payment_bank_name || '',
        bank_account: row.payment_bank_account || '',
        bank_holder: row.payment_bank_holder || '',
        order_count: 0,
        payment_count: 0,
        refund_count: 0,
        gross_revenue: 0,
        refund_amount: 0,
        net_revenue: 0,
        card_fee_amount: 0,
        tax_fee_amount: 0,
        platform_fee_amount: 0,
        settlement_amount: 0,
        orders: [],
      });
    }

    const item = classMap.get(key);
    const grossAmount = Number(row.final_amount || row.amount || 0);
    const refundAmount = Number(row.refund_amount || 0);
    const netRevenue = Math.max(0, grossAmount - refundAmount);

    item.order_count += 1;
    item.payment_count += grossAmount > 0 ? 1 : 0;
    item.refund_count += refundAmount > 0 ? 1 : 0;
    item.gross_revenue += grossAmount;
    item.refund_amount += refundAmount;
    item.net_revenue += netRevenue;
    item.orders.push({
      order_id: row.order_id,
      gross_revenue: grossAmount,
      refund_amount: refundAmount,
      net_revenue: netRevenue,
    });

    if (instructorId) instructorSet.add(instructorId);
  }

  const classItems = Array.from(classMap.values()).map((item, index) => {
    const cardFee = Math.round(item.net_revenue * (settings.card_fee_rate / 100));
    const taxFee = Math.round(item.net_revenue * (settings.tax_rate / 100));
    const platformFee = Math.round(item.net_revenue * (settings.platform_fee_rate / 100));
    const settlementAmount = Math.max(0, item.net_revenue - cardFee - taxFee - platformFee);

    const enriched = {
      ...item,
      id: `sti_preview_${year}${String(month).padStart(2, '0')}_${index + 1}`,
      card_fee_amount: cardFee,
      tax_fee_amount: taxFee,
      platform_fee_amount: platformFee,
      settlement_amount: settlementAmount,
      status: 'pending',
    };

    for (const order of item.orders) {
      orderUpdates.push({
        order_id: order.order_id,
        class_id: item.class_id,
        card_fee_amount: Math.round(order.net_revenue * (settings.card_fee_rate / 100)),
        tax_fee_amount: Math.round(order.net_revenue * (settings.tax_rate / 100)),
        platform_fee_amount: Math.round(order.net_revenue * (settings.platform_fee_rate / 100)),
        net_revenue_amount: order.net_revenue,
        instructor_settlement_amount: Math.max(
          0,
          order.net_revenue
          - Math.round(order.net_revenue * (settings.card_fee_rate / 100))
          - Math.round(order.net_revenue * (settings.tax_rate / 100))
          - Math.round(order.net_revenue * (settings.platform_fee_rate / 100))
        ),
      });
    }

    return enriched;
  });

  const instructorMap = new Map();
  for (const item of classItems) {
    const key = item.instructor_id || `unknown_${item.class_id || item.id}`;
    if (!instructorMap.has(key)) {
      instructorMap.set(key, {
        instructor_id: item.instructor_id,
        instructor_name: item.instructor_name,
        instructor_email: item.instructor_email || '',
        instructor_phone: item.instructor_phone || '',
        profile_image_url: item.profile_image_url || '',
        bank_name: item.bank_name,
        bank_account: item.bank_account,
        bank_holder: item.bank_holder,
        class_count: 0,
        order_count: 0,
        gross_revenue: 0,
        refund_amount: 0,
        net_revenue: 0,
        card_fee_amount: 0,
        tax_fee_amount: 0,
        platform_fee_amount: 0,
        settlement_amount: 0,
      });
    }
    const instructor = instructorMap.get(key);
    instructor.class_count += 1;
    instructor.order_count += item.order_count;
    instructor.gross_revenue += item.gross_revenue;
    instructor.refund_amount += item.refund_amount;
    instructor.net_revenue += item.net_revenue;
    instructor.card_fee_amount += item.card_fee_amount;
    instructor.tax_fee_amount += item.tax_fee_amount;
    instructor.platform_fee_amount += item.platform_fee_amount;
    instructor.settlement_amount += item.settlement_amount;
  }

  const summary = classItems.reduce((acc, item) => {
    acc.class_count += 1;
    acc.order_count += item.order_count;
    acc.gross_revenue += item.gross_revenue;
    acc.refund_amount += item.refund_amount;
    acc.net_revenue += item.net_revenue;
    acc.card_fee_amount += item.card_fee_amount;
    acc.tax_fee_amount += item.tax_fee_amount;
    acc.platform_fee_amount += item.platform_fee_amount;
    acc.settlement_amount += item.settlement_amount;
    return acc;
  }, {
    class_count: 0,
    instructor_count: instructorSet.size,
    order_count: 0,
    gross_revenue: 0,
    refund_amount: 0,
    net_revenue: 0,
    card_fee_amount: 0,
    tax_fee_amount: 0,
    platform_fee_amount: 0,
    settlement_amount: 0,
  });

  return {
    year,
    month,
    period,
    settings,
    summary,
    class_items: classItems,
    instructor_items: Array.from(instructorMap.values()).sort((a, b) => b.settlement_amount - a.settlement_amount),
    order_updates: orderUpdates,
  };
}

async function saveBatch(db, batchPreview) {
  const batchId = generateBatchId(batchPreview.year, batchPreview.month);
  const existingBatch = await db.prepare('SELECT * FROM settlement_batches WHERE year = ? AND month = ?').bind(batchPreview.year, batchPreview.month).first().catch(() => null);
  const managerCode = existingBatch?.manager_code || generateManagerCode(batchPreview.year, batchPreview.month);

  await db.prepare('DELETE FROM settlement_batch_items WHERE batch_id = ?').bind(batchId).run();
  await db.prepare(`
    UPDATE orders
    SET settlement_batch_id = NULL,
        settlement_item_id = NULL,
        settlement_status = 'pending'
    WHERE settlement_batch_id = ?
  `).bind(batchId).run();

  await db.prepare(`
    INSERT INTO settlement_batches (
      id, year, month, period_start, period_end, payout_date, status,
      class_count, instructor_count, order_count, gross_revenue, refund_amount,
      net_revenue, card_fee_amount, tax_fee_amount, platform_fee_amount,
      settlement_amount, manager_code, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      payout_date = excluded.payout_date,
      class_count = excluded.class_count,
      instructor_count = excluded.instructor_count,
      order_count = excluded.order_count,
      gross_revenue = excluded.gross_revenue,
      refund_amount = excluded.refund_amount,
      net_revenue = excluded.net_revenue,
      card_fee_amount = excluded.card_fee_amount,
      tax_fee_amount = excluded.tax_fee_amount,
      platform_fee_amount = excluded.platform_fee_amount,
      settlement_amount = excluded.settlement_amount,
      manager_code = excluded.manager_code,
      updated_at = datetime('now')
  `).bind(
    batchId,
    batchPreview.year,
    batchPreview.month,
    batchPreview.period.period_start,
    batchPreview.period.period_end,
    batchPreview.period.payout_date,
    batchPreview.summary.class_count,
    batchPreview.summary.instructor_count,
    batchPreview.summary.order_count,
    batchPreview.summary.gross_revenue,
    batchPreview.summary.refund_amount,
    batchPreview.summary.net_revenue,
    batchPreview.summary.card_fee_amount,
    batchPreview.summary.tax_fee_amount,
    batchPreview.summary.platform_fee_amount,
    batchPreview.summary.settlement_amount,
    managerCode,
    null,
  ).run();

  for (const item of batchPreview.class_items) {
    const itemId = `sti_${batchPreview.year}${String(batchPreview.month).padStart(2, '0')}_${(item.class_id || item.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || Math.random().toString(36).slice(2, 10)}`;
    await db.prepare(`
      INSERT INTO settlement_batch_items (
        id, batch_id, instructor_id, instructor_name, instructor_email, instructor_phone, profile_image_url, class_id, class_title,
        bank_name, bank_account, bank_holder, order_count, payment_count,
        refund_count, gross_revenue, refund_amount, net_revenue,
        card_fee_amount, tax_fee_amount, platform_fee_amount, settlement_amount,
        status, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))
    `).bind(
      itemId,
      batchId,
      item.instructor_id || null,
      item.instructor_name,
      item.instructor_email || null,
      item.instructor_phone || null,
      item.profile_image_url || null,
      item.class_id || null,
      item.class_title,
      item.bank_name,
      item.bank_account,
      item.bank_holder,
      item.order_count,
      item.payment_count,
      item.refund_count,
      item.gross_revenue,
      item.refund_amount,
      item.net_revenue,
      item.card_fee_amount,
      item.tax_fee_amount,
      item.platform_fee_amount,
      item.settlement_amount,
      JSON.stringify({
        year: batchPreview.year,
        month: batchPreview.month,
      }),
    ).run();

    if (item.orders?.length) {
      for (const order of item.orders) {
        const orderFees = batchPreview.order_updates.find((entry) => entry.order_id === order.order_id);
        await db.prepare(`
          UPDATE orders
          SET settlement_batch_id = ?,
              settlement_item_id = ?,
              settlement_status = 'ready',
              settlement_month = ?,
              card_fee_amount = ?,
              tax_fee_amount = ?,
              platform_fee_amount = ?,
              net_revenue_amount = ?,
              instructor_settlement_amount = ?
          WHERE order_id = ?
        `).bind(
          batchId,
          itemId,
          formatMonth(batchPreview.year, batchPreview.month),
          Number(orderFees?.card_fee_amount || 0),
          Number(orderFees?.tax_fee_amount || 0),
          Number(orderFees?.platform_fee_amount || 0),
          Number(orderFees?.net_revenue_amount || 0),
          Number(orderFees?.instructor_settlement_amount || 0),
          order.order_id,
        ).run();
      }
    }
  }

  return batchId;
}

async function loadBatchDetail(db, batchId) {
  const batch = await db.prepare('SELECT * FROM settlement_batches WHERE id = ?').bind(batchId).first();
  if (!batch) return null;

  const { results: classItems } = await db.prepare(`
    SELECT *
    FROM settlement_batch_items
    WHERE batch_id = ?
    ORDER BY settlement_amount DESC, class_title ASC
  `).bind(batchId).all();

  const instructorMap = new Map();
  for (const item of classItems || []) {
    const key = item.instructor_id || `unknown_${item.class_id || item.id}`;
    if (!instructorMap.has(key)) {
      instructorMap.set(key, {
        instructor_id: item.instructor_id,
        instructor_name: item.instructor_name,
        instructor_email: item.instructor_email || '',
        instructor_phone: item.instructor_phone || '',
        profile_image_url: item.profile_image_url || '',
        bank_name: item.bank_name,
        bank_account: item.bank_account,
        bank_holder: item.bank_holder,
        class_count: 0,
        order_count: 0,
        gross_revenue: 0,
        refund_amount: 0,
        net_revenue: 0,
        card_fee_amount: 0,
        tax_fee_amount: 0,
        platform_fee_amount: 0,
        settlement_amount: 0,
      });
    }
    const instructor = instructorMap.get(key);
    instructor.class_count += 1;
    instructor.order_count += Number(item.order_count || 0);
    instructor.gross_revenue += Number(item.gross_revenue || 0);
    instructor.refund_amount += Number(item.refund_amount || 0);
    instructor.net_revenue += Number(item.net_revenue || 0);
    instructor.card_fee_amount += Number(item.card_fee_amount || 0);
    instructor.tax_fee_amount += Number(item.tax_fee_amount || 0);
    instructor.platform_fee_amount += Number(item.platform_fee_amount || 0);
    instructor.settlement_amount += Number(item.settlement_amount || 0);
  }

  return {
    batch,
    class_items: classItems || [],
    instructor_items: Array.from(instructorMap.values()).sort((a, b) => b.settlement_amount - a.settlement_amount),
  };
}

async function loadBatchList(db, filters = {}) {
  let sql = 'SELECT * FROM settlement_batches WHERE 1 = 1';
  const params = [];
  if (filters.year) {
    sql += ' AND year = ?';
    params.push(filters.year);
  }
  if (filters.month) {
    sql += ' AND month = ?';
    params.push(filters.month);
  }
  sql += ' ORDER BY year DESC, month DESC';
  const { results } = await db.prepare(sql).bind(...params).all();
  return results || [];
}

function sumFeeAmounts(item = {}) {
  return Number(item.card_fee_amount || 0)
    + Number(item.tax_fee_amount || 0)
    + Number(item.platform_fee_amount || 0);
}

function mapDashboardClassRow(item = {}, batch = null) {
  const grossRevenue = Number(item.gross_revenue || item.net_revenue || item.total_amount || 0);
  const refundAmount = Number(item.refund_amount || 0);
  const cardFee = Number(item.card_fee_amount || 0);
  const taxFee = Number(item.tax_fee_amount || 0);
  const platformFee = Number(item.platform_fee_amount || 0);
  const totalFee = cardFee + taxFee + platformFee;
  const finalAmount = Number(item.settlement_amount || item.final_amount || 0);
  return {
    id: item.id || item.class_id || `${item.instructor_id || 'unknown'}_${item.class_title || item.class_name || ''}`,
    batch_id: batch?.id || item.batch_id || null,
    batch_item_id: item.id || null,
    class_id: item.class_id || null,
    class_name: item.class_title || item.class_name || '-',
    class_title: item.class_title || item.class_name || '-',
    instructor_id: item.instructor_id || null,
    instructor_name: item.instructor_name || '-',
    instructor_email: item.instructor_email || '',
    instructor_phone: item.instructor_phone || '',
    profile_image_url: item.profile_image_url || '',
    bank_name: item.bank_name || item.account_bank_name || '',
    bank_account: item.bank_account || item.account_number || '',
    bank_holder: item.bank_holder || item.account_holder || '',
    gross_revenue: grossRevenue,
    total_revenue: grossRevenue,
    refund_amount: refundAmount,
    card_fee_amount: cardFee,
    tax_fee_amount: taxFee,
    platform_fee_amount: platformFee,
    net_revenue: Math.max(0, grossRevenue - refundAmount),
    total_fee: totalFee,
    final_amount: finalAmount,
    settlement_amount: finalAmount,
    settlement_count: Number(item.order_count || item.class_count || 0),
    class_count: Number(item.order_count || item.class_count || 0),
    status: item.status || batch?.status || 'pending',
    approval_result: item.approval_result || batch?.approval_result || 'pending',
    admin_code: batch?.manager_code || item.manager_code || batch?.id || item.id || '-',
    payout_date: batch?.payout_date || item.payout_date || null,
  };
}

function mapDashboardInstructorRow(item = {}, classCount = 0, batch = null) {
  const grossRevenue = Number(item.gross_revenue || item.net_revenue || 0);
  const refundAmount = Number(item.refund_amount || 0);
  const cardFee = Number(item.card_fee_amount || 0);
  const taxFee = Number(item.tax_fee_amount || 0);
  const platformFee = Number(item.platform_fee_amount || 0);
  const totalFee = cardFee + taxFee + platformFee;
  const finalAmount = Number(item.settlement_amount || 0);
  return {
    id: item.id || item.instructor_id || `${item.instructor_name || 'unknown'}_${item.class_title || item.class_name || ''}`,
    batch_id: batch?.id || item.batch_id || null,
    instructor_id: item.instructor_id || null,
    instructor_name: item.instructor_name || '-',
    instructor_email: item.instructor_email || '',
    instructor_phone: item.instructor_phone || '',
    profile_image_url: item.profile_image_url || '',
    bank_name: item.bank_name || item.account_bank_name || '',
    bank_account: item.bank_account || item.account_number || '',
    bank_holder: item.bank_holder || item.account_holder || '',
    class_count: Number(classCount || item.class_count || 0),
    settlement_count: Number(classCount || item.class_count || 0),
    gross_revenue: grossRevenue,
    total_revenue: grossRevenue,
    refund_amount: refundAmount,
    card_fee_amount: cardFee,
    tax_fee_amount: taxFee,
    platform_fee_amount: platformFee,
    net_revenue: Math.max(0, grossRevenue - refundAmount),
    total_fee: totalFee,
    final_amount: finalAmount,
    settlement_amount: finalAmount,
    status: item.status || batch?.status || 'pending',
    approval_result: item.approval_result || batch?.approval_result || 'pending',
    admin_code: batch?.manager_code || item.manager_code || batch?.id || item.id || '-',
    payout_date: batch?.payout_date || item.payout_date || null,
  };
}

function summarizeSettlementRows(classes = [], instructors = []) {
  return {
    class_count: classes.length,
    instructor_count: new Set(
      (instructors || [])
        .map((row) => String(row.instructor_id || row.instructor_name || row.id || '').trim())
        .filter(Boolean),
    ).size,
    order_count: classes.reduce((sum, row) => sum + Number(row.settlement_count ?? row.class_count ?? 0), 0),
    gross_revenue: classes.reduce((sum, row) => sum + Number(row.total_revenue ?? row.gross_revenue ?? 0), 0),
    refund_amount: classes.reduce((sum, row) => sum + Number(row.refund_amount ?? 0), 0),
    net_revenue: classes.reduce((sum, row) => sum + Number(row.net_revenue ?? Math.max(0, Number(row.total_revenue ?? row.gross_revenue ?? 0) - Number(row.refund_amount ?? 0))), 0),
    card_fee_amount: classes.reduce((sum, row) => sum + Number(row.card_fee_amount ?? 0), 0),
    tax_fee_amount: classes.reduce((sum, row) => sum + Number(row.tax_fee_amount ?? 0), 0),
    platform_fee_amount: classes.reduce((sum, row) => sum + Number(row.platform_fee_amount ?? 0), 0),
    settlement_amount: classes.reduce((sum, row) => sum + Number(row.final_amount ?? row.settlement_amount ?? 0), 0),
  };
}

async function loadSettlementSearchData(db, query, options = {}) {
  const normalizedQuery = normalizeSettlementQuery(query);
  if (!normalizedQuery) return null;

  const settings = await loadFeeSettings(db);
  const like = `%${normalizedQuery}%`;
  const period = String(options.period || 'month').toLowerCase() === 'year' ? 'year' : 'month';
  const year = normalizeInt(options.year);
  const month = normalizeInt(options.month);
  const currentDashboard = year && month
    ? await loadDashboardData(db, period, year, month, { query: '' })
    : null;

  const currentClassRows = Array.isArray(currentDashboard?.classes) ? currentDashboard.classes : [];
  const classCandidates = await db.prepare(`
    SELECT
      c.id,
      c.creator_id,
      c.creator_email,
      c.title,
      c.category,
      c.keywords,
      c.summary,
      c.price,
      c.discount_rate,
      c.coupon_pack,
      c.coupon_detail,
      c.class_type,
      c.operating_mode,
      c.is_free,
      c.payment_bank_name,
      c.payment_bank_account,
      c.payment_bank_holder,
      c.instructor_phone,
      c.instructor_name,
      c.instructor_email,
      c.current_participants,
      c.thumbnail,
      c.image_url,
      c.created_at,
      c.updated_at,
      u.name AS creator_name,
      u.username AS creator_username,
      COALESCE(u.email, c.creator_email) AS resolved_email,
      COALESCE(u.phone, '') AS creator_phone,
      COALESCE(u.profile_image_url, '') AS profile_image_url,
      COALESCE(s.avg_rating, 0) AS avg_rating,
      COALESCE(s.review_count, 0) AS review_count,
      COALESCE(s.bookmark_count, 0) AS bookmark_count
    FROM classes c
    LEFT JOIN users u ON u.id = c.creator_id
    LEFT JOIN class_stats s ON s.class_id = c.id
    WHERE (
      c.title LIKE ?
      OR c.category LIKE ?
      OR c.keywords LIKE ?
      OR c.summary LIKE ?
      OR c.coupon_detail LIKE ?
      OR c.instructor_name LIKE ?
      OR c.instructor_email LIKE ?
      OR c.instructor_phone LIKE ?
      OR c.payment_bank_name LIKE ?
      OR c.payment_bank_account LIKE ?
      OR c.payment_bank_holder LIKE ?
      OR u.name LIKE ?
      OR u.username LIKE ?
      OR u.email LIKE ?
      OR u.phone LIKE ?
    )
    ORDER BY c.updated_at DESC, c.created_at DESC
    LIMIT 120
  `).bind(
    like, like, like, like, like,
    like, like, like, like, like, like,
    like, like, like, like,
  ).all().catch(() => ({ results: [] }));

  const classMap = new Map();
  for (const row of currentClassRows) {
    const key = settlementCandidateKey(row, 'class');
    const score = settlementSearchScore(row, 'class', normalizedQuery);
    if (score <= 0) continue;
    const copy = {
      ...row,
      source_type: row.source_type || 'current',
      source_label: row.source_label || '현재 정산',
      search_score: score,
    };
    classMap.set(key, copy);
  }

  const classCandidateIds = [];
  for (const row of classCandidates.results || []) {
    const latest = null;
    const copy = mapClassSearchRow({
      id: row.id,
      creator_id: row.creator_id,
      creator_email: row.creator_email || row.resolved_email || '',
      title: row.title,
      category: row.category,
      keywords: row.keywords,
      summary: row.summary,
      price: row.price,
      discount_rate: row.discount_rate,
      coupon_pack: row.coupon_pack,
      coupon_detail: row.coupon_detail,
      class_type: row.class_type,
      operating_mode: row.operating_mode,
      is_free: row.is_free,
      instructor_phone: row.instructor_phone || '',
      instructor_name: row.instructor_name || row.creator_name || row.creator_username || '',
      instructor_email: row.instructor_email || row.resolved_email || '',
      current_participants: row.current_participants,
      thumbnail: row.thumbnail,
      image_url: row.image_url,
      profile_image_url: row.profile_image_url || '',
      creator_phone: row.creator_phone || '',
    }, latest);
    copy.creator_name = row.creator_name || row.creator_username || '';
    copy.creator_email = row.resolved_email || row.creator_email || '';
    copy.creator_phone = row.creator_phone || '';
    copy.payment_bank_name = row.payment_bank_name || '';
    copy.payment_bank_account = row.payment_bank_account || '';
    copy.payment_bank_holder = row.payment_bank_holder || '';
    copy.avg_rating = Number(row.avg_rating || 0);
    copy.review_count = Number(row.review_count || 0);
    copy.bookmark_count = Number(row.bookmark_count || 0);
    copy.search_score = settlementSearchScore(copy, 'class', normalizedQuery);
    copy.source_type = 'class';
    copy.source_label = '클래스 정보';
    if (copy.search_score > 0) {
      const existing = classMap.get(settlementCandidateKey(copy, 'class'));
      if (existing) {
        mergeSettlementRow(existing, copy);
        existing.search_score = Math.max(existing.search_score || 0, copy.search_score || 0);
        existing.source_type = existing.source_type || copy.source_type;
        existing.source_label = existing.source_label || copy.source_label;
      } else {
        classMap.set(settlementCandidateKey(copy, 'class'), copy);
      }
      if (copy.class_id) classCandidateIds.push(copy.class_id);
    }
  }

  const uniqueClassIds = Array.from(new Set(classCandidateIds.filter(Boolean))).slice(0, 120);
  const latestHistoryByClass = new Map();
  if (uniqueClassIds.length) {
    const placeholders = uniqueClassIds.map(() => '?').join(',');
    const { results: latestResults } = await db.prepare(`
      SELECT
        i.*,
        b.id AS batch_id,
        b.year AS batch_year,
        b.month AS batch_month,
        b.period_start,
        b.period_end,
        b.payout_date,
        b.status AS batch_status,
        b.approval_result AS batch_approval_result,
        b.manager_code
      FROM settlement_batch_items i
      INNER JOIN settlement_batches b
        ON b.id = i.batch_id
      WHERE i.class_id IN (${placeholders})
      ORDER BY b.year DESC, b.month DESC, i.settlement_amount DESC, i.class_title ASC
    `).bind(...uniqueClassIds).all().catch(() => ({ results: [] }));

    for (const row of latestResults || []) {
      if (!row.class_id || latestHistoryByClass.has(row.class_id)) continue;
      latestHistoryByClass.set(row.class_id, row);
    }
  }

  for (const [key, row] of classMap.entries()) {
    if (!row.class_id) continue;
    const latest = latestHistoryByClass.get(row.class_id);
    if (!latest) continue;
    mergeSettlementRow(row, mapDashboardClassRow(latest, {
      id: latest.batch_id,
      status: latest.batch_status,
      approval_result: latest.batch_approval_result,
      manager_code: latest.manager_code,
      payout_date: latest.payout_date,
    }));
    row.batch_id = latest.batch_id || row.batch_id || null;
    row.batch_item_id = latest.id || row.batch_item_id || null;
    row.admin_code = latest.manager_code || row.admin_code || row.batch_id || row.id || '-';
    row.status = latest.batch_status || row.status || 'pending';
    row.approval_result = latest.batch_approval_result || row.approval_result || 'pending';
    row.payout_date = latest.payout_date || row.payout_date || null;
    row.period_start = latest.period_start || row.period_start || null;
    row.period_end = latest.period_end || row.period_end || null;
    row.search_score = Math.max(row.search_score || 0, settlementSearchScore(row, 'class', normalizedQuery));
  }

  const historyCandidates = await db.prepare(`
    SELECT
      i.*,
      b.id AS batch_id,
      b.year AS batch_year,
      b.month AS batch_month,
      b.period_start,
      b.period_end,
      b.payout_date,
      b.status AS batch_status,
      b.approval_result AS batch_approval_result,
      b.manager_code
    FROM settlement_batch_items i
    INNER JOIN settlement_batches b
      ON b.id = i.batch_id
    WHERE (
      i.class_title LIKE ?
      OR i.instructor_name LIKE ?
      OR i.instructor_email LIKE ?
      OR i.instructor_phone LIKE ?
      OR i.bank_name LIKE ?
      OR i.bank_account LIKE ?
      OR i.bank_holder LIKE ?
      OR b.manager_code LIKE ?
      OR b.id LIKE ?
    )
    ORDER BY b.year DESC, b.month DESC, i.settlement_amount DESC, i.class_title ASC
    LIMIT 200
  `).bind(like, like, like, like, like, like, like, like, like).all().catch(() => ({ results: [] }));

  for (const row of historyCandidates.results || []) {
    const batch = {
      id: row.batch_id,
      status: row.batch_status,
      approval_result: row.batch_approval_result,
      manager_code: row.manager_code,
      payout_date: row.payout_date,
    };
    const mapped = {
      ...mapDashboardClassRow(row, batch),
      year: row.batch_year || null,
      month: row.batch_month || null,
      period_start: row.period_start || null,
      period_end: row.period_end || null,
      source_type: 'history',
      source_label: `${row.batch_year || '-'}년 ${row.batch_month || '-'}월 정산`,
      search_score: settlementSearchScore(row, 'class', normalizedQuery),
    };
    const key = settlementCandidateKey(mapped, 'class');
    if (classMap.has(key)) {
      const target = classMap.get(key);
      mergeSettlementRow(target, mapped);
      target.search_score = Math.max(target.search_score || 0, mapped.search_score || 0);
      target.source_type = target.source_type === 'current' ? target.source_type : mapped.source_type;
      target.source_label = target.source_label || mapped.source_label;
      classMap.set(key, target);
    } else if (mapped.search_score > 0) {
      classMap.set(key, mapped);
    }
  }

  const classRows = Array.from(classMap.values())
    .filter((row) => settlementSearchScore(row, 'class', normalizedQuery) > 0)
    .sort((a, b) => {
      const scoreDiff = (b.search_score || 0) - (a.search_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.final_amount || b.settlement_amount || 0) - Number(a.final_amount || a.settlement_amount || 0);
    });

  const instructorMap = new Map();
  for (const row of classRows) {
    const key = [
      row.instructor_id,
      row.instructor_email,
      row.instructor_phone,
      row.instructor_name,
    ].map((value) => String(value || '').trim()).filter(Boolean).join('|') || `instructor:${row.class_id || row.id}`;

    if (!instructorMap.has(key)) {
      instructorMap.set(key, {
        id: row.instructor_id || row.id || row.class_id || key,
        batch_id: row.batch_id || null,
        instructor_id: row.instructor_id || null,
        instructor_name: row.instructor_name || '-',
        instructor_email: row.instructor_email || '',
        instructor_phone: row.instructor_phone || '',
        profile_image_url: row.profile_image_url || '',
        bank_name: row.bank_name || '',
        bank_account: row.bank_account || '',
        bank_holder: row.bank_holder || '',
        class_count: 0,
        settlement_count: 0,
        total_revenue: 0,
        gross_revenue: 0,
        refund_amount: 0,
        card_fee_amount: 0,
        tax_fee_amount: 0,
        platform_fee_amount: 0,
        net_revenue: 0,
        total_fee: 0,
        final_amount: 0,
        settlement_amount: 0,
        status: row.status || 'pending',
        approval_result: row.approval_result || 'pending',
        admin_code: row.admin_code || row.batch_id || row.id || '-',
        payout_date: row.payout_date || null,
        class_titles: [],
        search_score: 0,
      });
    }

    const instructor = instructorMap.get(key);
    instructor.class_count += 1;
    instructor.settlement_count += Number(row.settlement_count || row.class_count || 0);
    instructor.total_revenue += Number(row.total_revenue || row.gross_revenue || 0);
    instructor.gross_revenue += Number(row.gross_revenue || 0);
    instructor.refund_amount += Number(row.refund_amount || 0);
    instructor.card_fee_amount += Number(row.card_fee_amount || 0);
    instructor.tax_fee_amount += Number(row.tax_fee_amount || 0);
    instructor.platform_fee_amount += Number(row.platform_fee_amount || 0);
    instructor.net_revenue += Number(row.net_revenue || Math.max(0, Number(row.total_revenue || row.gross_revenue || 0) - Number(row.refund_amount || 0)));
    instructor.total_fee += Number(row.total_fee || (Number(row.card_fee_amount || 0) + Number(row.tax_fee_amount || 0) + Number(row.platform_fee_amount || 0)));
    instructor.final_amount += Number(row.final_amount || row.settlement_amount || 0);
    instructor.settlement_amount += Number(row.settlement_amount || row.final_amount || 0);
    if (row.class_title) instructor.class_titles.push(row.class_title);
    instructor.bank_name = instructor.bank_name || row.bank_name || '';
    instructor.bank_account = instructor.bank_account || row.bank_account || '';
    instructor.bank_holder = instructor.bank_holder || row.bank_holder || '';
    instructor.profile_image_url = instructor.profile_image_url || row.profile_image_url || '';
    instructor.search_score = Math.max(
      instructor.search_score || 0,
      settlementSearchScore({
        ...instructor,
        class_titles: instructor.class_titles.join(' '),
      }, 'instructor', normalizedQuery),
    );
  }

  const instructorRows = Array.from(instructorMap.values())
    .filter((row) => settlementSearchScore({
      ...row,
      class_titles: row.class_titles.join(' '),
    }, 'instructor', normalizedQuery) > 0)
    .map((row) => ({
      ...row,
      class_titles: row.class_titles.join(' · '),
    }))
    .sort((a, b) => {
      const scoreDiff = (b.search_score || 0) - (a.search_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.final_amount || b.settlement_amount || 0) - Number(a.final_amount || a.settlement_amount || 0);
    });

  if (!classRows.length && !instructorRows.length) return null;

  return {
    period: 'search',
    year: year || null,
    month: month || null,
    period_label: `검색 결과: ${normalizedQuery}`,
    fee_rates: {
      pg_rate: settings.card_fee_rate,
      tax_rate: settings.tax_rate,
      platform_rate: settings.platform_fee_rate,
      payout_day: settings.payout_day,
    },
    summary: summarizeSettlementRows(classRows, instructorRows),
    classes: classRows,
    instructors: instructorRows,
    search_query: normalizedQuery,
  };
}

async function finalizeSettlementDashboard(db, dashboard, query) {
  const normalizedQuery = normalizeSettlementQuery(query);
  if (!normalizedQuery) return dashboard;

  const classRows = (dashboard.classes || [])
    .map((row) => ({ row, score: settlementSearchScore(row, 'class', normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.row.final_amount || b.row.settlement_amount || 0) - Number(a.row.final_amount || a.row.settlement_amount || 0);
    })
    .map((entry) => ({ ...entry.row, search_score: entry.score }));

  const instructorRows = (dashboard.instructors || [])
    .map((row) => ({
      row,
      score: settlementSearchScore({
        ...row,
        class_titles: row.class_titles || row.class_title || row.class_name || '',
      }, 'instructor', normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.row.final_amount || b.row.settlement_amount || 0) - Number(a.row.final_amount || a.row.settlement_amount || 0);
    })
    .map((entry) => ({ ...entry.row, search_score: entry.score }));

  if (classRows.length || instructorRows.length) {
    return {
      ...dashboard,
      classes: classRows,
      instructors: instructorRows,
      summary: summarizeSettlementRows(classRows, instructorRows),
      period_label: `${dashboard.period_label || '정산'} · 검색: ${normalizedQuery}`,
      search_query: normalizedQuery,
    };
  }

  const fallback = await loadSettlementSearchData(db, normalizedQuery, {
    period: dashboard.period,
    year: dashboard.year,
    month: dashboard.month,
  });
  return fallback || dashboard;
}

async function loadDashboardData(db, period, year, month, options = {}) {
  const settings = await loadFeeSettings(db);
  const normalizedPeriod = String(period || 'month').toLowerCase() === 'year' ? 'year' : 'month';
  const query = normalizeText(options.query || '');

  if (normalizedPeriod === 'year') {
    const { results } = await db.prepare(`
      SELECT
        i.*,
        b.id AS batch_id,
        b.year AS batch_year,
        b.month AS batch_month,
        b.period_start,
        b.period_end,
        b.payout_date,
        b.status AS batch_status,
        b.approval_result AS batch_approval_result,
        b.manager_code
      FROM settlement_batch_items i
      INNER JOIN settlement_batches b
        ON b.id = i.batch_id
      WHERE b.year = ?
      ORDER BY b.month ASC, i.settlement_amount DESC, i.class_title ASC
    `).bind(year).all();

    const classMap = new Map();
    const instructorMap = new Map();
    for (const row of results || []) {
      const classKey = row.class_id || row.id;
      if (!classMap.has(classKey)) {
        classMap.set(classKey, {
          id: row.id,
          batch_id: row.batch_id,
          batch_item_id: row.id,
          class_id: row.class_id,
          class_name: row.class_title || '-',
          class_title: row.class_title || '-',
          instructor_id: row.instructor_id || null,
          instructor_name: row.instructor_name || '-',
          instructor_email: row.instructor_email || '',
          instructor_phone: row.instructor_phone || '',
          profile_image_url: row.profile_image_url || '',
          bank_name: row.bank_name || '',
          bank_account: row.bank_account || '',
          bank_holder: row.bank_holder || '',
          total_revenue: 0,
          total_fee: 0,
          refund_amount: 0,
          card_fee_amount: 0,
          tax_fee_amount: 0,
          platform_fee_amount: 0,
          net_revenue: 0,
          final_amount: 0,
          settlement_amount: 0,
          settlement_count: 0,
          class_count: 0,
          status: row.batch_status || row.status || 'pending',
          approval_result: row.batch_approval_result || row.approval_result || 'pending',
          admin_code: row.manager_code || row.batch_id || row.id || '-',
          payout_date: row.payout_date || null,
        });
      }

      const classItem = classMap.get(classKey);
      classItem.total_revenue += Number(row.gross_revenue || 0);
      classItem.total_fee += sumFeeAmounts(row);
      classItem.refund_amount += Number(row.refund_amount || 0);
      classItem.card_fee_amount += Number(row.card_fee_amount || 0);
      classItem.tax_fee_amount += Number(row.tax_fee_amount || 0);
      classItem.platform_fee_amount += Number(row.platform_fee_amount || 0);
      classItem.net_revenue += Number(row.net_revenue || Math.max(0, Number(row.gross_revenue || 0) - Number(row.refund_amount || 0)));
      classItem.final_amount += Number(row.settlement_amount || 0);
      classItem.settlement_amount += Number(row.settlement_amount || 0);
      classItem.settlement_count += Number(row.order_count || 0);
      classItem.class_count += Number(row.order_count || 0);

      const instructorKey = row.instructor_id || `unknown_${row.instructor_name || row.class_id || row.id}`;
      if (!instructorMap.has(instructorKey)) {
        instructorMap.set(instructorKey, {
          id: row.batch_id,
          batch_id: row.batch_id,
          instructor_id: row.instructor_id || null,
          instructor_name: row.instructor_name || '-',
          instructor_email: row.instructor_email || '',
          instructor_phone: row.instructor_phone || '',
          profile_image_url: row.profile_image_url || '',
          bank_name: row.bank_name || '',
          bank_account: row.bank_account || '',
          bank_holder: row.bank_holder || '',
          class_count: 0,
          settlement_count: 0,
          total_revenue: 0,
          total_fee: 0,
          refund_amount: 0,
          card_fee_amount: 0,
          tax_fee_amount: 0,
          platform_fee_amount: 0,
          net_revenue: 0,
          final_amount: 0,
          settlement_amount: 0,
          status: row.batch_status || row.status || 'pending',
          approval_result: row.batch_approval_result || row.approval_result || 'pending',
          admin_code: row.manager_code || row.batch_id || row.id || '-',
          payout_date: row.payout_date || null,
        });
      }

      const instructorItem = instructorMap.get(instructorKey);
      instructorItem.class_count += 1;
      instructorItem.settlement_count += 1;
      instructorItem.total_revenue += Number(row.gross_revenue || 0);
      instructorItem.total_fee += sumFeeAmounts(row);
      instructorItem.refund_amount += Number(row.refund_amount || 0);
      instructorItem.card_fee_amount += Number(row.card_fee_amount || 0);
      instructorItem.tax_fee_amount += Number(row.tax_fee_amount || 0);
      instructorItem.platform_fee_amount += Number(row.platform_fee_amount || 0);
      instructorItem.net_revenue += Number(row.net_revenue || Math.max(0, Number(row.gross_revenue || 0) - Number(row.refund_amount || 0)));
      instructorItem.final_amount += Number(row.settlement_amount || 0);
      instructorItem.settlement_amount += Number(row.settlement_amount || 0);
    }

    const classes = Array.from(classMap.values());
    const instructors = Array.from(instructorMap.values());
    classes.sort((a, b) => Number(b.final_amount || 0) - Number(a.final_amount || 0));
    instructors.sort((a, b) => Number(b.final_amount || 0) - Number(a.final_amount || 0));
    const summary = classes.reduce((acc, row) => {
      acc.class_count += 1;
      acc.order_count += Number(row.settlement_count || 0);
      acc.gross_revenue += Number(row.total_revenue || 0);
      acc.refund_amount += Number(row.refund_amount || 0);
      acc.net_revenue += Number(row.net_revenue || Math.max(0, Number(row.total_revenue || 0) - Number(row.refund_amount || 0)));
      acc.card_fee_amount += Number(row.card_fee_amount || 0);
      acc.tax_fee_amount += Number(row.tax_fee_amount || 0);
      acc.platform_fee_amount += Number(row.platform_fee_amount || 0);
      acc.settlement_amount += Number(row.final_amount || 0);
      return acc;
    }, {
      class_count: 0,
      instructor_count: instructors.length,
      order_count: 0,
      gross_revenue: 0,
      refund_amount: 0,
      net_revenue: 0,
      card_fee_amount: 0,
      tax_fee_amount: 0,
      platform_fee_amount: 0,
      settlement_amount: 0,
    });

    const dashboard = {
      period: normalizedPeriod,
      year,
      month,
      period_label: `${String(year).padStart(4, '0')}년 정산`,
      fee_rates: {
        pg_rate: settings.card_fee_rate,
        tax_rate: settings.tax_rate,
        platform_rate: settings.platform_fee_rate,
        payout_day: settings.payout_day,
      },
      summary,
      classes,
      instructors,
    };
    return await finalizeSettlementDashboard(db, dashboard, query);
  }

  const existingBatch = await db.prepare('SELECT * FROM settlement_batches WHERE year = ? AND month = ?').bind(year, month).first().catch(() => null);
  if (existingBatch) {
    const detail = await loadBatchDetail(db, existingBatch.id);
    if (detail) {
      const classes = (detail.class_items || []).map((item) => mapDashboardClassRow(item, detail.batch));
      const instructors = (detail.instructor_items || []).map((item) => mapDashboardInstructorRow(item, Number(item.class_count || 0), detail.batch));
      const dashboard = {
        period: normalizedPeriod,
        year,
        month,
        period_label: `${year}년 ${month}월`,
        fee_rates: {
          pg_rate: settings.card_fee_rate,
          tax_rate: settings.tax_rate,
          platform_rate: settings.platform_fee_rate,
          payout_day: settings.payout_day,
        },
        summary: {
          class_count: classes.length,
          instructor_count: instructors.length,
          order_count: classes.reduce((sum, item) => sum + Number(item.settlement_count || 0), 0),
          gross_revenue: classes.reduce((sum, item) => sum + Number(item.total_revenue || 0), 0),
          refund_amount: classes.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0),
          net_revenue: classes.reduce((sum, item) => sum + Number(item.net_revenue || Math.max(0, Number(item.total_revenue || 0) - Number(item.refund_amount || 0))), 0),
          card_fee_amount: classes.reduce((sum, item) => sum + Number(item.card_fee_amount || 0), 0),
          tax_fee_amount: classes.reduce((sum, item) => sum + Number(item.tax_fee_amount || 0), 0),
          platform_fee_amount: classes.reduce((sum, item) => sum + Number(item.platform_fee_amount || 0), 0),
          settlement_amount: classes.reduce((sum, item) => sum + Number(item.final_amount || 0), 0),
        },
        classes,
        instructors,
      };
      return await finalizeSettlementDashboard(db, dashboard, query);
    }
  }

  const preview = await computeBatchPreview(db, year, month);
  const classes = (preview.class_items || []).map((item) => mapDashboardClassRow(item, { id: `preview_${year}${String(month).padStart(2, '0')}` }));
  const instructors = (preview.instructor_items || []).map((item) => ({
    id: `preview_${year}${String(month).padStart(2, '0')}_${item.instructor_id || item.instructor_name}`,
    batch_id: `preview_${year}${String(month).padStart(2, '0')}`,
    instructor_id: item.instructor_id || null,
    instructor_name: item.instructor_name || '-',
    instructor_email: item.instructor_email || '',
    instructor_phone: item.instructor_phone || '',
    profile_image_url: item.profile_image_url || '',
    bank_name: item.bank_name || '',
    bank_account: item.bank_account || '',
    bank_holder: item.bank_holder || '',
    class_count: Number(item.class_count || 0),
    settlement_count: Number(item.class_count || 0),
    total_revenue: Number(item.gross_revenue || 0),
    total_fee: Number(item.card_fee_amount || 0) + Number(item.tax_fee_amount || 0) + Number(item.platform_fee_amount || 0),
    final_amount: Number(item.settlement_amount || 0),
    settlement_amount: Number(item.settlement_amount || 0),
    status: item.status || 'pending',
    approval_result: item.approval_result || 'pending',
    admin_code: item.manager_code || `preview_${year}${String(month).padStart(2, '0')}`,
    payout_date: preview.period?.payout_date || null,
  }));

  const dashboard = {
    period: normalizedPeriod,
    year,
    month,
    period_label: preview.period?.payout_date ? `${year}년 ${month}월 / 지급일 ${preview.period.payout_date}` : `${year}년 ${month}월`,
    fee_rates: {
      pg_rate: settings.card_fee_rate,
      tax_rate: settings.tax_rate,
      platform_rate: settings.platform_fee_rate,
      payout_day: settings.payout_day,
    },
    summary: preview.summary,
    classes,
    instructors,
  };
  return await finalizeSettlementDashboard(db, dashboard, query);
}

async function loadHistoryRows(db, period, year, month) {
  const normalizedPeriod = String(period || 'month').toLowerCase() === 'year' ? 'year' : 'month';
  const batches = await loadBatchList(db, normalizedPeriod === 'year' ? { year } : { year, month });
  const rows = [];

  for (const batch of batches) {
    const detail = await loadBatchDetail(db, batch.id);
    if (!detail) continue;
    for (const item of detail.instructor_items || []) {
      const classCount = Number(item.class_count ?? 0);
      rows.push({
        id: batch.id,
        batch_id: batch.id,
        year: batch.year,
        month: batch.month,
        instructor_id: item.instructor_id || null,
        instructor_name: item.instructor_name || '-',
        instructor_email: item.instructor_email || '',
        instructor_phone: item.instructor_phone || '',
        profile_image_url: item.profile_image_url || '',
        bank_name: item.bank_name || '',
        bank_account: item.bank_account || '',
        bank_holder: item.bank_holder || '',
        amount: Number(item.net_revenue || 0),
        status: batch.status || item.status || 'pending',
        settlement_count: classCount,
        gross_revenue: Number(item.gross_revenue || 0),
        refund_amount: Number(item.refund_amount || 0),
        card_fee_amount: Number(item.card_fee_amount || 0),
        tax_fee_amount: Number(item.tax_fee_amount || 0),
        platform_fee_amount: Number(item.platform_fee_amount || 0),
        net_revenue: Number(item.net_revenue || 0),
        total_amount: Number(item.gross_revenue || 0),
        total_fee: Number(item.card_fee_amount || 0) + Number(item.tax_fee_amount || 0) + Number(item.platform_fee_amount || 0),
        final_amount: Number(item.settlement_amount || 0),
        approval_result: batch.approval_result || item.approval_result || 'pending',
        admin_code: batch.manager_code || batch.id,
        period_start: batch.period_start,
        period_end: batch.period_end,
        payout_date: batch.payout_date,
        class_count: classCount,
      });
    }
  }

  rows.sort((a, b) => {
    if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
    if ((b.month || 0) !== (a.month || 0)) return (b.month || 0) - (a.month || 0);
    return Number(b.final_amount || 0) - Number(a.final_amount || 0);
  });

  return rows;
}

async function buildSettlementExportResponse(db, batchId, { instructorId = '', batchItemId = '' } = {}) {
  const detail = await loadBatchDetail(db, batchId);
  if (!detail?.batch) {
    throw new Error('Settlement batch not found.');
  }

  const batch = detail.batch;
  const allItems = detail.class_items || [];
  let selectedItems = allItems;
  if (batchItemId) {
    selectedItems = allItems.filter((item) => String(item.id || '') === String(batchItemId));
  } else if (instructorId) {
    selectedItems = allItems.filter((item) => String(item.instructor_id || '') === String(instructorId));
  }
  if (!selectedItems.length) selectedItems = allItems;

  const itemIds = selectedItems.map((item) => item.id).filter(Boolean);
  const classIds = Array.from(new Set(selectedItems.map((item) => item.class_id).filter(Boolean)));
  let classCategoryMap = new Map();
  if (classIds.length) {
    const placeholders = classIds.map(() => '?').join(', ');
    const { results: classRows } = await db.prepare(`
      SELECT id, category
      FROM classes
      WHERE id IN (${placeholders})
    `).bind(...classIds).all().catch(() => ({ results: [] }));
    classCategoryMap = new Map((classRows || []).map((row) => [String(row.id), row.category || '-']));
  }

  let orderSql = `
    SELECT *
    FROM orders
    WHERE settlement_batch_id = ?
  `;
  const orderParams = [batchId];
  if (itemIds.length) {
    orderSql += ` AND settlement_item_id IN (${itemIds.map(() => '?').join(', ')})`;
    orderParams.push(...itemIds);
  }
  orderSql += ' ORDER BY datetime(COALESCE(paid_at, created_at)) ASC';
  const { results: orderRows } = await db.prepare(orderSql).bind(...orderParams).all().catch(() => ({ results: [] }));

  let selectedInstructor = null;
  if (instructorId) {
    selectedInstructor = detail.instructor_items?.find((item) => String(item.instructor_id || '') === String(instructorId)) || null;
  } else if (batchItemId && selectedItems[0]?.instructor_id) {
    selectedInstructor = detail.instructor_items?.find((item) => String(item.instructor_id || '') === String(selectedItems[0].instructor_id)) || null;
  } else {
    selectedInstructor = detail.instructor_items?.[0] || null;
  }
  const sourceInstructor = selectedInstructor || selectedItems[0] || {};
  const grossAmount = selectedItems.reduce((sum, item) => sum + Number(item.gross_revenue || 0), 0);
  const refundAmount = selectedItems.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0);
  const cardFeeAmount = selectedItems.reduce((sum, item) => sum + Number(item.card_fee_amount || 0), 0);
  const taxFeeAmount = selectedItems.reduce((sum, item) => sum + Number(item.tax_fee_amount || 0), 0);
  const platformFeeAmount = selectedItems.reduce((sum, item) => sum + Number(item.platform_fee_amount || 0), 0);
  const settlementAmount = selectedItems.reduce((sum, item) => sum + Number(item.settlement_amount || 0), 0);

  const workbookBatch = {
    period_year: batch.year,
    period_month: batch.month,
    period_key: formatMonth(batch.year, batch.month),
    settlement_day: batch.payout_date || `${formatMonth(batch.year, batch.month)}-15`,
    instructor_id: sourceInstructor.instructor_id || selectedItems[0]?.instructor_id || null,
    instructor_name: sourceInstructor.instructor_name || selectedItems[0]?.instructor_name || '-',
    instructor_email: sourceInstructor.instructor_email || selectedItems[0]?.instructor_email || '',
    instructor_phone: sourceInstructor.instructor_phone || selectedItems[0]?.instructor_phone || '',
    profile_image_url: sourceInstructor.profile_image_url || selectedItems[0]?.profile_image_url || '',
    instructor_role: '강사',
    instructor_registered_at: batch.created_at || '',
    gross_amount: grossAmount,
    refund_amount: refundAmount,
    payment_fee_amount: cardFeeAmount,
    tax_amount: taxFeeAmount,
    platform_fee_amount: platformFeeAmount,
    deducted_total_amount: cardFeeAmount + taxFeeAmount + platformFeeAmount,
    final_amount: settlementAmount,
    class_title: selectedItems.map((item) => item.class_title).filter(Boolean).join(', '),
  };

  const workbookItems = selectedItems.map((item) => ({
    class_title: item.class_title || '-',
    class_category: classCategoryMap.get(String(item.class_id || '')) || item.class_category || '-',
    order_count: Number(item.order_count || 0),
    gross_amount: Number(item.gross_revenue || 0),
    refund_amount: Number(item.refund_amount || 0),
    payment_fee_amount: Number(item.card_fee_amount || 0),
    tax_amount: Number(item.tax_fee_amount || 0),
    platform_fee_amount: Number(item.platform_fee_amount || 0),
    final_amount: Number(item.settlement_amount || 0),
  }));

  const workbookOrders = (orderRows || []).map((order) => ({
    order_id: order.order_id || '',
    class_title: order.class_title || '',
    user_name: order.user_name || '',
    paid_at: order.paid_at || order.created_at || '',
    refunded_at: order.refunded_at || '',
    pay_method: order.pay_method || '',
    status: order.status || '',
    pay_option: order.pay_option || '',
    final_amount: Number(order.final_amount || order.amount || 0),
    refund_amount: Number(order.refund_amount || 0),
    payment_fee_amount: Number(order.card_fee_amount || 0),
    tax_amount: Number(order.tax_fee_amount || 0),
    platform_fee_amount: Number(order.platform_fee_amount || 0),
    settlement_amount: Number(order.instructor_settlement_amount || 0),
  }));

  const info = {
    instructor_name: workbookBatch.instructor_name,
    instructor_registered_at: batch.created_at || '',
    instructor_role: '강사',
  };

  const wb = buildSettlementWorkbook({
    info,
    batch: workbookBatch,
    items: workbookItems,
    orders: workbookOrders,
  });

  const xlsx = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const fileName = `settlement_${String(batch.year).padStart(4, '0')}${String(batch.month).padStart(2, '0')}_${String(workbookBatch.instructor_name || 'detail').replace(/[^a-zA-Z0-9가-힣_-]+/g, '_')}.xlsx`;
  const fallbackName = `settlement_${String(batch.year).padStart(4, '0')}${String(batch.month).padStart(2, '0')}.xlsx`;

  return new Response(xlsx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  });
}

async function saveSettlementInfo(db, body) {
  await db.prepare(`
    INSERT OR REPLACE INTO settlement_info (
      id, company_name, ceo_name, biz_num, address, biz_type,
      manager_email, bank_name, bank_account, bank_holder,
      support_phone, tax_email, updated_at
    ) VALUES (
      'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
    )
  `).bind(
    normalizeText(body.company_name),
    normalizeText(body.ceo_name),
    normalizeText(body.biz_num),
    normalizeText(body.address),
    normalizeText(body.biz_type),
    normalizeText(body.manager_email),
    normalizeText(body.bank_name),
    normalizeText(body.bank_account),
    normalizeText(body.bank_holder),
    normalizeText(body.support_phone),
    normalizeText(body.tax_email),
  ).run();
}

async function saveFeeSettings(db, body) {
  await db.prepare(`
    INSERT OR REPLACE INTO settlement_fee_settings (
      id, card_fee_rate, tax_rate, platform_fee_rate, payout_day, updated_by, updated_at
    ) VALUES ('global', ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    normalizeFloat(body.card_fee_rate, 6),
    normalizeFloat(body.tax_rate, 3.3),
    normalizeFloat(body.platform_fee_rate, 1.7),
    normalizeInt(body.payout_day, 15),
    normalizeText(body.updated_by) || null,
  ).run();
}

async function markBatchStatus(db, batchId, action, actor, approvalResult = '') {
  const batch = await db.prepare('SELECT * FROM settlement_batches WHERE id = ?').bind(batchId).first();
  if (!batch) {
    throw new Error('Settlement batch not found.');
  }

  if (action === 'approve') {
    const managerCode = batch.manager_code || generateManagerCode(batch.year, batch.month);
    await db.prepare(`
      UPDATE settlement_batches
      SET status = ?, approval_result = ?, approved_by = ?, approved_at = datetime('now'),
          manager_code = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      approvalResult === 'failed' ? 'failed' : 'approved',
      approvalResult || 'approved',
      actor || 'admin',
      managerCode,
      batchId,
    ).run();

    await db.prepare(`
      UPDATE settlement_batch_items
      SET status = ?, approval_result = ?, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
      WHERE batch_id = ?
    `).bind(
      approvalResult === 'failed' ? 'failed' : 'approved',
      approvalResult || 'approved',
      actor || 'admin',
      batchId,
    ).run();

    await db.prepare(`
      UPDATE orders
      SET settlement_status = ?
      WHERE settlement_batch_id = ?
    `).bind(
      approvalResult === 'failed' ? 'failed' : 'approved',
      batchId,
    ).run();

    return;
  }

  if (action === 'complete') {
    await db.prepare(`
      UPDATE settlement_batches
      SET status = 'completed', completed_by = ?, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(actor || 'admin', batchId).run();

    await db.prepare(`
      UPDATE settlement_batch_items
      SET status = 'completed', completed_by = ?, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE batch_id = ?
    `).bind(actor || 'admin', batchId).run();

    const { results: items } = await db.prepare(`
      SELECT *
      FROM settlement_batch_items
      WHERE batch_id = ?
    `).bind(batchId).all();

    for (const item of items || []) {
      const existingRecord = await db.prepare(`
        SELECT id
        FROM financial_records
        WHERE related_settlement_id = ?
          AND type = 'settlement'
        LIMIT 1
      `).bind(item.id).first().catch(() => null);

      if (!existingRecord) {
        await db.prepare(`
          INSERT INTO financial_records (
            id, type, amount, description, related_settlement_id,
            related_user_id, metadata, created_at
          ) VALUES (?, 'settlement', ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `FR_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          Number(item.settlement_amount || 0),
          `Settlement for ${item.class_title || item.class_id || item.id}`,
          item.id,
          item.instructor_id || null,
          JSON.stringify({
            batch_id: batchId,
            class_id: item.class_id,
            class_title: item.class_title,
          }),
        ).run();
      }
    }

    await db.prepare(`
      UPDATE orders
      SET settlement_status = 'completed'
      WHERE settlement_batch_id = ?
    `).bind(batchId).run();
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  const url = new URL(request.url);

  if (method === 'OPTIONS') return options(request, env);
  await ensureOperationsSchema(db);

  try {
    if (method === 'GET') {
      const type = normalizeText(url.searchParams.get('type'));
      const batchId = normalizeText(url.searchParams.get('batch_id') || url.searchParams.get('id'));
      const year = normalizeInt(url.searchParams.get('year'));
      const month = normalizeInt(url.searchParams.get('month'));
      const preview = normalizeText(url.searchParams.get('preview'));
      const period = normalizeText(url.searchParams.get('period') || 'month');
      const query = normalizeText(url.searchParams.get('q'));
      const now = new Date();
      const resolvedYear = year || now.getFullYear();
      const resolvedMonth = month || (now.getMonth() + 1);

      if (type === 'info') {
        const info = await db.prepare("SELECT * FROM settlement_info WHERE id = 'global'").first().catch(() => ({}));
        const feeSettings = await loadFeeSettings(db);
        return json(request, env, {
          success: true,
          data: {
            ...(info || {}),
            fee_settings: feeSettings,
            fee_rates: {
              pg_rate: feeSettings.card_fee_rate,
              tax_rate: feeSettings.tax_rate,
              platform_rate: feeSettings.platform_fee_rate,
              payout_day: feeSettings.payout_day,
            },
          },
        });
      }

      if (type === 'dashboard') {
        const dashboard = await loadDashboardData(db, period, resolvedYear, resolvedMonth, { query });
        return json(request, env, { success: true, data: dashboard });
      }

      if (type === 'search') {
        const searchData = await loadSettlementSearchData(db, query);
        return json(request, env, { success: true, data: searchData || { classes: [], instructors: [], summary: summarizeSettlementRows([], []), period_label: `검색 결과: ${query || '-'}`, period: 'search' } });
      }

      if (type === 'history') {
        const history = await loadHistoryRows(db, period, resolvedYear, resolvedMonth);
        return json(request, env, { success: true, data: history });
      }

      if (type === 'export') {
        const exportBatchId = batchId;
        if (!exportBatchId) {
          return json(request, env, { success: false, error: 'batch_id is required.' }, { status: 400 });
        }
        return await buildSettlementExportResponse(db, exportBatchId, {
          instructorId: normalizeText(url.searchParams.get('instructor_id')),
          batchItemId: normalizeText(url.searchParams.get('batch_item_id')),
        });
      }

      if (batchId) {
        const detail = await loadBatchDetail(db, batchId);
        if (!detail) {
          return json(request, env, { success: false, error: 'Settlement batch not found.' }, { status: 404 });
        }
        return json(request, env, { success: true, data: detail });
      }

      if (year && month && preview === '1') {
        const batchPreview = await computeBatchPreview(db, year, month);
        return json(request, env, { success: true, data: { preview: true, ...batchPreview } });
      }

      if (year && month) {
        const batch = await db.prepare('SELECT * FROM settlement_batches WHERE year = ? AND month = ?').bind(year, month).first().catch(() => null);
        if (batch) {
          const detail = await loadBatchDetail(db, batch.id);
          return json(request, env, { success: true, data: detail });
        }
        const batchPreview = await computeBatchPreview(db, year, month);
        return json(request, env, { success: true, data: { preview: true, ...batchPreview } });
      }

      const batches = await loadBatchList(db, {
        year: year || null,
        month: month || null,
      });
      return json(request, env, { success: true, data: batches });
    }

    if (method === 'POST') {
      const body = await request.json();

      if (body?.type === 'info') {
        await saveSettlementInfo(db, body);
        if (body.fee_rates) {
          await saveFeeSettings(db, {
            card_fee_rate: body.fee_rates.pg_rate,
            tax_rate: body.fee_rates.tax_rate,
            platform_fee_rate: body.fee_rates.platform_rate,
            payout_day: body.fee_rates.payout_day,
            updated_by: body.updated_by || body.manager_email || null,
          });
        }
        return json(request, env, { success: true });
      }

      if (body?.action === 'save_rates') {
        await saveFeeSettings(db, body);
        return json(request, env, { success: true, data: await loadFeeSettings(db) });
      }

      if (body?.action === 'generate_batch') {
        const year = normalizeInt(body.year);
        const month = normalizeInt(body.month);
        if (!year || !month) {
          return json(request, env, { success: false, error: 'year and month are required.' }, { status: 400 });
        }
        const preview = await computeBatchPreview(db, year, month);
        const batchId = await saveBatch(db, preview);
        return json(request, env, { success: true, id: batchId, data: await loadBatchDetail(db, batchId) });
      }

      return json(request, env, { success: false, error: 'Unsupported action.' }, { status: 400 });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const batchId = normalizeText(body.id || body.batch_id);
      if (!batchId) {
        return json(request, env, { success: false, error: 'batch id is required.' }, { status: 400 });
      }

      const action = normalizeText(body.action || 'approve');
      if (!['approve', 'complete'].includes(action)) {
        return json(request, env, { success: false, error: 'Unsupported action.' }, { status: 400 });
      }

      await markBatchStatus(
        db,
        batchId,
        action,
        normalizeText(body.actor || body.approved_by || body.completed_by),
        normalizeText(body.approval_result),
      );

      return json(request, env, { success: true, data: await loadBatchDetail(db, batchId) });
    }
  } catch (error) {
    return json(request, env, { success: false, error: error.message }, { status: 500 });
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}
