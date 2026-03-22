require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const { collectAll } = require('./collectors/news-collector');
const { collectImagesForNews } = require('./collectors/image-collector');
const { generateCardNewsText } = require('./generators/text-generator');
const { renderCardNewsSet } = require('./renderers/card-renderer');

const OUTPUT_DIR = path.join(__dirname, '../output');

// output 디렉토리 자동 생성
for (const dir of ['output', 'output/cardnews', 'output/images']) {
  const d = path.join(__dirname, '..', dir);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/**
 * 전체 카드뉴스 생성 파이프라인 (5장 세트)
 */
async function runPipeline() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     황혼 매거진 - 카드뉴스 자동 생성      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`시작: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n`);

  try {
    // ━━━ 1단계: 뉴스 & 증시 수집 ━━━
    console.log('━━━ [1/4] 뉴스 & 증시 수집 ━━━');
    const newsData = await collectAll();
    if (!newsData.news.length) {
      console.log('⚠ 수집된 뉴스가 없습니다. 파이프라인 중단.');
      return null;
    }

    // ━━━ 2단계: AI 텍스트 생성 (5장 세트) ━━━
    console.log('\n━━━ [2/4] 카드뉴스 텍스트 생성 (Groq) ━━━');
    const cardData = await generateCardNewsText(newsData);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'cardnews.json'),
      JSON.stringify(cardData, null, 2),
      'utf-8'
    );

    // ━━━ 3단계: 이미지 수집 (커버1 + 콘텐츠5) ━━━
    console.log('\n━━━ [3/4] 이미지 수집 ━━━');

    // 커버 키워드: 첫 번째 슬라이드 키워드를 공유하거나 커버 카테고리 기반
    const coverKeyword = cardData.slides[0]?.imageKeyword || 'business news magazine';

    const imageItems = [
      { title: cardData.coverTitle.replace(/\\n/g, ' '), category: cardData.coverCategory, imageKeyword: coverKeyword },
      ...cardData.slides.map(s => ({ title: s.title, category: s.category, imageKeyword: s.imageKeyword }))
    ];

    const imageResults = await collectImagesForNews(imageItems);

    // 이미지 경로 정리
    const images = {
      cover: imageResults[0]?.imagePath || null,
      slides: cardData.slides.map((_, i) => imageResults[i + 1]?.imagePath || null)
    };

    // ━━━ 4단계: PNG 렌더링 (7장) ━━━
    console.log('\n━━━ [4/4] 카드뉴스 PNG 렌더링 (7장) ━━━');
    const renderedFiles = await renderCardNewsSet(cardData, images);

    // ━━━ 결과 요약 ━━━
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║             파이프라인 완료!              ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`에디션: ${cardData.edition}`);
    console.log(`소요 시간: ${elapsed}초`);
    console.log(`생성된 슬라이드: ${renderedFiles.length}장`);
    console.log(`\n출력 폴더: ${path.join(OUTPUT_DIR, 'cardnews')}`);
    renderedFiles.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));

    // 최종 결과 JSON
    const finalResult = {
      generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      edition: cardData.edition,
      elapsedSeconds: parseFloat(elapsed),
      slides: renderedFiles.map(f => path.basename(f))
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pipeline-result.json'),
      JSON.stringify(finalResult, null, 2),
      'utf-8'
    );

    return finalResult;

  } catch (err) {
    console.error('\n❌ 파이프라인 에러:', err.message);
    console.error(err.stack);
    throw err;
  }
}

module.exports = { runPipeline };

if (require.main === module) {
  runPipeline()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
