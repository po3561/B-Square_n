import { requireClassManager } from '../_lib/auth.js';
import { json, options } from '../_lib/http.js';
import { ensureClassesSchema } from '../_lib/schema.js';

export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { class_id, updates } = body || {};

    if (!class_id || !updates) {
      return json(request, env, {
        success: false,
        error: 'class_id and updates are required.',
      }, { status: 400 });
    }

    await ensureClassesSchema(env.DB);

    const auth = await requireClassManager(context, class_id);
    if (!auth.ok) return auth.response;

    const updateKeys = [];
    const updateValues = [];

    const allowedFields = [
      'title',
      'category',
      'class_type',
      'operating_mode',
      'summary',
      'description',
      'description_text',
      'price',
      'discount_rate',
      'image_url',
      'is_free',
      'coupon_pack',
      'coupon_detail',
      'capacity_min',
      'capacity_max',
      'tickets_price_one_time',
      'tickets_pass_count',
      'tickets_price_multi',
      'tickets_price_monthly',
      'payment_card',
      'payment_bank_transfer',
      'payment_bank_name',
      'payment_bank_account',
      'payment_bank_holder',
      'instructor_phone',
      'instructor_name',
      'instructor_email',
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateKeys.push(`${field} = ?`);
        updateValues.push(updates[field]);
      }
    }

    const jsonFields = ['keywords', 'target_audience', 'objectives', 'curriculum', 'image_urls', 'sub_instructors'];
    for (const field of jsonFields) {
      if (updates[field] !== undefined) {
        updateKeys.push(`${field} = ?`);
        const val = updates[field];
        updateValues.push(Array.isArray(val) ? JSON.stringify(val) : JSON.stringify(val ?? []));
      }
    }

    if (updateKeys.length === 0) {
      return json(request, env, {
        success: false,
        error: 'No update fields were provided.',
      }, { status: 400 });
    }

    updateKeys.push("updated_at = datetime('now')");
    updateValues.push(class_id);

    const sql = `UPDATE classes SET ${updateKeys.join(', ')} WHERE id = ?`;

    try {
      await env.DB.prepare(sql).bind(...updateValues).run();
    } catch (updateErr) {
      if (/no such column: updated_at|no column named updated_at/i.test(updateErr.message)) {
        const fallbackSql = `UPDATE classes SET ${updateKeys.filter((item) => item !== "updated_at = datetime('now')").join(', ')} WHERE id = ?`;
        await env.DB.prepare(fallbackSql).bind(...updateValues).run();
      } else {
        throw updateErr;
      }
    }

    return json(request, env, {
      success: true,
      message: 'Class updated successfully.',
    });
  } catch (err) {
    console.error('Update class error:', err);
    return json(request, env, {
      success: false,
      error: 'Class update failed.',
      detail: err.message,
    }, { status: 500 });
  }
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
