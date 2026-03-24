/**
 * Telegram Bot API 미디어 그룹 전송
 * 카카오 채널은 공개 API 없음 → 텔레그램으로 대체
 *
 * 필요 환경변수:
 *   TELEGRAM_BOT_TOKEN - BotFather에서 발급 (/newbot)
 *   TELEGRAM_CHAT_ID   - 채널 ID (예: @hwanghon_magazine 또는 숫자 ID)
 *
 * 설정 방법:
 *   1. Telegram에서 @BotFather 검색
 *   2. /newbot → 봇 이름/ID 입력 → 토큰 발급
 *   3. 채널 만들기 → 봇을 관리자로 추가
 *   4. 채널 링크 (@hwanghon_xxx) 또는 채팅 ID를 TELEGRAM_CHAT_ID에 설정
 */
const axios = require('axios');
const fs = require('fs');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Telegram 미디어 그룹 전송 (메인 함수)
 * @param {string[]} imagePaths - 로컬 PNG 파일 경로 배열 (최대 10장)
 * @param {string} caption - 첫 번째 사진에 붙을 캡션 (HTML 형식)
 */
async function publishTelegram(imagePaths, caption) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('  ⏭ Telegram: 자격증명 없음, 건너뜀');
    return null;
  }

  try {
    const paths = imagePaths.slice(0, 10);
    console.log(`  Telegram 미디어 그룹 전송 중 (${paths.length}장)...`);

    const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`;

    // FormData 구성 (Node.js 20 빌트인)
    const form = new FormData();
    form.append('chat_id', CHAT_ID);

    const media = paths.map((imgPath, i) => ({
      type: 'photo',
      media: `attach://photo${i}`,
      ...(i === 0 ? { caption, parse_mode: 'HTML' } : {})
    }));
    form.append('media', JSON.stringify(media));

    for (let i = 0; i < paths.length; i++) {
      const buffer = fs.readFileSync(paths[i]);
      const blob = new Blob([buffer], { type: 'image/png' });
      form.append(`photo${i}`, blob, `slide${i}.png`);
    }

    const { data } = await axios.post(API_URL, form, { timeout: 60000 });

    const messageId = data.result?.[0]?.message_id;
    console.log(`  ✅ Telegram 전송 완료 (message_id: ${messageId})`);
    return messageId;

  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    console.error(`  ❌ Telegram 전송 실패: ${msg}`);
    return null;
  }
}

module.exports = { publishTelegram };
