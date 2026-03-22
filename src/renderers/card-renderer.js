const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const OUTPUT_DIR = path.join(__dirname, '../../output/cardnews');
const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

/**
 * 로고를 base64 data URI로 변환
 */
function getLogoDataUri() {
  if (!fs.existsSync(LOGO_PATH)) return '';
  const buf = fs.readFileSync(LOGO_PATH);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * 이미지를 base64 data URI로 변환
 */
function imageToDataUri(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return '';
  const buf = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).slice(1) || 'jpeg';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

/**
 * 슬라이드 1: 커버
 */
function buildCoverHtml(data, coverImagePath) {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, 'slide-cover.html'), 'utf-8');
  const logoUri = getLogoDataUri();
  const imageUri = imageToDataUri(coverImagePath) || '';

  const previewItems = (data.previewItems || []).map((text, i) =>
    `<div class="preview-item">
      <div class="preview-num">${i + 1}</div>
      <span class="preview-text">${text}</span>
    </div>`
  ).join('\n');

  return html
    .replace(/\{\{LOGO_URL\}\}/g, logoUri)
    .replace(/\{\{DATE\}\}/g, data.date || dayjs().format('YYYY.MM.DD'))
    .replace(/\{\{EDITION\}\}/g, data.edition || '')
    .replace(/\{\{TITLE\}\}/g, (data.coverTitle || '').replace(/\\n/g, '<br>'))
    .replace(/\{\{SUBTITLE\}\}/g, data.coverSubtitle || '')
    .replace(/\{\{IMAGE_URL\}\}/g, imageUri)
    .replace(/\{\{PREVIEW_ITEMS\}\}/g, previewItems);
}

/**
 * 슬라이드 2~4: 콘텐츠
 */
function buildContentHtml(slide, slideIndex, totalSlides, imagePath, date) {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, 'slide-content.html'), 'utf-8');
  const imageUri = imageToDataUri(imagePath) || '';
  const logoUri = getLogoDataUri();

  const keyPointsHtml = (slide.keyPoints || []).map(point =>
    `<div class="key-point">
      <span class="key-point-icon">✓</span>
      <span class="key-point-text">${point}</span>
    </div>`
  ).join('\n');

  let result = html
    .replace(/\{\{LOGO_URL\}\}/g, logoUri)
    .replace(/\{\{PAGE\}\}/g, `${slideIndex + 1} / ${totalSlides}`)
    .replace(/\{\{SLIDE_NUM\}\}/g, String(slideIndex))
    .replace(/\{\{CATEGORY\}\}/g, slide.category || '')
    .replace(/\{\{TITLE\}\}/g, (slide.title || '').replace(/\\n/g, '<br>'))
    .replace(/\{\{BODY\}\}/g, slide.body || '')
    .replace(/\{\{KEY_POINTS\}\}/g, keyPointsHtml)
    .replace(/\{\{SOURCE\}\}/g, slide.source || '')
    .replace(/\{\{DATE\}\}/g, date || dayjs().format('YYYY.MM.DD'))
    .replace(/\{\{IMAGE_URL\}\}/g, imageUri);

  // **텍스트** → 하이라이트
  result = result.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');
  return result;
}

/**
 * 슬라이드 5: CTA
 */
function buildCtaHtml(data) {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, 'slide-cta.html'), 'utf-8');
  const logoUri = getLogoDataUri();

  const summaryBoxesHtml = (data.summaryBoxes || []).map(box =>
    `<div class="summary-box">
      <div class="summary-box-num">${box.num}</div>
      <div class="summary-box-label">${box.label}</div>
    </div>`
  ).join('\n');

  const hashtags = data.hashtags || ['#황혼매거진', '#시니어뉴스', '#오늘의증시'];

  return html
    .replace(/\{\{LOGO_URL\}\}/g, logoUri)
    .replace(/\{\{EDITION\}\}/g, data.edition || '')
    .replace(/\{\{CTA_MESSAGE\}\}/g, (data.ctaMessage || '').replace(/\\n/g, '<br>'))
    .replace(/\{\{CTA_BUTTON_TEXT\}\}/g, data.ctaButtonText || '황혼 매거진 팔로우')
    .replace(/\{\{CTA_SUB\}\}/g, data.ctaSub || '매일 아침, 당신을 위한 뉴스')
    .replace(/\{\{SUMMARY_BOXES\}\}/g, summaryBoxesHtml)
    .replace(/\{\{HASHTAG1\}\}/g, hashtags[0] || '')
    .replace(/\{\{HASHTAG2\}\}/g, hashtags[1] || '')
    .replace(/\{\{HASHTAG3\}\}/g, hashtags[2] || '');
}

/**
 * 7장 카드뉴스 세트 렌더링 (커버1 + 콘텐츠5 + CTA1)
 */
async function renderCardNewsSet(cardData, images) {
  const results = [];
  const date = dayjs().format('YYYY.MM.DD');
  const setId = `cardnews_${dayjs().format('YYYYMMDD_HHmm')}`;

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });

    const totalSlides = cardData.slides.length + 2; // 커버 + 콘텐츠 + CTA
    const slides = [
      { name: '커버', html: buildCoverHtml(cardData, images.cover) },
      ...cardData.slides.map((s, i) => ({
        name: s.title.replace(/\\n/g, ' '),
        html: buildContentHtml(s, i + 2, totalSlides, images.slides[i], date)
      })),
      { name: 'CTA', html: buildCtaHtml(cardData) }
    ];

    for (let i = 0; i < slides.length; i++) {
      const slideType = i === 0 ? 'cover' : i === slides.length - 1 ? 'cta' : 'content';
      console.log(`  슬라이드 ${i + 1}/${slides.length}: ${slides[i].name}`);

      await page.setContent(slides[i].html, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluateHandle('document.fonts.ready');
      await new Promise(r => setTimeout(r, 1000));

      const filename = `${setId}_${i + 1}_${slideType}.png`;
      const outputPath = path.join(OUTPUT_DIR, filename);
      await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } });
      results.push(outputPath);
      console.log(`    ✓ ${filename}`);
    }
  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { renderCardNewsSet };
