/**
 * Supabase 커뮤니티 게시글 + 댓글 자동 생성 퍼블리셔
 * 카드뉴스 데이터(뉴스 주제)를 참고하여 50대 커뮤니티 스타일의
 * 게시글 1개 + 맥락 댓글 3~4개를 AI로 생성하여 INSERT
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqiegpudfdfbuuqpimeg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 시드 유저 ID + 닉네임 (댓글 작성자용)
const BOT_USERS = [
  { id: '2b8fad73-d5ae-49ad-b1fd-48e514700aa6', nick: '바람따라구름따라' },
  { id: '312d1da0-9efc-46b0-8e5d-2f99009c1d5e', nick: '햇살좋은날' },
  { id: 'c9df5b2d-15ae-4e02-bebc-b86a3730a3dd', nick: '산넘어바다' },
  { id: '345c36c0-d352-46df-a8d6-366b343d6b48', nick: '꽃피는봄날' },
  { id: '6866ad49-e0b1-4a91-9ee4-914f3877b8da', nick: '늘푸른소나무' },
  { id: '8588b2d6-f6f3-45d7-b618-0df9ad9a0441', nick: '달빛산책' },
  { id: 'a058bfe3-8528-41aa-9fb7-f134bf69b8eb', nick: '새벽이슬' },
  { id: '096d0133-1466-4d92-967b-857003fc896c', nick: '정원지기' },
  { id: '3fd0b71c-85a5-4c91-98bc-c19d293f12d5', nick: '은빛물결' },
  { id: 'f32c0d1d-2912-45d3-a621-45a4fe211d12', nick: '따뜻한차한잔' },
  { id: '0bc43005-e845-4727-9e9c-a07f493f4ff2', nick: '하늘보기' },
  { id: 'f1ecdd0f-d3c9-486a-baab-ad2378651a4f', nick: '소소한행복' },
];

const CATEGORY_MAP = {
  '주식': 6, '재테크': 6, '건강': 3, '최신뉴스': 1,
  '뉴스': 1, '사회': 1, '정치': 1, '은퇴': 2, '일상': 4,
};

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickRandomN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function mapCategory(theme) {
  if (!theme) return 7;
  for (const [k, v] of Object.entries(CATEGORY_MAP)) { if (theme.includes(k)) return v; }
  return 7;
}

const COMMUNITY_PROMPT = `당신은 50~60대 한국인 커뮤니티 회원입니다. 아래 뉴스 주제를 참고하여, 실제 50대가 커뮤니티에 올릴법한 게시글 1개와 그에 대한 댓글 4개를 작성하세요.

핵심 규칙:
- 게시글은 뉴스 기사를 그대로 옮기지 말고, 해당 주제에 대한 **개인적 의견이나 경험**으로 작성
- 실제 50대가 카톡이나 네이버 카페에 쓰는 것처럼 자연스럽게. "저도 비슷한데요", "요즘 이거때문에 고민이에요" 같은 톤
- 딱딱한 문체 절대 금지: "제가 생각하기에는", "것으로 알고 있습니다", "경제 위험을 관리" 같은 AI스러운 표현 쓰지 마세요
- 댓글은 짧고 구어체로. 실제 댓글처럼 "ㅎㅎ", "ㅋㅋ", "~거든요", "~네요" 자연스럽게 사용
- 댓글은 각각 다른 관점에서, 게시글 내용에 직접 반응하는 내용으로 작성
- 반드시 한국어만 사용. 영어/일본어/중국어/베트남어/태국어/러시아어 등 모든 외국어 절대 금지. 한자 섞어쓰기 절대 금지. (ETF, IRP 같은 금융 약어만 예외)

반드시 아래 JSON 형식만 출력:
{
  "post": {
    "title": "게시글 제목 (15~35자, 궁금증이나 의견 형태)",
    "content": "게시글 본문 (100~200자, 개인 경험이나 의견)",
    "category": "주제 카테고리명"
  },
  "comments": [
    { "nickname": "닉네임1", "content": "댓글 내용 (30~80자)" },
    { "nickname": "닉네임2", "content": "댓글 내용" },
    { "nickname": "닉네임3", "content": "댓글 내용" },
    { "nickname": "닉네임4", "content": "댓글 내용" }
  ]
}`;

/**
 * Gemini로 커뮤니티 게시글 + 댓글 생성
 */
