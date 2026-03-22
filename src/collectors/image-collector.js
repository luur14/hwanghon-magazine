const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../../output/images');

// 한국어 키워드 → 영어 검색어 매핑
const KEYWORD_MAP = {
  '주식': 'stock market trading',
  '투자': 'investment finance',
  '재테크': 'financial planning money',
  '코스피': 'korean stock market',
  '환율': 'currency exchange rate',
  '금리': 'interest rate bank',
  '부동산': 'real estate property',
  '배당': 'dividend investment',
  'ETF': 'etf index fund',
  '국민연금': 'retirement pension senior',
  '연금': 'pension retirement',
  '건강보험': 'health insurance medical',
  '건강': 'senior health wellness',
  '복지': 'social welfare elderly',
  '은퇴': 'retirement planning',
  '시니어': 'happy senior elderly',
  '정책': 'government policy document',
  '세금': 'tax finance calculator',
  '저축': 'savings piggy bank',
  '경제': 'economy business graph'
};

/**
 * 뉴스 제목에서 이미지 검색 키워드 추출
 */
function extractKeyword(title, category) {
  // 카테고리 기반 기본 키워드
  const categoryKeywords = {
    '재테크/주식': 'stock market investment',
    '정책': 'government policy senior',
    '건강': 'health wellness senior',
    '꿀팁': 'tips lifestyle senior'
  };

  // 제목에서 매칭되는 키워드 찾기
  for (const [kr, en] of Object.entries(KEYWORD_MAP)) {
    if (title.includes(kr)) {
      return en;
    }
  }

  return categoryKeywords[category] || 'business professional';
}

/**
 * Freepik에서 이미지 검색 및 URL 수집
 */
async function searchFreepikImages(keyword, count = 3) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    const searchUrl = `https://www.freepik.com/search?format=search&query=${encodeURIComponent(keyword)}&type=photo`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });

    // 이미지 URL 추출
    const images = await page.$$eval('figure img, [data-cy="asset-thumbnail"] img', (imgs, max) => {
      return imgs
        .filter(img => img.src && img.src.includes('freepik.com') && img.naturalWidth > 100)
        .slice(0, max)
        .map(img => ({
          src: img.src.replace(/w=\d+/, 'w=1200').replace(/q=\d+/, 'q=90'),
          alt: img.alt || ''
        }));
    }, count);

    return images;
  } catch (err) {
    console.warn(`  ⚠ Freepik 검색 실패 (${keyword}): ${err.message}`);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * 이미지 URL로부터 파일 다운로드
 */
async function downloadImage(url, filename) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.freepik.com/'
      },
      timeout: 10000
    });

    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(response.data));
    console.log(`    ✓ 다운로드: ${filename} (${(response.data.byteLength / 1024).toFixed(0)}KB)`);
    return filePath;
  } catch (err) {
    console.warn(`    ⚠ 다운로드 실패: ${err.message}`);
    return null;
  }
}

/**
 * 뉴스 기사 목록에 대해 이미지 수집
 */
async function collectImagesForNews(newsItems) {
  // output/images 디렉토리 초기화
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];

  for (let i = 0; i < newsItems.length; i++) {
    const article = newsItems[i];
    const keyword = extractKeyword(article.title, article.category);

    console.log(`[${i + 1}/${newsItems.length}] "${article.title}"`);
    console.log(`  검색 키워드: ${keyword}`);

    const images = await searchFreepikImages(keyword, 1);

    if (images.length > 0) {
      const filename = `news_${i + 1}_${Date.now()}.jpg`;
      const filePath = await downloadImage(images[0].src, filename);

      results.push({
        articleIndex: i,
        title: article.title,
        keyword,
        imagePath: filePath,
        imageUrl: images[0].src,
        imageAlt: images[0].alt
      });
    } else {
      console.log('    → 이미지 없음, 기본 이미지 사용');
      results.push({
        articleIndex: i,
        title: article.title,
        keyword,
        imagePath: null,
        imageUrl: null,
        imageAlt: null
      });
    }

    // Freepik 요청 간 딜레이 (봇 차단 방지)
    if (i < newsItems.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results;
}

module.exports = { collectImagesForNews, searchFreepikImages, downloadImage, extractKeyword };

// 직접 실행 테스트
if (require.main === module) {
  (async () => {
    console.log('=== Freepik 이미지 수집 테스트 ===\n');

    // 테스트용 뉴스 데이터
    const testNews = [
      { title: '코스피 6000선 돌파, 개인 투자자 순매수 역대 최대', category: '재테크/주식' },
      { title: '국민연금 수령액 인상, 2026년 변경사항 총정리', category: '정책' },
      { title: '시니어 건강관리, 봄철 운동법 추천', category: '건강' }
    ];

    const results = await collectImagesForNews(testNews);
    console.log('\n=== 결과 ===');
    console.log(JSON.stringify(results, null, 2));
  })();
}
