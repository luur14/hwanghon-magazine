/**
 * Supabase 게시글 자동 등록 퍼블리셔
 * 카드뉴스 데이터를 앱 내 커뮤니티 게시글로 변환하여 INSERT
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqiegpudfdfbuuqpimeg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 시드 유저 ID 목록 (랜덤 선택용)
const BOT_USERS = [
  '2b8fad73-d5ae-49ad-b1fd-48e514700aa6', // 바람따라구름따라
  '312d1da0-9efc-46b0-8e5d-2f99009c1d5e', // 햇살좋은날
  'c9df5b2d-15ae-4e02-bebc-b86a3730a3dd', // 산넘어바다
  '345c36c0-d352-46df-a8d6-366b343d6b48', // 꽃피는봄날
  '6866ad49-e0b1-4a91-9ee4-914f3877b8da', // 늘푸른소나무
  '8588b2d6-f6f3-45d7-b618-0df9ad9a0441', // 달빛산책
  'a058bfe3-8528-41aa-9fb7-f134bf69b8eb', // 새벽이슬
  '096d0133-1466-4d92-967b-857003fc896c', // 정원지기
  '3fd0b71c-85a5-4c91-98bc-c19d293f12d5', // 은빛물결
  'f32c0d1d-2912-45d3-a621-45a4fe211d12', // 따뜻한차한잔
  '0bc43005-e845-4727-9e9c-a07f493f4ff2', // 하늘보기
  'f1ecdd0f-d3c9-486a-baab-ad2378651a4f', // 소소한행복
];

// 카드뉴스 카테고리 → 앱 카테고리 매핑
// 1=사회/정치, 2=퇴직준비/은퇴, 3=건강, 4=일상, 5=유머, 6=주식/재테크, 7=자유게시판
const CATEGORY_MAP = {
  '주식': 6,
  '재테크': 6,
  '건강': 3,
  '최신뉴스': 1,
  '뉴스': 1,
  '사회': 1,
  '정치': 1,
  '은퇴': 2,
  '일상': 4,
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mapCategory(theme) {
  if (!theme) return 7;
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (theme.includes(key)) return val;
  }
  return 7; // 기본: 자유게시판
}

/**
 * 카드뉴스 슬라이드들을 개별 게시글로 변환하여 Supabase에 등록
 * @param {object} cardData - AI 생성 카드뉴스 데이터
 * @returns {object|null} 게시 결과
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

  // 각 슬라이드를 개별 게시글로 변환 (커버/CTA 제외)
  const contentSlides = cardData.slides.filter(s => s.title && s.body);

  if (!contentSlides.length) {
    console.log('  ⚠ Supabase: 게시할 콘텐츠 슬라이드 없음');
    return null;
  }

  const results = [];

  for (const slide of contentSlides) {
    const authorId = pickRandom(BOT_USERS);
    const categoryId = mapCategory(slide.category || cardData.coverCategory);

    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: authorId,
        category_id: categoryId,
        title: slide.title,
        content: slide.body,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ Supabase 게시 실패: ${slide.title.slice(0, 25)}... → ${error.message}`);
    } else {
      results.push(data.id);
    }
  }

  if (results.length) {
    console.log(`  ✅ Supabase 게시 완료 (${results.length}건)`);
  }

  return results.length ? { postIds: results, count: results.length } : null;
}

module.exports = { publishToSupabase };
