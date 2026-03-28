/**
 * 기존 게시글에 AI 맥락 댓글 + 조회수/좋아요 보강 스크립트
 * 댓글이 부족한 최근 게시글 5개를 찾아 AI로 맥락 댓글을 생성
 *
 * 실행: node src/enrich-posts.js (환경변수: SUPABASE_SERVICE_KEY, GEMINI_API_KEY 또는 GROQ_API_KEY)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqiegpudfdfbuuqpimeg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.log('⏭ SUPABASE_SERVICE_KEY 없음, 건너뜀');
  process.exit(0);
}

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

function pickRandomN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const COMMENT_PROMPT = `당신은 50~60대 한국인 커뮤니티 회원입니다.
아래 게시글을 읽고, 실제 50대가 달 법한 댓글 3개를 작성하세요.

핵심 규칙:
- 각 댓글은 게시글 내용에 **직접적으로 반응**해야 함
- 공감, 질문, 조언, 경험 공유 등 다양한 유형으로
- 맞춤법이 살짝 어색해도 됨 (실제 50대 스타일)
- 존댓말 사용 (~합니다, ~거든요, ~네요)
- 반드시 한국어만 사용. 영어, 베트남어, 한자(漢字) 등 외국어 절대 금지 (ETF, IRP 같은 금융 약어만 예외). 政策→정책, 運動→운동, 們→들 등 한자 섞어쓰기 금지
- 각 댓글 30~80자

반드시 JSON 배열만 출력:
[
  { "nickname": "닉네임1", "content": "댓글 내용" },
  { "nickname": "닉네임2", "content": "댓글 내용" },
  { "nickname": "닉네임3", "content": "댓글 내용" }
]`;

async function generateComments(postTitle, postContent, nicknames) {
  const userMsg = `게시글 제목: ${postTitle}\n게시글 내용: ${postContent}\n\n댓글 작성자: ${nicknames.join(', ')}`;

  // Gemini만 사용
  if (!process.env.GEMINI_API_KEY) {
    console.log('    GEMINI_API_KEY 없음');
    return null;
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: COMMENT_PROMPT + '\n\n' + userMsg }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 512, responseMimeType: 'application/json' },
    });
    return JSON.parse(result.response.text());
  } catch (err) {
    console.log(`    Gemini 실패: ${err.message}`);
  }

  return null;
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('━━━ 게시글 보강 (AI 맥락 댓글 + engagement) ━━━\n');

  // 댓글이 3개 미만인 최근 게시글 5개 찾기
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, title, content, author_id, category_id, comment_count, created_at')
    .lt('comment_count', 3)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !posts?.length) {
    console.log('보강할 게시글 없음');
    return;
  }

  console.log(`${posts.length}개 게시글에 댓글 보강 시작\n`);

  for (const post of posts) {
    // 게시글 작성자 제외한 랜덤 유저 3명
    const available = BOT_USERS.filter(u => u.id !== post.author_id);
    const commenters = pickRandomN(available, 3);

    const comments = await generateComments(
      post.title,
      post.content,
      commenters.map(u => u.nick)
    );

    if (!comments || !comments.length) {
      console.log(`  ⚠ "${post.title.slice(0, 25)}..." AI 댓글 생성 실패`);
      continue;
    }

    let added = 0;
    for (let i = 0; i < comments.length && i < commenters.length; i++) {
      const c = comments[i];
      const author = commenters.find(u => u.nick === c.nickname) || commenters[i];
      const gapMinutes = randomInt(10 + i * 20, 60 + i * 40);
      const postDate = new Date(post.created_at);
      const commentTime = new Date(postDate.getTime() + gapMinutes * 60 * 1000);

      const { error: cErr } = await supabase
        .from('comments')
        .insert({
          post_id: post.id,
          author_id: author.id,
          content: c.content,
          created_at: commentTime.toISOString(),
        });

      if (!cErr) added++;
    }

    // comment_count, view_count, like_count 업데이트
    const newCommentCount = post.comment_count + added;
    const daysSince = Math.max(1, (Date.now() - new Date(post.created_at).getTime()) / 86400000);
    const viewCount = randomInt(15, 30) * newCommentCount + randomInt(5, 25) + Math.floor(daysSince * randomInt(2, 8));
    const likeCount = Math.round(viewCount * (0.014 + Math.random() * 0.01));

    await supabase
      .from('posts')
      .update({ comment_count: newCommentCount, view_count: viewCount, like_count: likeCount })
      .eq('id', post.id);

    console.log(`  ✅ "${post.title.slice(0, 30)}..." → 댓글 +${added}, 조회 ${viewCount}, 좋아요 ${likeCount}`);
  }

  console.log('\n━━━ 보강 완료 ━━━');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
