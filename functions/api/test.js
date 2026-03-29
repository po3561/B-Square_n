export async function onRequest(context) {
    // 1. 우리가 설정 파일(wrangler.toml)에서 연결해둔 D1 데이터베이스(DB) 부르기
    const db = context.env.DB;

    try {
        // 2. classes(클래스) 테이블에서 데이터 가져오기 
        // (일단 테스트니까 에러 없이 잘 연결됐는지 확인하기 위해 다 가져와볼게!)
        const { results } = await db.prepare("SELECT * FROM classes").all();

        // 3. 가져온 데이터를 화면 쪽에 JSON 형태로 예쁘게 포장해서 전달하기
        return Response.json({ success: true, data: results });

    } catch (error) {
        // 혹시 에러가 나면 화면에 이유를 알려주기
        return Response.json({ success: false, error: error.message });
    }
}
