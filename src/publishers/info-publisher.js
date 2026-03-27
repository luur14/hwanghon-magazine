/**
 * 생활정보 탭 자동 등록 퍼블리셔
 * 카드뉴스 PNG를 Supabase Storage에 업로드하고 info_articles에 INSERT
 */

const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqiegpudfdfbuuqpimeg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * 카드뉴스 PNG 파일들을 Supabase Storage에 업로드하고 info_articles에 등록
 * @param {string[]} imagePaths - 렌더링된 PNG 파일 경로 배열
 * @param {object} cardData - AI 생성 카드뉴스 데이터
 * @returns {object|null} 게시 결과
 */
async function publishToInfo(imagePaths, cardData) {
  if (!SUPABASE_SERVICE_KEY) {
    console.log('  ⏭ Info: SUPABASE_SERVICE_KEY 없음, 건너뜀');
    return null;
  }

  if (!imagePaths || !imagePaths.length) {
    console.log('  ⚠ Info: 업로드할 이미지 없음');
    return null;
  }

  let createClient;
  try {
    createClient = require('@supabase/supabase-js').createClient;
  } catch {
    console.log('  ⏭ Info: @supabase/supabase-js 미설치, 건너뜀');
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = dayjs();
  const dateDir = now.format('YYYYMMDD');
  const timeDir = now.format('HHmm');

  // 1) PNG 파일들을 Storage에 업로드
  const slides = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const filePath = imagePaths[i];
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ 파일 없음: ${filePath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `${dateDir}/${timeDir}/slide_${i + 1}.png`;

    const { error: uploadError } = await supabase.storage
      .from('cardnews')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error(`  ❌ Storage 업로드 실패: ${storagePath} → ${uploadError.message}`);
      continue;
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('cardnews')
      .getPublicUrl(storagePath);

    slides.push({
      type: 'image',
      url: urlData.publicUrl,
    });
  }

  if (!slides.length) {
    console.log('  ⚠ Info: 업로드된 이미지 없음');
    return null;
  }

  // 2) info_articles에 INSERT
  const title = (cardData.coverTitle || '').replace(/\\n/g, ' ').replace(/\n/g, ' ').trim();
  const summary = cardData.coverSubtitle || cardData.edition || '';
  const tags = buildTags(cardData);

  const { data, error } = await supabase
    .from('info_articles')
    .insert({
      category_id: 'cardnews',
      title,
      summary,
      content: '',
      slides,
      tags,
      is_published: true,
      published_at: now.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error(`  ❌ Info 등록 실패: ${error.message}`);
    return null;
  }

  console.log(`  ✅ Info 등록 완료: "${title.slice(0, 30)}..." (${slides.length}장)`);
  return { articleId: data.id, slideCount: slides.length };
}

/**
 * 카드뉴스 데이터에서 태그 추출
 */
function buildTags(cardData) {
  const tags = new Set();
  tags.add('카드뉴스');

  if (cardData.coverCategory) tags.add(cardData.coverCategory);

  for (const slide of (cardData.slides || [])) {
    if (slide.category) tags.add(slide.category);
  }

  return Array.from(tags).slice(0, 5);
}

module.exports = { publishToInfo };
