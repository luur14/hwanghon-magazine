/**
 * Instagram Graph API 캐러셀 게시
 * 필요 환경변수:
 *   INSTAGRAM_USER_ID       - Instagram 비즈니스 계정 ID
 *   INSTAGRAM_ACCESS_TOKEN  - 장기 액세스 토큰 (60일 유효)
 *
 * 토큰 발급 순서:
 *   1. Meta 개발자 앱 생성 (developers.facebook.com)
 *   2. Instagram + Pages 제품 추가
 *   3. 단기 토큰 발급 → 장기 토큰으로 교환
 *   4. Instagram 비즈니스 계정 ID 확인: GET /me/accounts?access_token=...
 */
const axios = require('axios');

const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const API_BASE = 'https://graph.facebook.com/v21.0';

/** 캐러셀 아이템 미디어 컨테이너 생성 */
async function createItemContainer(imageUrl) {
  const { data } = await axios.post(`${API_BASE}/${IG_USER_ID}/media`, null, {
    params: {
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: ACCESS_TOKEN
    },
    timeout: 30000
  });
  return data.id;
}

/** 컨테이너 처리 완료 대기 (최대 30초) */
async function waitForContainer(containerId) {
  for (let i = 0; i < 15; i++) {
    const { data } = await axios.get(`${API_BASE}/${containerId}`, {
      params: { fields: 'status_code', access_token: ACCESS_TOKEN }
    });
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error(`미디어 컨테이너 처리 실패: ${containerId}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('미디어 컨테이너 타임아웃');
}

/** 캐러셀 컨테이너 생성 */
async function createCarouselContainer(childIds, caption) {
  const { data } = await axios.post(`${API_BASE}/${IG_USER_ID}/media`, null, {
    params: {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: ACCESS_TOKEN
    },
    timeout: 30000
  });
  return data.id;
}

/** 캐러셀 게시 */
async function publishCarousel(creationId) {
  const { data } = await axios.post(`${API_BASE}/${IG_USER_ID}/media_publish`, null, {
    params: {
      creation_id: creationId,
      access_token: ACCESS_TOKEN
    },
    timeout: 30000
  });
  return data.id;
}

/**
 * Instagram 캐러셀 게시 (메인 함수)
 * @param {string[]} imageUrls - ImgBB 공개 URL 배열 (최대 10장)
 * @param {string} caption - 게시글 캡션
 */
async function publishInstagram(imageUrls, caption) {
  if (!IG_USER_ID || !ACCESS_TOKEN) {
    console.log('  ⏭ Instagram: 자격증명 없음, 건너뜀');
    return null;
  }

  try {
    const urls = imageUrls.slice(0, 10); // Instagram 최대 10장
    console.log(`  Instagram 캐러셀 게시 중 (${urls.length}장)...`);

    // 1. 각 이미지 컨테이너 생성
    const containerIds = [];
    for (const url of urls) {
      const id = await createItemContainer(url);
      await waitForContainer(id);
      containerIds.push(id);
    }

    // 2. 캐러셀 컨테이너 생성
    const carouselId = await createCarouselContainer(containerIds, caption);
    await waitForContainer(carouselId);

    // 3. 게시
    const postId = await publishCarousel(carouselId);
    console.log(`  ✅ Instagram 게시 완료 (ID: ${postId})`);
    return postId;

  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`  ❌ Instagram 게시 실패: ${msg}`);
    return null;
  }
}

module.exports = { publishInstagram };
