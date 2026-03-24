/**
 * SNS 퍼블리셔 오케스트레이터
 * 설정된 채널에만 게시 (자격증명 없는 채널은 자동 건너뜀)
 */
const { uploadImagesToPublic } = require('./image-uploader');
const { publishInstagram } = require('./instagram-publisher');
const { publishFacebook } = require('./facebook-publisher');
const { publishBand } = require('./band-publisher');
const { publishTelegram } = require('./telegram-publisher');

/**
 * 카드뉴스용 캡션/내용 생성
 */
function buildCaption(cardData) {
  const title = cardData.coverTitle.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim();
  const theme = cardData.coverCategory || '';

  const themeEmoji = {
    '주식': '📈',
    '재테크': '💰',
    '건강': '🌿',
    '최신뉴스': '📰'
  }[theme] || '📌';

  const slideLines = cardData.slides
    .slice(0, 5)
    .map(s => `• ${s.title}`)
    .join('\n');

  const hashtags = [
    '#황혼즈음에', '#황혼매거진', '#시니어', '#50대', '#60대',
    '#카드뉴스', `#${theme}`
  ].join(' ');

  return `${themeEmoji} ${title}\n\n${slideLines}\n\n${hashtags}`;
}

/**
 * HTML 캡션 (Telegram용)
 */
function buildHtmlCaption(cardData) {
  const title = cardData.coverTitle.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim();
  const theme = cardData.coverCategory || '';

  const themeEmoji = {
    '주식': '📈',
    '재테크': '💰',
    '건강': '🌿',
    '최신뉴스': '📰'
  }[theme] || '📌';

  const slideLines = cardData.slides
    .slice(0, 5)
    .map(s => `• ${s.title}`)
    .join('\n');

  return `<b>${themeEmoji} ${title}</b>\n\n${slideLines}\n\n#황혼즈음에 #시니어 #50대 #60대 #카드뉴스`;
}

/**
 * 전체 SNS 게시 실행
 * @param {string[]} imagePaths - 렌더링된 PNG 파일 경로 배열
 * @param {object} cardData - AI 생성 카드뉴스 데이터
 * @returns {object} 각 플랫폼 게시 결과
 */
async function publishAll(imagePaths, cardData) {
  console.log('\n━━━ [5/5] SNS 게시 ━━━');

  const caption = buildCaption(cardData);
  const htmlCaption = buildHtmlCaption(cardData);
  const results = {};

  // Instagram & Facebook은 공개 URL 필요 → ImgBB 업로드
  const needsPublicUrl =
    (process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN) ||
    (process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN);

  let publicUrls = [];
  if (needsPublicUrl && process.env.IMGBB_API_KEY) {
    try {
      publicUrls = await uploadImagesToPublic(imagePaths);
    } catch (err) {
      console.error(`  ⚠ ImgBB 업로드 실패: ${err.message}`);
      console.error('  → Instagram/Facebook 게시 건너뜀');
    }
  } else if (needsPublicUrl && !process.env.IMGBB_API_KEY) {
    console.log('  ⏭ Instagram/Facebook: IMGBB_API_KEY 없음, 건너뜀');
  }

  // Instagram
  if (publicUrls.length) {
    results.instagram = await publishInstagram(publicUrls, caption);
  }

  // Facebook
  if (publicUrls.length) {
    results.facebook = await publishFacebook(publicUrls, caption);
  }

  // Band (직접 파일 업로드)
  results.band = await publishBand(imagePaths, caption);

  // Telegram (직접 파일 업로드)
  results.telegram = await publishTelegram(imagePaths, htmlCaption);

  // 결과 요약
  console.log('\n  게시 결과:');
  const platforms = ['instagram', 'facebook', 'band', 'telegram'];
  for (const p of platforms) {
    const status = results[p] ? '✅' : '⏭';
    console.log(`    ${status} ${p}`);
  }

  return results;
}

module.exports = { publishAll };