async function generateWithGemini(newsContext, commentNicknames) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const userPrompt = `뉴스 주제: ${newsContext}\n\n댓글 작성자 닉네임: ${commentNicknames.join(', ')}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: COMMUNITY_PROMPT + '\n\n' + userPrompt }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  });

  const text = result.response.text();
  return JSON.parse(text);
}

// Groq 제거 — Gemini만 사용

/**
 * 카드뉴스 데이터를 참고하여 커뮤니티 게시글 + 댓글 생성 후 Supabase에 등록
 */
async function publishToSupabase(cardData) {
  if (!SUPABASE_SERVICE_KEY) {
    console.log('  ⏭ Supabase: 자격증명 없음, 건너뜀');
    return null;
  }

  let createClient;
  try {
    createClient = require('@supabase/supabase-js').createClient;
  } catch {
    console.log('  ⏭ Supabase: @supabase/supabase-js 미설치, 건너뜀');
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 뉴스 컨텍스트 추출 (슬라이드 제목들)
  const newsContext = cardData.slides
    .map(s => s.title)
    .filter(Boolean)
    .join(', ');

  if (!newsContext) {
    console.log('  ⚠ Supabase: 뉴스 컨텍스트 없음');
    return null;
  }

  // 랜덤 유저 선택: 게시글 작성자 1명 + 댓글 작성자 4명
  const shuffled = pickRandomN(BOT_USERS, 5);
  const postAuthor = shuffled[0];
  const commentAuthors = shuffled.slice(1);

  // AI로 게시글 + 댓글 생성 (Gemini만 사용)
  let generated = null;
  try {
    generated = await generateWithGemini(newsContext, commentAuthors.map(u => u.nick));
  } catch (err) {
    console.error(`  ❌ Gemini 생성 실패: ${err.message}`);
    return null;
  }

  if (!generated?.post?.title || !generated?.post?.content) {
    console.error('  ❌ AI 응답 형식 오류');
    return null;
  }

  // 게시글 INSERT
  const categoryId = mapCategory(generated.post.category || cardData.coverCategory);
  const { data: postData, error: postError } = await supabase
    .from('posts')
    .insert({
      author_id: postAuthor.id,
      category_id: categoryId,
      title: generated.post.title,
      content: generated.post.content,
      view_count: randomInt(15, 60),
      like_count: randomInt(1, 5),
    })
    .select('id')
    .single();

  if (postError) {
    console.error(`  ❌ 게시글 등록 실패: ${postError.message}`);
    return null;
  }

  const postId = postData.id;

  // 댓글 INSERT (시간차를 두고)
  const comments = generated.comments || [];
  let commentCount = 0;

  for (let i = 0; i < comments.length && i < commentAuthors.length; i++) {
    const c = comments[i];
    // 닉네임으로 작성자 매칭 (못찾으면 순서대로)
    const author = commentAuthors.find(u => u.nick === c.nickname) || commentAuthors[i];

    // 시간차: 게시글 이후 8~120분
    const gapMinutes = randomInt(8 + i * 15, 30 + i * 40);
    const commentTime = new Date(Date.now() + gapMinutes * 60 * 1000 - randomInt(0, 3600000));

    const { error: cError } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: author.id,
        content: c.content,
        created_at: commentTime.toISOString(),
      });

    if (!cError) commentCount++;
  }

  // comment_count 동기화
  if (commentCount > 0) {
    await supabase
      .from('posts')
      .update({ comment_count: commentCount })
      .eq('id', postId);
  }

  console.log(`  ✅ Supabase 게시 완료: "${generated.post.title.slice(0, 30)}..." (댓글 ${commentCount}개)`);
  return { postId, commentCount };
}

module.exports = { publishToSupabase };
