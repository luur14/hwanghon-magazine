/**
 * ImgBB 이미지 업로더
 * Instagram/Facebook Graph API는 공개 URL이 필요하므로 ImgBB에 먼저 업로드
 * https://api.imgbb.com
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

/**
 * 단일 이미지를 ImgBB에 업로드하고 공개 URL 반환
 */
async function uploadToImgBB(imagePath) {
  const base64 = fs.readFileSync(imagePath).toString('base64');

  const params = new URLSearchParams();
  params.append('key', IMGBB_API_KEY);
  params.append('image', base64);
  params.append('name', path.basename(imagePath, '.png'));

  const { data } = await axios.post('https://api.imgbb.com/1/upload', params, {
    timeout: 30000
  });

  return data.data.url;
}

/**
 * 여러 이미지를 ImgBB에 업로드하고 공개 URL 배열 반환
 */
async function uploadImagesToPublic(imagePaths) {
  if (!IMGBB_API_KEY) {
    throw new Error('IMGBB_API_KEY 환경변수가 없습니다. https://imgbb.com 에서 무료 발급');
  }

  console.log(`  ImgBB 업로드 중 (${imagePaths.length}장)...`);
  const urls = [];

  for (const imgPath of imagePaths) {
    const url = await uploadToImgBB(imgPath);
    urls.push(url);
    console.log(`    ✓ ${path.basename(imgPath)}`);
  }

  return urls;
}

module.exports = { uploadImagesToPublic };
