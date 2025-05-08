// script.js
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const countSpan       = document.getElementById('current');
const totalCountSpan  = document.getElementById('total');
const logDiv          = document.getElementById('log');
const peopleCountDiv  = document.getElementById('people-count');
const datetimeDiv     = document.getElementById('datetime');

let model, isRunning = false;
let currentCount = 0, totalCount = 0;
let trackedPeople = [], nextPersonId = 1;
let lastDetectionTime = 0;
const detectionInterval = 100;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  logDiv.value += `[${ts}] ${msg}\n`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function iou(a, b) {
  const [x1,y1,w1,h1] = a, [x2,y2,w2,h2] = b;
  const xi1 = Math.max(x1, x2), yi1 = Math.max(y1, y2);
  const xi2 = Math.min(x1+w1, x2+w2), yi2 = Math.min(y1+h1, y2+h2);
  const inter = Math.max(0, xi2-xi1) * Math.max(0, yi2-yi1);
  return inter / (w1*h1 + w2*h2 - inter);
}

function updateTrackedPeople(dets) {
  const now = Date.now();
  let newCnt = 0;
  for (let d of dets) {
    const match = trackedPeople.find(tp => iou(tp.bbox, d.bbox)>0.3 && now-tp.ts<3000);
    if (match) {
      match.bbox = d.bbox; match.ts = now;
    } else {
      trackedPeople.push({ id: nextPersonId++, bbox: d.bbox, ts: now });
      newCnt++;
    }
  }
  trackedPeople = trackedPeople.filter(tp => Date.now()-tp.ts < 3000);
  return newCnt;
}

function updateDateTime() {
  const n = new Date();
  const y = n.getFullYear(), m = String(n.getMonth()+1).padStart(2,'0');
  const d = String(n.getDate()).padStart(2,'0');
  const h = String(n.getHours()).padStart(2,'0');
  const mi= String(n.getMinutes()).padStart(2,'0');
  const s = String(n.getSeconds()).padStart(2,'0');
  datetimeDiv.textContent = `${y}/${m}/${d} ${h}:${mi}:${s}`;
}

async function detectFrame() {
  if (!isRunning) return;
  const now = performance.now();
  if (now - lastDetectionTime < detectionInterval) {
    return requestAnimationFrame(detectFrame);
  }
  lastDetectionTime = now;

  try {
    const preds = await model.detect(video);
    const people = preds.filter(p => p.class==='person' && p.score>0.6);

    // クリアしてボックスだけ描く
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let p of people) {
      const [x,y,w,h] = p.bbox;
      ctx.strokeStyle = 'lime'; ctx.lineWidth = 2;
      ctx.strokeRect(x,y,w,h);
      ctx.fillStyle = 'lime';
      ctx.fillText(`${(p.score*100).toFixed(1)}%`, x, y>10?y-5:10);
      const m = trackedPeople.find(tp => iou(tp.bbox,p.bbox)>0.3);
      if (m) ctx.fillText(`ID:${m.id}`, x, y+h+15);
    }

    currentCount = people.length;
    countSpan.textContent = currentCount;
    const added = updateTrackedPeople(people);
    if (added>0) {
      totalCount += added;
      totalCountSpan.textContent = totalCount;
      log(`新しい人物 ${added} 人を検出（累計 ${totalCount} 人）`);
    }
  } catch (e) {
    log(`エラー: ${e.message}`);
    isRunning = false;
    return;
  }

  peopleCountDiv.textContent = `People Count: ${currentCount}`;
  updateDateTime();
  requestAnimationFrame(detectFrame);
}

async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    log('カメラストリーム取得成功');
    video.srcObject = stream;
    await new Promise(r => {
      if (video.readyState >= 1) r();
      else video.addEventListener('loadedmetadata', r, { once:true });
    });
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    return video;
  } catch (e) {
    log(`カメラの起動に失敗しました: ${e.message}`);
    throw e;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start');
  const stopBtn  = document.getElementById('stop');

  startBtn.addEventListener('click', async () => {
    if (isRunning) return;
    isRunning = true;
    log('開始ボタンが押されました');
    log('検出を開始します…');
    try {
      await setupCamera();
      if (!model) {
        model = await cocoSsd.load();
        log('モデルをロードしました');
      }
      requestAnimationFrame(detectFrame);
    } catch {
      isRunning = false;
    }
  });

  stopBtn.addEventListener('click', () => {
    if (!isRunning) return;
    isRunning = false;
    log('検出を停止しました');
  });
});
