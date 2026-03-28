/**
 * 네이버 뉴스 검색 API 수집기
 * 시니어 관심 키워드별 뉴스를 검색하여 반환
 */

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 시니어 관심 키워드 + 앱 카테고리 매핑
const SEARCH_KEYWORDS = [
  { keyword: '연금 노후 준비', category: '연금·노후', display: 5 },
  { keyword: '시니어 건강 관리', category: '건강·의료', display: 5 },
  { keyword: '50대 재테크 투자', category: '재테크·투자', display: 5 },
  { keyword: '부동산 시장 전망', category: '재테크·투자', display: 3 },
  { keyword: '시니어 일자리 재취업', category: '세금·절세', display: 3 },
  { keyword: '노인 복지 정책', category: '연금·노후', display: 3 },
];

/**
 * HTML 태그 제거 + 엔티티 디코딩
 */
function cleanHtml(str) {
  return str
    .replace(/<\/?b>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * 네이버 뉴스 검색 API 호출
 */
async function searchNaverNews(keyword, display = 5) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return [];
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=date`;

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });

  if (!res.ok) {
    console.error(`  ❌ 네이버 뉴스 검색 실패 (${keyword}): ${res.status}`);
    return [];
  }

  const data = await res.json();
  return (data.items ?? []).map(item => ({
    title: cleanHtml(item.title),
    description: cleanHtml(item.description),
    link: item.originallink || item.link,
    pubDate: item.pubDate,
    source: extractSource(item.originallink || item.link),
  }));
}

/**
 * URL에서 언론사 이름 추출
 */
function extractSource(url) {
  try {
    const hostname = new URL(url).hostname;
    const sourceMap = {
      'news.jtbc.co.kr': 'JTBC',
      'www.chosun.com': '조선일보',
      'www.donga.com': '동아일보',
      'www.hani.co.kr': '한겨레',
      'www.khan.co.kr': '경향신문',
      'www.mk.co.kr': '매일경제',
      'www.hankyung.com': '한국경제',
      'www.sedaily.com': '서울경제',
      'www.yna.co.kr': '연합뉴스',
      'news.kbs.co.kr': 'KBS',
      'www.mbc.co.kr': 'MBC',
      'www.sbs.co.kr': 'SBS',
      'www.ytn.co.kr': 'YTN',
      'www.nocutnews.co.kr': '노컷뉴스',
      'www.newsis.com': '뉴시스',
      'www.edaily.co.kr': '이데일리',
      'biz.heraldcorp.com': '헤럴드경제',
      'www.fnnews.com': '파이낸셜뉴스',
    };
    return sourceMap[hostname] || hostname.replace('www.', '').replace('.co.kr', '').replace('.com', '');
  } catch {
    return '';
  }
}

/**
 * 모든 키워드에 대해 뉴스 수집
 * @returns {{ news: Array, keyword: string, category: string }[]}
 */
async function collectNaverNews() {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.log('  ⏭ 네이버 뉴스: NAVER_CLIENT_ID/SECRET 없음, 건너뜀');
    return [];
  }

  console.log('━━━ 네이버 뉴스 수집 ━━━');

  const allNews = [];
  const seenTitles = new Set();

  for (const { keyword, category, display } of SEARCH_KEYWORDS) {
    const items = await searchNaverNews(keyword, display);

    for (const item of items) {
      // 중복 제거 (제목 기준)
      if (seenTitles.has(item.title)) continue;
      seenTitles.add(item.title);

      allNews.push({
        ...item,
        category,
        keyword,
      });
    }

    console.log(`  ✅ "${keyword}" → ${items.length}건`);

    // API 호출 간격 (rate limit 방지)
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  📊 총 ${allNews.length}건 수집 (중복 제거 후)\n`);
  return allNews;
}

module.exports = { collectNaverNews };
