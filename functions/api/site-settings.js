// functions/api/site-settings.js — 사이트 설정 조회 API
// GET /api/site-settings

export async function onRequest(context) {
    const db = context.env.DB;

    try {
        const settings = await db
            .prepare("SELECT * FROM site_settings WHERE id = 'global'")
            .first();

        if (!settings) {
            return Response.json({
                success: true,
                data: {
                    site_name: 'B-Square',
                    banners: []
                }
            });
        }

        // banners는 JSON 문자열 → 배열로 파싱
        let banners = [];
        try {
            banners = JSON.parse(settings.banners || '[]');
        } catch {
            banners = [];
        }

        return Response.json({
            success: true,
            data: {
                site_name: settings.site_name,
                site_url: settings.site_url,
                logo_url: settings.logo_url,
                favicon_url: settings.favicon_url,
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
                    image: settings.seo_image
                },
                banners
            }
        });

    } catch (error) {
        console.error('[API /site-settings] Error:', error);
        return Response.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
