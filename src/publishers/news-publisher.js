/**
 * 네이버 뉴스 → Supabase info_articles 저장 퍼블리셔
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqiegpudfdfbuuqpimeg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * 수집된 뉴스를 info_articles 테이블에 저장
 * @param {Array} newsItems - collectNaverNews() 결과
 */
async function publishNewsToSupabase(newsItems) {
  if (!SUPABASE_SERVICE_KEY) {
    console.log('  ⏭ 뉴스 저장: SUPABASE_SERVICE_KEY 없음, 건너뜀');
    return null;
  }

  if (!newsItems || !newsItems.length) {
    console.log('  ⚠ 저장할 뉴스 없음');
    return null;
  }

  let createClient;
  try {
    createClient = require('@supabase/supabase-js').createClient;
  } catch {
    console.log('  ⏭ @supabase/supabase-js 미설치, 건너뜀');
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('━━━ 뉴스 Supabase 저장 ━━━');

  // 오늘 이미 저장된 뉴스 제목 조회 (중복 방지)
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('info_articles')
    .select('title')
    .eq('category_id', 'news')
    .gte('published_at', today + 'T00:00:00Z');

  const existingTitles = new Set((existing ?? []).map(a => a.title));

  let saved = 0;
  let skipped = 0;

  for (const item of newsItems) {
    // 중복 체크
    if (existingTitles.has(item.title)) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('info_articles')
      .insert({
        category_id: 'news',
        title: item.title,
        summary: item.description.slice(0, 200),
        content: item.link, // 원문 URL 저장
        tags: [item.category, item.source].filter(Boolean),
        slides: null,
        is_published: true,
        published_at: new Date(item.pubDate).toISOString(),
      });

    if (error) {
      console.error(`  ❌ 저장 실패: ${item.title.slice(0, 30)}... → ${error.message}`);
    } else {
      saved++;
      existingTitles.add(item.title);
    }
  }

  console.log(`  ✅ 저장 ${saved}건, 중복 건너뜀 ${skipped}건\n`);
  return { saved, skipped };
}

module.exports = { publishNewsToSupabase };
