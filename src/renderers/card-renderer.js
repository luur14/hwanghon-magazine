const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const OUTPUT_DIR = path.join(__dirname, '../../output/cardnews');

/**
 * 카테고리 클래스 매핑
 */
function getCategoryClass(category) {
  if (category.includes('주식') || category.includes('재테크') || category.includes('투자')) return 'finance';
  if (category.includes('정책') || category.includes('연금') || category.includes('복지')) return 'policy';
  if (category.includes('건강')) return 'health';
  return 'finance';
}

/**
 * 요약 포인트를 HTML로 변환 (템플릿별)
 */
function renderSummaryItems(points, template, categoryClass) {
  if (template === 'a') {
    return points.map(p =>
      `<div class="summary-item"><span class="summary-icon">▸</span><span>${p}</span></div>`
    ).join('\n');
  }
  if (template === 'b') {
    return points.map(p =>
      `<div class="summary-item"><div class="bullet ${categoryClass}"></div><span>${p}</span></div>`
    ).join('\n');
  }
  if (template === 'c') {
    return points.map((p, i) =>
      `<div class="summary-item"><div class="summary-number ${categoryClass}">${i + 1}</div><div class="summary-text">${p}</div></div>`
    ).join('\n');
  }
  return '';
}

/**
 * 템플릿에 데이터 바인딩
 */
function bindTemplate(templateHtml, data) {
  const categoryClass = getCategoryClass(data.category);
  const summaryHtml = renderSummaryItems(data.summaryPoints, data.template, categoryClass);

  // 이미지를 base64 data URI로 변환 (로컬 파일 우선)
  let imageUri = data.imageUrl || '';
  if (data.imagePath && fs.existsSync(data.imagePath)) {
    const imgBuffer = fs.readFileSync(data.imagePath);
    const ext = path.extname(data.imagePath).slice(1) || 'jpeg';
    imageUri = `data:image/${ext};base64,${imgBuffer.toString('base64')}`;
  }

  let html = templateHtml
    .replace(/\{\{CATEGORY\}\}/g, data.category)
    .replace(/\{\{CATEGORY_CLASS\}\}/g, categoryClass)
    .replace(/\{\{DATE\}\}/g, data.date || dayjs().format('YYYY.MM.DD'))
    .replace(/\{\{TITLE\}\}/g, data.title)
    .replace(/\{\{SUBTITLE\}\}/g, data.subtitle || '')
    .replace(/\{\{IMAGE_URL\}\}/g, imageUri)
    .replace(/\{\{SUMMARY_ITEMS\}\}/g, summaryHtml)
    .replace(/\{\{PAGE\}\}/g, data.page || '');

  // 하이라이트 처리: **텍스트** → <span class="highlight/accent">텍스트</span>
  html = html.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');

  return html;
}

/**
 * HTML을 PNG로 렌더링
 */
async function renderToPNG(htmlContent, outputFilename) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 폰트 로딩 대기
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 1000));

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1080 }
    });

    console.log(`  ✓ 렌더링 완료: ${outputFilename}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}

/**
 * 카드뉴스 세트 렌더링 (여러 슬라이드)
 */
async function renderCardNewsSet(cardNewsData) {
  const results = [];
  const templateName = cardNewsData.template || 'a';
  const templatePath = path.join(TEMPLATES_DIR, `template-${templateName}.html`);
  const templateHtml = fs.readFileSync(templatePath, 'utf-8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });

    for (let i = 0; i < cardNewsData.slides.length; i++) {
      const slide = cardNewsData.slides[i];
      const data = {
        ...slide,
        template: templateName,
        date: cardNewsData.date || dayjs().format('YYYY.MM.DD'),
        page: `${i + 1} / ${cardNewsData.slides.length}`
      };

      const html = bindTemplate(templateHtml, data);
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluateHandle('document.fonts.ready');
      await new Promise(r => setTimeout(r, 800));

      const filename = `${cardNewsData.id}_slide${i + 1}.png`;
      const outputPath = path.join(OUTPUT_DIR, filename);

      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      await page.screenshot({
        path: outputPath,
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1080 }
      });

      console.log(`  ✓ 슬라이드 ${i + 1}/${cardNewsData.slides.length}: ${filename}`);
      results.push(outputPath);
    }
  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { renderToPNG, renderCardNewsSet, bindTemplate, getCategoryClass };

// 직접 실행 테스트
if (require.main === module) {
  (async () => {
    console.log('=== 카드뉴스 렌더링 테스트 ===\n');

    const testData = {
      id: 'test_001',
      date: dayjs().format('YYYY.MM.DD'),
      template: 'a',
      slides: [
        {
          category: '재테크/주식',
          title: '코스피 6,000 돌파\n개인 투자자 역대 최대 순매수',
          summaryPoints: [
            '이달 20일까지 개인 순매수 21.8조 기록',
            '사상 첫 월간 30조 돌파 가능성',
            '예금·마통 자금이 증시로 이동 중'
          ],
          imageUrl: 'https://img.freepik.com/free-photo/stock-exchange-information-board-graphic_53876-121140.jpg?w=1200&q=90'
        },
        {
          category: '재테크/주식',
          title: '2026년 ETF 투자\n시니어가 알아야 할 3가지',
          summaryPoints: [
            '배당 ETF로 월 수입 만들기',
            '리스크 낮은 채권 ETF 활용법',
            '연금저축 계좌와 ETF 조합 전략'
          ],
          imageUrl: 'https://img.freepik.com/free-photo/elegant-old-couple-cafe-using-tablet_1157-32977.jpg?w=1200&q=90'
        }
      ]
    };

    // 템플릿 A 테스트
    console.log('[템플릿 A]');
    testData.template = 'a';
    testData.id = 'test_a';
    await renderCardNewsSet(testData);

    // 템플릿 B 테스트
    console.log('\n[템플릿 B]');
    testData.template = 'b';
    testData.id = 'test_b';
    await renderCardNewsSet(testData);

    // 템플릿 C 테스트
    console.log('\n[템플릿 C]');
    testData.template = 'c';
    testData.id = 'test_c';
    await renderCardNewsSet(testData);

    console.log('\n=== 렌더링 테스트 완료 ===');
    console.log(`결과: ${OUTPUT_DIR}`);
  })();
}
