import * as XLSX from 'xlsx';

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toRate(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatMoney(value) {
  return `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`;
}

export function formatMonthKey(year, month) {
  const y = String(year || '').padStart(4, '0');
  const m = String(month || '').padStart(2, '0');
  return `${y}-${m}`;
}

export function calcSettlementBreakdown(amount, rates = {}) {
  const gross = Math.max(0, Math.round(toNumber(amount)));
  const cardRate = toRate(rates.card_fee_rate, 6);
  const taxRate = toRate(rates.tax_rate, 3.3);
  const platformRate = toRate(rates.platform_fee_rate, 1.7);

  const cardFee = Math.round(gross * (cardRate / 100));
  const taxFee = Math.round(gross * (taxRate / 100));
  const platformFee = Math.round(gross * (platformRate / 100));
  const totalFee = cardFee + taxFee + platformFee;
  const finalAmount = Math.max(gross - totalFee, 0);

  return {
    gross_amount: gross,
    card_fee_rate: cardRate,
    tax_rate: taxRate,
    platform_fee_rate: platformRate,
    card_fee_amount: cardFee,
    tax_amount: taxFee,
    platform_fee_amount: platformFee,
    deducted_total_amount: totalFee,
    final_amount: finalAmount,
  };
}

function autoWidth(values = []) {
  return values.map((value) => {
    const text = String(value ?? '');
    const width = Math.max(10, Math.min(42, text.length + 2));
    return { wch: width };
  });
}

function setCell(sheet, cell, value, style) {
  sheet[cell] = { v: value };
  if (style) sheet[cell].s = style;
}

export function buildSettlementWorkbook({ info = {}, batch = {}, items = [], orders = [] } = {}) {
  const wb = XLSX.utils.book_new();
  const ws = {};

  const batchDate = batch.period_key || formatMonthKey(batch.period_year, batch.period_month);
  const payoutDate = batch.settlement_day || `${batch.period_year || ''}-${String(batch.period_month || '').padStart(2, '0')}-15`;

  const title = '급여 명세서';
  const rows = [
    [title],
    [`기준년월 : ${String(batchDate || '').replace('-', '년')}${String(batchDate || '').slice(-2)}월`],
  ];
  XLSX.utils.sheet_add_aoa(ws, rows, { origin: 'A1' });

  setCell(ws, 'A1', title);
  setCell(ws, 'A2', `기준년월 : ${batchDate}`);
  setCell(ws, 'I2', `지급일 : ${payoutDate}`);
  setCell(ws, 'A4', '성명');
  setCell(ws, 'C4', batch.instructor_name || info.instructor_name || '');
  setCell(ws, 'F4', '강사 등록일');
  setCell(ws, 'G4', info.instructor_registered_at || batch.created_at || '');
  setCell(ws, 'I4', '강사 번호');
  setCell(ws, 'J4', batch.instructor_id || '');
  setCell(ws, 'A5', '클래스명');
  setCell(ws, 'C5', (items || []).map((item) => item.class_title).filter(Boolean).join(', ') || batch.class_title || '-');
  setCell(ws, 'F5', '강사 등급');
  setCell(ws, 'G5', batch.instructor_role || info.instructor_role || '강사');
  setCell(ws, 'I5', '세부 내역');
  setCell(ws, 'J5', `${items.length}개 클래스`);

  XLSX.utils.sheet_add_aoa(ws, [
    ['지급 내역', null, null, null, null, '공제 내역'],
    ['입금 항목', '회당 금액', '횟수', '지급 금액(원)', null, '공제 항목', '원', null, null, '공제 금액(원)'],
  ], { origin: 'A8' });

  const earningLabels = [
    ['매 월 지급', batch.gross_amount || 0, 1, batch.gross_amount || 0],
    ['지급액 계', batch.gross_amount || 0, 1, batch.gross_amount || 0],
  ];

  const deductionLabels = [
    ['카드 수수료', batch.payment_fee_amount || 0],
    ['부가세', batch.tax_amount || 0],
    ['플랫폼 수수료', batch.platform_fee_amount || 0],
    ['공제액 계', batch.deducted_total_amount || 0],
  ];

  let row = 10;
  earningLabels.forEach(([label, amount, count, total]) => {
    setCell(ws, `A${row}`, label);
    setCell(ws, `B${row}`, amount);
    setCell(ws, `C${row}`, count);
    setCell(ws, `D${row}`, total);
    row += 1;
  });

  row = 10;
  deductionLabels.forEach(([label, amount]) => {
    setCell(ws, `F${row}`, label);
    setCell(ws, `G${row}`, amount);
    setCell(ws, `J${row}`, amount);
    row += 1;
  });

  setCell(ws, 'A16', '계 산 방 법');
  setCell(ws, 'A17', '구 분');
  setCell(ws, 'B17', '산출식 또는 산출 방법');
  setCell(ws, 'J17', '지급액(원)');
  setCell(ws, 'A18', '지급금액');
  setCell(ws, 'B18', `총 결제금액 ${formatMoney(batch.gross_amount || 0)} - 공제 ${formatMoney(batch.deducted_total_amount || 0)}`);
  setCell(ws, 'J18', batch.final_amount || 0);
  setCell(ws, 'A19', '카드수수료');
  setCell(ws, 'B19', `${batch.payment_fee_amount || 0}원`);
  setCell(ws, 'J19', batch.payment_fee_amount || 0);
  setCell(ws, 'A20', '부가세');
  setCell(ws, 'B20', `${batch.tax_amount || 0}원`);
  setCell(ws, 'J20', batch.tax_amount || 0);
  setCell(ws, 'A21', '플랫폼 수수료');
  setCell(ws, 'B21', `${batch.platform_fee_amount || 0}원`);
  setCell(ws, 'J21', batch.platform_fee_amount || 0);
  setCell(ws, 'A22', '최종 정산금액');
  setCell(ws, 'B22', `${formatMoney(batch.final_amount || 0)} 지급`);
  setCell(ws, 'J22', batch.final_amount || 0);
  setCell(ws, 'A24', '비스퀘어');
  setCell(ws, 'B24', `카드 ${batch.payment_fee_amount || 0}원 / 세금 ${batch.tax_amount || 0}원 / 플랫폼 ${batch.platform_fee_amount || 0}원`);
  setCell(ws, 'J24', batch.final_amount || 0);

  const detailStart = 27;
  XLSX.utils.sheet_add_aoa(ws, [
    ['클래스명', '카테고리', '주문수', '총 결제금액', '환불금액', '카드수수료', '부가세', '플랫폼수수료', '최종 정산금액'],
  ], { origin: `A${detailStart}` });

  (items || []).forEach((item, index) => {
    const r = detailStart + 1 + index;
    setCell(ws, `A${r}`, item.class_title || '-');
    setCell(ws, `B${r}`, item.class_category || '-');
    setCell(ws, `C${r}`, item.order_count || 0);
    setCell(ws, `D${r}`, item.gross_amount || 0);
    setCell(ws, `E${r}`, item.refund_amount || 0);
    setCell(ws, `F${r}`, item.payment_fee_amount || 0);
    setCell(ws, `G${r}`, item.tax_amount || 0);
    setCell(ws, `H${r}`, item.platform_fee_amount || 0);
    setCell(ws, `I${r}`, item.final_amount || 0);
  });

  ws['!merges'] = [
    { s: { c: 0, r: 0 }, e: { c: 9, r: 1 } },
    { s: { c: 0, r: 2 }, e: { c: 2, r: 2 } },
    { s: { c: 3, r: 2 }, e: { c: 7, r: 2 } },
    { s: { c: 8, r: 2 }, e: { c: 9, r: 2 } },
    { s: { c: 0, r: 8 }, e: { c: 4, r: 8 } },
    { s: { c: 5, r: 8 }, e: { c: 9, r: 8 } },
  ];
  ws['!cols'] = autoWidth(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);

  XLSX.utils.book_append_sheet(wb, ws, '급여 명세서');

  const detailRows = (orders || []).map((order) => ([
    batch.settlement_date || batchDate,
    batch.batch_type || 'monthly',
    order.order_id || '',
    order.class_title || '',
    order.user_name || '',
    order.paid_at || order.created_at || '',
    order.refunded_at || '',
    order.pay_method || '',
    order.status || '',
    order.pay_option || '',
    toNumber(order.final_amount || order.amount || 0),
    toNumber(order.refund_amount || 0),
    Math.round(toNumber(order.final_amount || order.amount || 0) - (toNumber(order.refund_amount || 0) || 0)),
    Math.round(toNumber(order.tax_amount || order.tax_fee_amount || batch.tax_amount || 0)),
    Math.round(toNumber(order.platform_fee_amount || batch.platform_fee_amount || 0)),
    Math.round(toNumber(order.payment_fee_amount || order.card_fee_amount || batch.payment_fee_amount || batch.card_fee_amount || 0)),
    Math.max(0, toNumber(order.final_amount || order.amount || 0) - toNumber(order.refund_amount || 0) - toNumber(order.payment_fee_amount || order.card_fee_amount || batch.payment_fee_amount || batch.card_fee_amount || 0) - toNumber(order.tax_amount || order.tax_fee_amount || batch.tax_amount || 0) - toNumber(order.platform_fee_amount || batch.platform_fee_amount || 0)),
  ]));

  const detailSheet = XLSX.utils.aoa_to_sheet([
    ['정산일', '정산형태', '주문번호', '주문명', '구매자명', '결제일시', '취소일시', '결제형태', '결제상태', '결제방법', '결제금액', '취소금액', '공급가', '부가세', '판매수수료(부가세포함)', 'PG수수료(부가세포함)', '정산금액'],
    ...detailRows,
  ]);
  detailSheet['!cols'] = autoWidth(['정산일', '정산형태', '주문번호', '주문명', '구매자명', '결제일시', '취소일시', '결제형태', '결제상태', '결제방법', '결제금액', '취소금액', '공급가', '부가세', '판매수수료(부가세포함)', 'PG수수료(부가세포함)', '정산금액']);
  XLSX.utils.book_append_sheet(wb, detailSheet, '세부내역');

  return wb;
}

export function buildTaxWorkbook(rows = [], summary = {}) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['기간', summary.period || '-', '총 매출', summary.total_sales || 0, '환불', summary.total_refund || 0, '과세표준', summary.tax_base || 0],
    ['주문번호', '회원명', '클래스명', '결제금액', '환불금액', '부가세', '결제일시', '상태'],
    ...rows.map((row) => ([
      row.order_id || '',
      row.user_name || '',
      row.class_title || '',
      toNumber(row.final_amount || row.amount || 0),
      toNumber(row.refund_amount || 0),
      toNumber(row.tax_amount || 0),
      row.paid_at || row.created_at || '',
      row.status || '',
    ])),
  ]);
  ws['!cols'] = autoWidth(['주문번호', '회원명', '클래스명', '결제금액', '환불금액', '부가세', '결제일시', '상태']);
  XLSX.utils.book_append_sheet(wb, ws, '부가세 신고 자료');
  return wb;
}
