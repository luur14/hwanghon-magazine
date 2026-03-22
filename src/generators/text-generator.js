const { GoogleGenerativeAI } = require('@google/generative-ai');
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

const SYSTEM_PROMPT = `당신은 "황혼 매거진"의 수석 카드뉴스 에디터입니다. 50~60대 시니어를 위한 경제·생활 뉴스 매거진을 만듭니다.

역할:
- 수집된 뉴스와 증시 데이터를 하나의 주제로 묶어 5장짜리 카드뉴스 세트를 만듭니다
- 독자가 실제 신문 기사를 읽는 것처럼 자연스럽고 생동감 있게 작성합니다
- 절대 AI가 쓴 것처럼 보이지 않아야 합니다. 사람이 쓴 기사 문체를 사용하세요

카드뉴스 구조 (반드시 5장):
1장 - 커버: 오늘 테마의 핵심 주제를 한눈에 보여주는 제목
2장 - 뉴스1: 오늘 테마에서 가장 중요한 뉴스 상세
3장 - 뉴스2: 오늘 테마의 두 번째 각도/뉴스
4장 - 뉴스3: 오늘 테마의 세 번째 각도/실용 정보
5장 - CTA: 오늘의 요약 + 앱 다운로드 유도

⚠️ 핵심 규칙: 슬라이드 2·3·4는 반드시 오늘의 테마 하나로만 통일. 다른 카테고리 뉴스 혼용 절대 금지.

작성 규칙:
1. 커버 제목: 반드시 \\n으로 2줄 구성. 각 줄은 공백 포함 최대 12자. 줄바꿈은 반드시 하나의 의미덩어리(구)가 끝나는 지점에서. 마지막 단어가 다음 줄에서 시작되는 의미와 연결된다면 반드시 그 단어를 다음 줄로 내려야 함. ❌ 잘못: "중동발 유가 불안 경제\\n난제와 재테크" (경제가 잘못된 줄에 위치) ✅ 올바름: "중동발 유가 불안\\n경제 난제와 재테크" / "중동 불안 고조\\n유가 급등에 추경 25조" / "한은총재 난제 직면\\n유가 불안에 추경 25조"
2. 한자(漢字) 절대 사용 금지. 모든 단어는 한글로만 표기. 發→발, 對→대, 韓→한, 億→억 등 예외 없음
3. 각 뉴스 제목: 15~25자, 핵심 키워드 포함
4. 뉴스 본문(body): 반드시 2문장 이상. 첫 문장에 핵심 사실, 두 번째 문장에 맥락·배경·의미를 담을 것. 총 130~180자. 수치와 고유명사 포함해 실제 기사처럼 작성. "~입니다" 아닌 간결체.
5. 핵심 포인트(keyPoints): 각 뉴스당 2개, 각 25~40자. 제목과 다른 내용으로, 독자가 실행할 수 있는 구체적 정보나 수치
6. 존댓말·~합니다체 사용 금지. 간결한 신문 기사체로 작성
7. 수치는 반드시 구체적으로 (예: "큰 폭 하락" → "코스피 -2.1%, 2거래일 연속 하락")
8. imageKeyword: 해당 뉴스 내용과 직접 관련된 영어 검색어 3~5단어 (예: 증시기사→"stock market trading Seoul finance", 건강기사→"senior health exercise park", 부동산→"apartment real estate city")
9. 절대 피해야 할 표현: "주목할 만합니다", "확인이 필요합니다", "살펴보겠습니다", "알아보겠습니다", keyPoints가 제목과 같은 표현 반복 금지

반드시 JSON만 출력 (다른 텍스트 없이):
{
  "edition": "3월 22일 오전 브리핑",
  "coverTitle": "커버 제목줄1\\n제목줄2",
  "coverSubtitle": "부제목 한 줄 (25자 이내)",
  "coverCategory": "오전 브리핑",
  "slides": [
    {
      "slideNum": 2,
      "category": "증시",
      "title": "뉴스 제목 (15~25자)",
      "body": "첫 번째 문장. 핵심 사실과 수치 포함. 두 번째 문장. 배경·맥락·독자에게 미치는 영향.",
      "keyPoints": ["제목과 다른 구체적 포인트1 (25~40자)", "제목과 다른 구체적 포인트2 (25~40자)"],
      "source": "출처 (매일경제, 연합뉴스 등)",
      "imageKeyword": "english keyword 3-5 words related to this news"
    }
  ],
  "ctaMessage": "오늘의 인사이트 요약 문구 (20~30자)",
  "summaryBoxes": [
    {"num": "5,781", "label": "코스피"},
    {"num": "-2.0%", "label": "나스닥"},
    {"num": "3건", "label": "오늘의 뉴스"}
  ],
  "previewItems": ["뉴스1 미리보기 12자", "뉴스2 미리보기 12자", "뉴스3 미리보기 12자"]
}`;

