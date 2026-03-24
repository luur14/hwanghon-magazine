/**
 * Facebook Page 멀티 사진 게시
 * 필요 환경변수:
 *   FACEBOOK_PAGE_ID           - Facebook 페이지 ID
 *   FACEBOOK_PAGE_ACCESS_TOKEN - 페이지 액세스 토큰 (장기)
 *
 * 토큰 발급:
 *   1. Meta 개발자 앱에서 Graph API Explorer 접속
 *   2. 페이지 액세스 토큰 발급 (pages_manage_posts, pages_read_engagement 권한)
 *   3. 장기 토큰으로 교환: GET /oauth/access_token?grant_type=fb_exchange_token&...
 */
const axios = require('axios');

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const API_BASE = 'https://graph.facebook.com/v21.0';

/** 이미지를 페이지에 비공개로 업로드 (photo ID 반환) */
async function uploadUnpublishedPhoto(imageUrl) {
  const { data } = await axios.post(`${API_BASE}/${PAGE_ID}/photos`, null, {
    params: {
      url: imageUrl,
      published: 'false',
      access_token: PAGE_TOKEN
    },
    timeout: 30000
  });
  return data.id;
}

/** 멀티 사진 피드 게시 */
async function publishFeedPost(photoIds, message) {
  const attachedMedia = photoIds.map(id => ({ media_fbid: id }));

  const { data } = await axios.post(`${API_BASE}/${PAGE_ID}/feed`, null, {
    params: {
      message,
      attached_media: JSON.stringify(attachedMedia),
      access_token: PAGE_TOKEN
    },
    timeout: 30000
  });
  return data.id;
}

/**
 * Facebook 페이지 멀티 사진 게시 (메인 함수)
 * @param {string[]} imageUrls - ImgBB 공개 URL 배열
 * @param {string} message - 게시글 메시지
 */
async function publishFacebook(imageUrls, message) {
  if (!PAGE_ID || !PAGE_TOKEN) {
    console.log('  ⏭ Facebook: 자격증명 없음, 건너뜀');
    return null;
  }

  try {
    const urls = imageUrls.slice(0, 10); // Facebook 최대 10장
    console.log(`  Facebook 멀티 사진 게시 중 (${urls.length}장)...`);

    // 1. 각 사진 비공개 업로드
    const photoIds = [];
    for (const url of urls) {
      const id = await uploadUnpublishedPhoto(url);
      photoIds.push(id);
    }

    // 2. 피드 포스트 생성
    const postId = await publishFeedPost(photoIds, message);
    console.log(`  ✅ Facebook 게시 완료 (ID: ${postId})`);
    return postId;

  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`  ❌ Facebook 게시 실패: ${msg}`);
    return null;
  }
}

module.exports = { publishFacebook };
