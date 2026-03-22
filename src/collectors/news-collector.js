const RssParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

const parser = new RssParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  }
});

const sources = require('../../config/sources.json');

/**
 * RSS 피드에서 뉴스 수집
 */
async function collectRSSNews() {
  const allNews = [];
  const allFeeds = [
    ...sources.news.finance,
    ...sources.news.policy,
    ...sources.news.health
  ];

  for (const source of allFeeds) {
    try {
      console.log(`  수집 중: ${source.name}...`);
      const feed = await parser.parseURL(source.url);
      const today = dayjs().format('YYYY-MM-DD');

      const articles = feed.items
        .filter(item => {
          // 오늘 날짜 또는 최근 24시간 이내 기사
          const pubDate = dayjs(item.pubDate || item.isoDate);
          return dayjs().diff(pubDate, 'hour') <= 24;
        })
        .map(item => ({
          title: item.title?.trim(),
          link: item.link,
          summary: item.contentSnippet?.trim()?.substring(0, 200) || '',
          pubDate: item.pubDate || item.isoDate,
          source: source.name,
          category: source.category
        }))
        .slice(0, 5); // 소스당 최대 5개

      allNews.push(...articles);
      console.log(`    → ${articles.length}건 수집`);
    } catch (err) {
      console.warn(`    ⚠ ${source.name} 수집 실패: ${err.message}`);
    }
  }

  return allNews;
}

/**
 * 네이버 금융에서 국내 증시 데이터 수집
 */
async function collectDomesticStock() {
  const stocks = {};

  for (const [name, url] of Object.entries(sources.stock.domestic)) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      const $ = cheerio.load(data);

      const currentValue = $('#now_value').text().trim();
      const changeValue = $('#change_value_and_rate .tah:first-child').text().trim();
      const changeRate = $('#change_value_and_rate .tah:last-child').text().trim();

      stocks[name] = {
        value: currentValue,
        change: changeValue,
        rate: changeRate,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm')
      };
      console.log(`  ${name.toUpperCase()}: ${currentValue} (${changeValue} ${changeRate})`);
    } catch (err) {
      console.warn(`  ⚠ ${name} 수집 실패: ${err.message}`);
    }
  }

  return stocks;
}

/**
 * Yahoo Finance에서 해외 증시 데이터 수집
 */
async function collectInternationalStock() {
  const stocks = {};

  for (const [name, url] of Object.entries(sources.stock.international)) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      const result = data.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose;
        const change = (price - prevClose).toFixed(2);
        const changeRate = ((change / prevClose) * 100).toFixed(2);

        stocks[name] = {
          value: price.toLocaleString(),
          change: change > 0 ? `+${change}` : change.toString(),
          rate: `${changeRate}%`,
          timestamp: dayjs().format('YYYY-MM-DD HH:mm')
        };
        console.log(`  ${name.toUpperCase()}: ${price.toLocaleString()} (${changeRate}%)`);
      }
    } catch (err) {
      console.warn(`  ⚠ ${name} 수집 실패: ${err.message}`);
    }
  }

  return stocks;
}

/**
 * 시니어 키워드 관련 뉴스 필터링
 */
function filterSeniorRelevant(news) {
  const keywords = [...sources.keywords.senior, ...sources.keywords.finance];

  return news.filter(article => {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    return keywords.some(kw => text.includes(kw.toLowerCase()));
  });
}

/**
 * 전체 수집 실행
 */
async function collectAll() {
  console.log('=== 뉴스 & 증시 수집 시작 ===');
  console.log(`시간: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n`);

  // 1. RSS 뉴스 수집
  console.log('[1/3] RSS 뉴스 수집...');
  const rawNews = await collectRSSNews();
  console.log(`  총 ${rawNews.length}건 수집\n`);

  // 2. 시니어 관련 필터링
  const filteredNews = filterSeniorRelevant(rawNews);
  console.log(`[필터링] 시니어 관련: ${filteredNews.length}건\n`);

  // 필터링 안 된 것도 포함 (재테크 카테고리는 전부)
  const financeNews = rawNews.filter(n => n.category === '재테크/주식');
  const policyNews = filteredNews.filter(n => n.category !== '재테크/주식');
  const finalNews = [...new Map([...financeNews, ...policyNews].map(n => [n.link, n])).values()];

  // 3. 증시 데이터 수집
  console.log('[2/3] 국내 증시 수집...');
  const domesticStock = await collectDomesticStock();

  console.log('\n[3/3] 해외 증시 수집...');
  const internationalStock = await collectInternationalStock();

  // 결과 저장
  const result = {
    collectedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    news: finalNews,
    stock: {
      domestic: domesticStock,
      international: internationalStock
    },
    stats: {
      totalRaw: rawNews.length,
      totalFiltered: finalNews.length,
      byCategory: {
        finance: financeNews.length,
        policy: policyNews.length
      }
    }
  };

  const outputPath = path.join(__dirname, '../../output/news.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n=== 수집 완료 → ${outputPath} ===`);
  console.log(`뉴스 ${finalNews.length}건, 증시 국내 ${Object.keys(domesticStock).length}개 + 해외 ${Object.keys(internationalStock).length}개\n`);

  return result;
}

module.exports = { collectAll, collectRSSNews, collectDomesticStock, collectInternationalStock };

// 직접 실행
if (require.main === module) {
  collectAll().catch(console.error);
}