/**
 * Gemini Flash로 생성 시도, 실패 시 Groq 폴백
 */
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  });
  return result.response.text();
}

async function callGroq(prompt) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 3000
  });
  return response.choices[0].message.content;
}

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

  const hour = dayjs().hour();
  const timeLabel = hour < 12 ? '오전 브리핑' : '오후 브리핑';

  const theme = newsData.theme || '주식';
  const themeDesc = newsData.themeDescription || '';

  const THEME_GUIDE = {
    '주식':    '슬라이드2·3·4 모두 주식/증시/산업 소식으로만 구성. 종목, 지수, 업종 동향 중심.',
    '재테크':  '슬라이드2·3·4 모두 재테크/절약/자산관리/부동산 정보로만 구성. 50~60대가 실행 가능한 구체적 팁 포함.',
    '건강':    '슬라이드2·3·4 모두 건강/의료/식단/운동 정보로만 구성. 50~60대 시니어 맞춤 실용 정보.',
    '최신뉴스': '슬라이드2·3·4 모두 정치/사회/국제 최신 이슈로만 구성. 50~60대 관심사(복지, 정책, 사회 이슈) 중심.'
  };

  const userPrompt = `오늘 날짜: ${dayjs().format('YYYY년 MM월 DD일')}
시간대: ${timeLabel}
오늘의 테마: 【${theme}】 — ${themeDesc}

아래 수집된 뉴스와 증시 데이터로 "${dayjs().format('M월 D일')} ${timeLabel}" 카드뉴스 세트를 생성해주세요.

⚠️ 오늘은 반드시 【${theme}】 테마 하나로만 통일:
${THEME_GUIDE[theme] || ''}
다른 카테고리 뉴스는 절대 혼용하지 마세요.

구성:

=== 수집된 뉴스 ===
${newsText}

${stockText}

JSON만 출력해주세요. 마크다운 코드블록(\`\`\`) 없이 순수 JSON만.`;

  const fullPrompt = SYSTEM_PROMPT + '\n\n' + userPrompt;
  let responseText = '';

  // Gemini 우선, 실패 시 Groq 폴백
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('여기에')) {
    try {
      console.log('  Gemini Flash API 호출 중...');
      responseText = await callGemini(fullPrompt);
      console.log('  ✓ Gemini 응답 수신');
    } catch (err) {
      console.warn(`  ⚠ Gemini 실패 (${err.message.slice(0, 60)}...), Groq 폴백`);
      responseText = await callGroq(fullPrompt);
      console.log('  ✓ Groq 폴백 응답 수신');
    }
  } else {
    console.log('  Groq API 호출 중 (Gemini 키 없음)...');
    responseText = await callGroq(fullPrompt);
  }

  // JSON 추출 (```json ... ``` 또는 순수 JSON)
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    responseText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) throw new Error('응답에서 JSON을 찾을 수 없습니다:\n' + responseText.slice(0, 200));

  const rawJson = (jsonMatch[1] || jsonMatch[0]).trim();
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    console.error('JSON 파싱 실패. 원본 응답 (앞 1000자):\n' + responseText.slice(0, 1000));
    throw new Error('JSON 파싱 오류: ' + e.message);
  }
  console.log(`  ✓ 5장 카드뉴스 세트 생성 완료 (${parsed.edition})`);

  return parsed;
}

module.exports = { generateCardNewsText };

// 직접 실행 테스트
if (require.main === module) {
  (async () => {
    console.log('=== Gemini Flash 텍스트 생성 테스트 ===\n');
    const testNewsData = {
      news: [
        { title: '코스피 5,781 마감', summary: '개인 투자자 21.8조 순매수, 외국인 매도 우위', source: '매일경제', category: '재테크/주식' },
        { title: '미 나스닥 2% 급락', summary: '트럼프 관세 우려로 기술주 하락', source: '연합뉴스', category: '재테크/주식' },
        { title: '국민연금 수령 나이 65세 검토', summary: '정부 연금개혁 논의 본격화', source: '연합뉴스', category: '정책' }
      ],
      stock: {
        domestic: { kospi: { value: '5,781.20', change: '+45.30', rate: '+0.79%' }, kosdaq: { value: '1,161.52', change: '-12.40', rate: '-1.06%' } },
        international: { sp500: { value: '6,506.48', change: '-99.76', rate: '-1.51%' }, nasdaq: { value: '21,647.61', change: '-443.54', rate: '-2.01%' } }
      }
    };
    try {
      const result = await generateCardNewsText(testNewsData);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('에러:', err.message);
    }
  })();
}
