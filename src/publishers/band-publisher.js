/**
 * Band OpenAPI 게시
 * 필요 환경변수:
 *   BAND_ACCESS_TOKEN - Band OAuth2 액세스 토큰
 *   BAND_KEY          - 게시할 밴드의 고유 키
 *
 * 토큰 발급 순서:
 *   1. developers.band.us에서 앱 생성 (승인 후)
 *   2. OAuth 인증: https://auth.band.us/oauth2/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri=http://localhost
 *   3. 브라우저에서 로그인 → 리다이렉트 URL의 code 값 복사
 *   4. 토큰 교환: POST https://auth.band.us/oauth2/token
 *   5. GET https://openapi.band.us/v2/profile → member.bands[].band_key 확인
 */
const axios = require('axios');
const fs = require('fs');

const ACCESS_TOKEN = process.env.BAND_ACCESS_TOKEN;
const BAND_KEY = process.env.BAND_KEY;
const API_BASE = 'https://openapi.band.us';

/** 사진 업로드 → photo_key 반환 */
async function uploadPhoto(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const blob = new Blob([buffer], { type: 'image/png' });

  const form = new FormData();
  form.append('photo', blob, `slide_${Date.now()}.png`);

  const { data } = await axios.post(`${API_BASE}/v2/band/post/photo`, form, {
    params: {
      access_token: ACCESS_TOKEN,
      band_key: BAND_KEY
    },
    timeout: 30000
  });

  if (data.result_code !== 1) {
    throw new Error(`Band 사진 업로드 실패: ${JSON.stringify(data)}`);
  }

  return data.result_data.photo_key;
}

/** 게시물 생성 */
async function createPost(content, photoKeys) {
  const params = new URLSearchParams();
  params.append('access_token', ACCESS_TOKEN);
  params.append('band_key', BAND_KEY);
  params.append('content', content);
  for (const key of photoKeys) {
    params.append('photo_keys[]', key);
  }

  const { data } = await axios.post(`${API_BASE}/v2.1/band/post/create`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  });

  if (data.result_code !== 1) {
    throw new Error(`Band 게시 실패: ${JSON.stringify(data)}`);
  }

  return data.result_data.post_key;
}

/**
 * Band 게시 (메인 함수)
 * @param {string[]} imagePaths - 로컬 PNG 파일 경로 배열
 * @param {string} content - 게시글 내용
 */
async function publishBand(imagePaths, content) {
  if (!ACCESS_TOKEN || !BAND_KEY) {
    console.log('  ⏭ Band: 자격증명 없음, 건너뜀');
    return null;
  }

  try {
    console.log(`  Band 게시 중 (${imagePaths.length}장)...`);

    // 사진 업로드
    const photoKeys = [];
    for (const imgPath of imagePaths) {
      const key = await uploadPhoto(imgPath);
      photoKeys.push(key);
    }

    // 게시물 생성
    const postKey = await createPost(content, photoKeys);
    console.log(`  ✅ Band 게시 완료 (key: ${postKey})`);
    return postKey;

  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`  ❌ Band 게시 실패: ${msg}`);
    return null;
  }
}

module.exports = { publishBand };
