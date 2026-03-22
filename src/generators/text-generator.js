const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

// .env 파일 수동 로드
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `당신은 50~60대 시니어를 위한 카드뉴스 전문 에디터입니다.

역할:
- 수집된 뉴스와 증시 데이터를 기반으로 카드뉴스 콘텐츠를 생성합니다
- 시니어가 이해하기 쉽고, 실생활에 도움이 되는 정보를 제공합니다
- 전문적이면서도 따뜻한 톤으로 작성합니다

카드뉴스 규칙:
1. 제목: 10~18자, 핵심 키워드 포함, 줄바꿈(\\n)으로 2줄 구성. 예: "코스피 6천 돌파\\n개미들의 역대급 매수"
2. 부제목: 15~25자, 제목을 보충하는 한 줄 요약
3. 요약 포인트: 반드시 3개, 각 포인트는 15~25자의 완전한 문장이어야 함
   - 좋은 예: "이달 개인 순매수 21.8조 기록", "월간 30조 돌파 가능성 높아"
   - 나쁜 예: "코트라", "눈앞", "강세장 지속" (너무 짧거나 의미 불명확)
4. 존댓말 사용 금지 (카드뉴스는 간결체)
5. 어려운 경제 용어는 쉽게 풀어서 설명
6. 금액과 수치는 구체적으로 포함 (예: "약 50만원" → "월 52만 3천원")
7. imageKeyword는 반드시 구체적인 영어 2~4단어 (예: "retirement pension planning", "stock market chart")

중요: 각 카드뉴스는 서로 다른 뉴스를 기반으로 해야 하며, 내용이 중복되면 안 됩니다.

콘텐츠 비중:
- 재테크/주식: 69%
- 정책/건강/꿀팁: 31%

응답 형식 (반드시 JSON만 출력, 다른 텍스트 없이):
{
  "cardnews": [
    {
      "category": "재테크/주식" | "정책" | "건강" | "꿀팁",
      "title": "제목줄1\\n제목줄2",
      "subtitle": "부제목 한 줄 요약",
      "summaryPoints": ["15~25자 완전한 문장1", "15~25자 완전한 문장2", "15~25자 완전한 문장3"],
      "imageKeyword": "구체적 영어 키워드 2~4단어",
      "sourceArticles": ["참고 기사 제목"]
    }
  ]
}`;

/**
 * 뉴스 데이터로 카드뉴스 텍스트 생성
 */
async function generateCardNewsText(newsData) {
  const { news, stock } = newsData;

  const newsText = news.map((n, i) =>
    `[${i + 1}] (${n.category}) ${n.title}\n   요약: ${n.summary}\n   출처: ${n.source}`
  ).join('\n\n');

  let stockText = '=== 증시 현황 ===\n';
  if (stock.domestic) {
    for (const [name, data] of Object.entries(stock.domestic)) {
      stockText += `${name.toUpperCase()}: ${data.value} (${data.change} ${data.rate})\n`;
    }
  }
  if (stock.international) {
    for (const [name, data] of Object.entries(stock.international)) {
      stockText += `${name.toUpperCase()}: ${data.value} (${data.change} ${data.rate})\n`;
    }
  }

  const userPrompt = `오늘 날짜: ${dayjs().format('YYYY년 MM월 DD일')}

아래 수집된 뉴스와 증시 데이터를 바탕으로 카드뉴스 콘텐츠 4개를 생성해주세요.
- 재테크/주식 관련: 3개 (증시 동향 1개 + 뉴스 기반 2개)
- 정책/건강/꿀팁: 1개

=== 수집된 뉴스 ===
${newsText}

${stockText}

반드시 JSON 형식으로만 응답해주세요. JSON 외 다른 텍스트를 포함하지 마세요.`;

  console.log('  Groq API 호출 중...');

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  const responseText = response.choices[0].message.content;

  // JSON 파싱
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('응답에서 JSON을 찾을 수 없습니다');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  console.log(`  ✓ 카드뉴스 ${parsed.cardnews.length}개 생성 완료`);

  return parsed;
}

/**
 * 카드뉴스 데이터를 렌더러 형식으로 변환
 */
function formatForRenderer(cardnewsResult, templateRotation = ['a', 'b', 'c']) {
  return cardnewsResult.cardnews.map((card, i) => ({
    id: `cardnews_${dayjs().format('YYYYMMDD_HHmm')}_${i + 1}`,
    date: dayjs().format('YYYY.MM.DD'),
    template: templateRotation[i % templateRotation.length],
    slides: [
      {
        category: card.category,
        title: card.title,
        subtitle: card.subtitle,
        summaryPoints: card.summaryPoints,
        imageKeyword: card.imageKeyword
      }
    ]
  }));
}

module.exports = { generateCardNewsText, formatForRenderer };

// 직접 실행 테스트
if (require.main === module) {
  (async () => {
    console.log('=== Groq 카드뉴스 텍스트 생성 테스트 ===\n');

    const testNewsData = {
      news: [
        {
          title: '금감원, 주식 유튜버·핀플루언서 24시간 모니터링',
          summary: '금융감독원이 SNS 선행매매 집중제보기간을 운영하며 소비자 보호를 강화한다.',
          source: '매일경제',
          category: '재테크/주식'
        },
        {
          title: '이달 동학개미 순매수 역대최대 눈앞',
          summary: '코스피가 6000선을 넘나드는 강세장에서 개인 투자자들의 순매수가 21.8조를 기록했다.',
          source: '매일경제',
          category: '재테크/주식'
        },
        {
          title: '국민연금 수령 나이 조정 논의 본격화',
          summary: '정부가 국민연금 수령 개시 연령을 현행 63세에서 65세로 상향하는 방안을 검토 중이다.',
          source: '연합뉴스',
          category: '정책'
        }
      ],
      stock: {
        domestic: {
          kospi: { value: '5,781.20', change: '+45.30', rate: '+0.79%' },
          kosdaq: { value: '1,161.52', change: '-12.40', rate: '-1.06%' }
        },
        international: {
          sp500: { value: '6,506.48', change: '-99.76', rate: '-1.51%' },
          nasdaq: { value: '21,647.61', change: '-443.54', rate: '-2.01%' }
        }
      }
    };

    try {
      const result = await generateCardNewsText(testNewsData);
      console.log('\n생성 결과:');
      console.log(JSON.stringify(result, null, 2));

      const formatted = formatForRenderer(result);
      console.log('\n렌더러 형식:');
      console.log(JSON.stringify(formatted, null, 2));

      fs.writeFileSync(
        path.join(__dirname, '../../output/cardnews.json'),
        JSON.stringify({ generated: result, formatted }, null, 2),
        'utf-8'
      );
      console.log('\n✓ output/cardnews.json 저장 완료');
    } catch (err) {
      console.error('에러:', err.message);
    }
  })();
}
