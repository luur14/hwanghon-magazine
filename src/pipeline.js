const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const { collectAll } = require('./collectors/news-collector');
const { collectImagesForNews } = require('./collectors/image-collector');
const { generateCardNewsText, formatForRenderer } = require('./generators/text-generator');
const { renderCardNewsSet } = require('./renderers/card-renderer');

const OUTPUT_DIR = path.join(__dirname, '../output');

/**
 * 전체 카드뉴스 생성 파이프라인
 */
async function runPipeline() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   황혼 즈음에 - 카드뉴스 자동 생성 파이프라인   ║');
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

    // ━━━ 2단계: AI 텍스트 생성 ━━━
    console.log('\n━━━ [2/4] 카드뉴스 텍스트 생성 (Groq) ━━━');
    const cardnewsText = await generateCardNewsText(newsData);
    const cardnewsFormatted = formatForRenderer(cardnewsText);

    // 생성된 텍스트 저장
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'cardnews.json'),
      JSON.stringify({ generated: cardnewsText, formatted: cardnewsFormatted }, null, 2),
      'utf-8'
    );

    // ━━━ 3단계: 이미지 수집 ━━━
    console.log('\n━━━ [3/4] 이미지 수집 (Freepik) ━━━');
    const imageItems = cardnewsText.cardnews.map(card => ({
      title: card.title.replace('\n', ' '),
      category: card.category,
      imageKeyword: card.imageKeyword
    }));

    // imageKeyword 기반으로 이미지 수집
    const imageResults = await collectImagesForNews(
      imageItems.map(item => ({
        title: item.imageKeyword, // 영어 키워드로 검색
        category: item.category
      }))
    );

    // ━━━ 4단계: PNG 렌더링 ━━━
    console.log('\n━━━ [4/4] 카드뉴스 PNG 렌더링 ━━━');
    const allRendered = [];

    for (let i = 0; i < cardnewsFormatted.length; i++) {
      const card = cardnewsFormatted[i];
      const image = imageResults[i];

      // 이미지 URL 설정
      if (image && image.imageUrl) {
        card.slides[0].imageUrl = image.imageUrl;
        card.slides[0].imagePath = image.imagePath;
      }

      console.log(`\n  카드 ${i + 1}/${cardnewsFormatted.length}: ${card.slides[0].title.replace('\n', ' ')}`);
      const rendered = await renderCardNewsSet(card);
      allRendered.push({
        ...card,
        renderedFiles: rendered
      });
    }

    // ━━━ 결과 요약 ━━━
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║             파이프라인 완료!              ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`소요 시간: ${elapsed}초`);
    console.log(`생성된 카드뉴스: ${allRendered.length}개`);
    console.log(`총 이미지 파일: ${allRendered.reduce((sum, r) => sum + r.renderedFiles.length, 0)}개`);
    console.log(`\n출력 폴더: ${path.join(OUTPUT_DIR, 'cardnews')}`);

    // 결과 목록
    allRendered.forEach((card, i) => {
      console.log(`  ${i + 1}. [${card.slides[0].category}] ${card.slides[0].title.replace('\n', ' ')} (템플릿 ${card.template.toUpperCase()})`);
      card.renderedFiles.forEach(f => console.log(`     → ${path.basename(f)}`));
    });

    // 최종 결과 JSON 저장
    const finalResult = {
      generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      elapsedSeconds: parseFloat(elapsed),
      cards: allRendered.map(card => ({
        id: card.id,
        template: card.template,
        category: card.slides[0].category,
        title: card.slides[0].title,
        subtitle: card.slides[0].subtitle,
        summaryPoints: card.slides[0].summaryPoints,
        files: card.renderedFiles.map(f => path.basename(f))
      }))
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

// 직접 실행
if (require.main === module) {
  runPipeline()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
