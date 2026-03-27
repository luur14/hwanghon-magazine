const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../../output/images');
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';

// 카테고리별 기본 Pexels 검색어
const CATEGORY_FALLBACK = {
  '증시':   'stock market finance',
  '경제':   'business economy office',
  '국제':   'city architecture world',
  '정책':   'government building people',
  '건강':   'senior health exercise',
  '생활':   'lifestyle retirement couple',
  '꿀팁':   'everyday tips lifestyle',
};

/**
 * imageKeyword가 이미 영어면 그대로, 한국어면 카테고리 폴백 사용
 */
function resolveKeyword(rawKeyword, category) {
  const kw = (rawKeyword || '').trim();
  // 영어 단어 포함되어 있으면 그대로 사용
  if (/[a-zA-Z]/.test(kw) && kw.length > 3) return kw;
  return CATEGORY_FALLBACK[category] || 'business news';
}

/**
 * 네이버 이미지 검색 API — 한국어 키워드 전용 (1순위)
 * 이재명 대통령, 코스피 주식 등 한국 뉴스 이미지에 최적화
 * 각 결과를 { link, thumbnail } 형태로 반환 (link 실패 시 thumbnail 사용)
 */
async function searchNaver(keyword) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET || !keyword) return [];

  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/image', {
      params: { query: keyword, display: 5, sort: 'sim', filter: 'large' },
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
      },
      timeout: 10000
    });
    const items = res.data.items || [];
    if (items.length > 0) {
      console.log(`    → 네이버 "${keyword}" → ${items.length}건`);
      // link(원본) + thumbnail(네이버 CDN) 둘 다 반환
      return items.slice(0, 3).map(item => ({
        link: item.link,
        thumbnail: item.thumbnail
      }));
    }
    console.log(`    → 네이버 "${keyword}" 결과 없음`);
    return [];
  } catch (err) {
    console.warn(`    ⚠ 네이버 오류: ${err.message}`);
    return [];
  }
}

/**
 * Pexels API 검색 — 최우선
 * 결과 없으면 키워드 앞 2단어로 재시도
 */
async function searchPexels(keyword) {
  if (!PEXELS_API_KEY) return null;

  const attempts = [
    keyword,
    keyword.split(' ').slice(0, 2).join(' '),
  ];

  for (const query of attempts) {
    try {
      const res = await axios.get('https://api.pexels.com/v1/search', {
        params: { query, per_page: 5, orientation: 'square' },
        headers: { Authorization: PEXELS_API_KEY },
        timeout: 10000,
      });
      const photos = res.data.photos || [];
      if (photos.length > 0) {
        console.log(`    → Pexels "${query}" → ${photos.length}건`);
        // large2x 또는 large (1080px급)
        return photos[0].src.large2x || photos[0].src.large;
      }
      console.log(`    → Pexels "${query}" 결과 없음, 재시도`);
    } catch (err) {
      console.warn(`    ⚠ Pexels 오류: ${err.message}`);
      return null;
    }
  }
  return null;
}

/**
 * Unsplash API — 보조 폴백
 */
async function searchUnsplash(keyword) {
  if (!UNSPLASH_ACCESS_KEY) return null;

  const attempts = [keyword, keyword.split(' ').slice(0, 2).join(' ')];
  for (const query of attempts) {
    try {
      const res = await axios.get('https://api.unsplash.com/search/photos', {
        params: { query, per_page: 3, orientation: 'squarish', content_filter: 'high' },
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        timeout: 10000,
      });
      const results = res.data.results || [];
      if (results.length > 0) {
        console.log(`    → Unsplash "${query}" → ${results.length}건`);
        return results[0].urls.regular;
      }
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn('    ⚠ Unsplash 한도 초과');
        return null;
      }
    }
  }
  return null;
}

/**
 * URL에서 이미지 다운로드
 */
async function downloadImage(url, filename) {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'hwanghon-magazine/1.0' },
      timeout: 20000,
      maxRedirects: 5,
    });
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(res.data));
    const kb = (res.data.byteLength / 1024).toFixed(0);
    console.log(`    ✓ 저장: ${filename} (${kb}KB)`);
    return filePath;
  } catch (err) {
    console.warn(`    ⚠ 다운로드 실패: ${err.message}`);
    return null;
  }
}

/**
 * Picsum 최종 폴백 (같은 키워드 → 같은 seed → 같은 사진)
 */
async function downloadPicsum(filename, seed) {
  const id = ((seed % 200) + 200) % 200; // 0~199 범위, 퀄리티 좋은 사진들
  const url = `https://picsum.photos/id/${id}/1080/1080`;
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
    });
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(res.data));
    console.log(`    ✓ Picsum 폴백: ${filename} (id=${id})`);
    return filePath;
  } catch (err) {
    console.warn(`    ⚠ Picsum 실패: ${err.message}`);
    return null;
  }
}

/**
 * 이미지 수집 메인 함수
 * items: [{ title, category, imageKeyword }]
 */
async function collectImagesForNews(items) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const keyword = resolveKeyword(item.imageKeyword || item.title, item.category);
    const keywordKo = (item.imageKeywordKo || '').trim();
    const filename = `news_${i + 1}_${Date.now()}.jpg`;

    console.log(`[${i + 1}/${items.length}] "${item.title || keyword}"`);
    if (keywordKo) console.log(`  한국어 키워드: ${keywordKo}`);
    console.log(`  영어 키워드: ${keyword}`);

    let filePath = null;
    let source = 'none';

    // 1순위: 네이버 이미지 (한국어 키워드 — 인물/뉴스에 강함)
    // link(원본) 실패 시 thumbnail(네이버 CDN)로 자동 폴백
    if (keywordKo) {
      const naverItems = await searchNaver(keywordKo);
      for (const item of naverItems) {
        const candidates = [item.link, item.thumbnail].filter(Boolean);
        for (const candidateUrl of candidates) {
          filePath = await downloadImage(candidateUrl, filename);
          if (filePath) { source = 'naver'; break; }
        }
        if (filePath) break;
      }
    }

    // 2순위: Pexels (영어 키워드)
    if (!filePath) {
      const pexelsUrl = await searchPexels(keyword);
      if (pexelsUrl) filePath = await downloadImage(pexelsUrl, filename);
      if (filePath) source = 'pexels';
    }

    // 3순위: Unsplash
    if (!filePath) {
      const unsplashUrl = await searchUnsplash(keyword);
      if (unsplashUrl) filePath = await downloadImage(unsplashUrl, filename);
      if (filePath) source = 'unsplash';
    }

    // 최종 폴백: Picsum
    if (!filePath) {
      const seed = keyword.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0) + i * 137;
      filePath = await downloadPicsum(filename, seed);
      source = 'picsum';
    }

    results.push({ articleIndex: i, title: item.title, keyword, imagePath: filePath, source });

    if (i < items.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

module.exports = { collectImagesForNews, downloadImage, resolveKeyword, searchNaver };

// 직접 실행 테스트
if (require.main === module) {
  (async () => {
    console.log('=== Pexels 이미지 수집 테스트 ===\n');
    const testItems = [
      { title: '코스피 하락', imageKeyword: 'stock market trading chart', category: '증시' },
      { title: '한국은행 총재 지명', imageKeyword: 'central bank finance Korea', category: '경제' },
      { title: '시니어 건강 관리', imageKeyword: 'senior health exercise outdoors', category: '건강' },
    ];
    const results = await collectImagesForNews(testItems);
    console.log('\n결과:', results.map(r => ({ keyword: r.keyword, source: r.source, ok: !!r.imagePath })));
  })();
}
