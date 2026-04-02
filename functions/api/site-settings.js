import { json, options } from './_lib/http.js';

import { ensureSiteSettingsSchema } from './_lib/schema.js';

const RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
};

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;

  if (method === 'GET') {
    let phase = 'ensure';
    try {
      await ensureSiteSettingsSchema(db);
      phase = 'select';
      const settings = await db.prepare("SELECT * FROM site_settings WHERE id = 'global'").first();

      if (!settings) {
        return json(request, env, {
          success: true,
          data: {
            site_name: 'B-Square',
            site_url: '',
            company_name: '',
            ceo_name: '',
            address: '',
            biz_num: '',
            mail_order_num: '',
            cs_phone: '',
            cs_email: '',
            banners: [],
            bottom_banners: [],
            logo_url: '',
            logo_light_url: '',
            logo_dark_url: '',
            favicon_url: '',
            favicon_light_url: '',
            favicon_dark_url: '',
            footer_hours: '',
            footer_terms_url: '',
            footer_privacy_url: '',
            footer_instagram_url: '',
            footer_youtube_url: '',
            seo: {
              title: '',
              description: '',
              keywords: '',
              image: '',
            },
          },
        }, { headers: RESPONSE_HEADERS });
      }

      const banners = parseJsonArray(settings.banners);
      const bottomBanners = parseJsonArray(settings.bottom_banners);

      return json(request, env, {
        success: true,
        data: {
          site_name: settings.site_name,
          site_url: settings.site_url,
          logo_url: settings.logo_url,
          logo_light_url: settings.logo_light_url,
          logo_dark_url: settings.logo_dark_url,
          favicon_url: settings.favicon_url,
          favicon_light_url: settings.favicon_light_url,
          favicon_dark_url: settings.favicon_dark_url,
          company_name: settings.company_name,
          ceo_name: settings.ceo_name,
          address: settings.address,
          biz_num: settings.biz_num,
          mail_order_num: settings.mail_order_num,
          cs_phone: settings.cs_phone,
          cs_email: settings.cs_email,
          seo: {
            title: settings.seo_title,
            description: settings.seo_description,
            keywords: settings.seo_keywords,
            image: settings.seo_image,
          },
          banners,
          bottom_banners: bottomBanners,
          footer_hours: settings.footer_hours,
          footer_terms_url: settings.footer_terms_url,
          footer_privacy_url: settings.footer_privacy_url,
          footer_instagram_url: settings.footer_instagram_url,
          footer_youtube_url: settings.footer_youtube_url,
        },
      }, { headers: RESPONSE_HEADERS });
    } catch (error) {
      console.error(`[API /site-settings GET] ${phase} Error:`, error);
      return json(request, env, {
        success: false,
        error: error.message || 'Failed to load site settings',
        phase,
        detail: error.stack || '',
      }, { status: 500 });
    }
  }

  if (method === 'POST') {
    let phase = 'ensure';
    try {
      await ensureSiteSettingsSchema(db);
      phase = 'parse';
      const body = await request.json();
      const seo = body.seo || {};
      const bannersJson = JSON.stringify(body.banners || []);
      const bottomBannersJson = JSON.stringify(body.bottom_banners || []);

      const sql = `
        INSERT OR REPLACE INTO site_settings (
          id, site_name, site_url, logo_url, logo_light_url, logo_dark_url, favicon_url, favicon_light_url, favicon_dark_url,
          company_name, ceo_name, address, biz_num,
          mail_order_num, cs_phone, cs_email,
          seo_title, seo_description, seo_keywords, seo_image,
          banners, bottom_banners, footer_hours,
          footer_terms_url, footer_privacy_url, footer_instagram_url, footer_youtube_url,
          updated_at
        ) VALUES (
          'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
        )
      `;

      const bindValues = [
        body.site_name || '',
        body.site_url || '',
        body.logo_url || '',
        body.logo_light_url || '',
        body.logo_dark_url || '',
        body.favicon_url || '',
        body.favicon_light_url || '',
        body.favicon_dark_url || '',
        body.company_name || '',
        body.ceo_name || '',
        body.address || '',
        body.biz_num || '',
        body.mail_order_num || '',
        body.cs_phone || '',
        body.cs_email || '',
        seo.title || '',
        seo.description || '',
        seo.keywords || '',
        seo.image || '',
        bannersJson,
        bottomBannersJson,
        body.footer_hours || '',
        body.footer_terms_url || '',
        body.footer_privacy_url || '',
        body.footer_instagram_url || '',
        body.footer_youtube_url || '',
      ];

      try {
        await db.prepare(sql).bind(...bindValues).run();
      } catch (err) {
        const msg = String(err?.message || '');
        if (msg.includes('no column named updated_at')) {
          const fallbackSql = `
            INSERT OR REPLACE INTO site_settings (
              id, site_name, site_url, logo_url, logo_light_url, logo_dark_url, favicon_url, favicon_light_url, favicon_dark_url,
              company_name, ceo_name, address, biz_num,
              mail_order_num, cs_phone, cs_email,
              seo_title, seo_description, seo_keywords, seo_image,
              banners, bottom_banners, footer_hours,
              footer_terms_url, footer_privacy_url, footer_instagram_url, footer_youtube_url
            ) VALUES (
              'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `;
          await db.prepare(fallbackSql).bind(...bindValues).run();
        } else {
          throw err;
        }
      }

      return json(request, env, { success: true, message: 'Settings updated successfully' });
    } catch (error) {
      console.error(`[API /site-settings POST] ${phase} Error:`, error);
      return json(request, env, {
        success: false,
        error: error.message || 'Failed to save site settings',
        phase,
        detail: error.stack || '',
      }, { status: 500 });
    }
  }

  return json(request, env, { success: false, error: 'Method not allowed' }, { status: 405 });
}

export async function onRequestOptions(context) {
  return options(context.request, context.env);
}
