/**
 * 네이버 뉴스 수집 → Supabase 저장 실행 스크립트
 * 실행: node src/collect-news.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { collectNaverNews } = require('./collectors/naver-news-collector');
const { publishNewsToSupabase } = require('./publishers/news-publisher');

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     황혼 매거진 - 네이버 뉴스 수집        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const news = await collectNaverNews();

  if (news.length > 0) {
    await publishNewsToSupabase(news);
  }

  console.log('🎉 뉴스 수집 완료!');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
