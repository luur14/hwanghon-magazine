const RssParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
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
 * 시간대별 테마 결정
 * - 아침 8시 (06:00~11:59): 주식 고정
 * - 낮 2시  (12:00~17:59): 재테크 / 건강 격일 교대
 * - 저녁 8시 (18:00~05:59): 최신뉴스 고정
 */
function getTodayTheme() {
  const kst = dayjs().tz('Asia/Seoul');
  const hour = kst.hour();
  const dayIndex = kst.diff(dayjs('2026-01-01'), 'day');

  if (hour >= 6 && hour < 12) {
    return '주식';
  } else if (hour >= 12 && hour < 18) {
    return dayIndex % 2 === 0 ? '재테크' : '건강';
  } else {
    return '최신뉴스';
  }
}

/**
 * 특정 테마의 RSS 피드에서 뉴스 수집
 */
async function collectRSSNews(theme) {
  const allNews = [];
  const themeSources = sources.themes[theme]?.sources || [];

  for (const source of themeSources) {
    try {
      console.log(`  수집 중: ${source.name}...`);
      const feed = await parser.parseURL(source.url);

      const articles = feed.items
        .filter(item => {
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
        .slice(0, 5);

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
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
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
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
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
 * 전체 수집 실행
 */
async function collectAll() {
  const theme = getTodayTheme();
  const themeInfo = sources.themes[theme];

  console.log('=== 뉴스 & 증시 수집 시작 ===');
  console.log(`시간: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
  console.log(`오늘의 테마: 【${theme}】 — ${themeInfo.description}\n`);

  // 1. 테마 RSS 뉴스 수집
  console.log(`[1/3] ${theme} 뉴스 수집...`);
  const rawNews = await collectRSSNews(theme);
  console.log(`  총 ${rawNews.length}건 수집\n`);

  // 중복 제거 (링크 기준)
  const finalNews = [...new Map(rawNews.map(n => [n.link, n])).values()];

  // 2. 증시 데이터 수집
  console.log('[2/3] 국내 증시 수집...');
  const domesticStock = await collectDomesticStock();

  console.log('\n[3/3] 해외 증시 수집...');
  const internationalStock = await collectInternationalStock();

  const result = {
    collectedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    theme,
    themeDescription: themeInfo.description,
    news: finalNews,
    stock: {
      domestic: domesticStock,
      international: internationalStock
    },
    stats: {
      totalRaw: rawNews.length,
      totalFiltered: finalNews.length
    }
  };

  const outputPath = path.join(__dirname, '../../output/news.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n=== 수집 완료 → ${outputPath} ===`);
  console.log(`테마: ${theme} | 뉴스 ${finalNews.length}건 | 증시 국내 ${Object.keys(domesticStock).length}개 + 해외 ${Object.keys(internationalStock).length}개\n`);

  return result;
}

module.exports = { collectAll, collectRSSNews, collectDomesticStock, collectInternationalStock, getTodayTheme };

if (require.main === module) {
  collectAll().catch(console.error);
}
