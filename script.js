const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const countSpan = document.getElementById('current');
const totalCountSpan = document.getElementById('total');
const logDiv = document.getElementById('log');
const peopleCountDiv = document.getElementById('people-count');
const datetimeDiv = document.getElementById('datetime');

let model;
let isRunning = false;
let currentCount = 0;
let totalCount = 0;
let trackedPeople = [];
let nextPersonId = 1;

let lastDetectionTime = 0;
const detectionInterval = 100;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logDiv.value += `[${timestamp}] ${message}\n`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function iou(boxA, boxB) {
  const [xA1, yA1, widthA, heightA] = boxA;
  const [xB1, yB1, widthB, heightB] = boxB;
  const xA2 = xA1 + widthA, yA2 = yA1 + heightA;
  const xB2 = xB1 + widthB, yB2 = yB1 + heightB;
  const x1 = Math.max(xA1, xB1), y1 = Math.max(yA1, yB1);
  const x2 = Math.min(xA2, xB2), y2 = Math.min(yA2, yB2);
  const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const unionArea = widthA * heightA + widthB * heightB - interArea;
  return interArea / unionArea;
}

function updateTrackedPeople(detections) {
  const iouThreshold = 0.3;
  const now = Date.now();
  let newDetections = 0;

  for (let det of detections) {
    const box = det.bbox;
    const matched = trackedPeople.find(tp => {
      const iouScore = iou(tp.bbox, box);
      const timeDiff = now - tp.timestamp;
      return iouScore > iouThreshold && timeDiff < 3000;
    });

    if (matched) {
      matched.bbox = box;
      matched.timestamp = now;
    } else {
      trackedPeople.push({ id: nextPersonId++, bbox: box, timestamp: now });
      newDetections++;
    }
  }

  trackedPeople = trackedPeople.filter(tp => (now - tp.timestamp) < 3000);
  return newDetections;
}

function updateDateTime() {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  datetimeDiv.textContent = `${y}/${m}/${d} ${h}:${mi}:${s}`;
}

async function detectFrame() {
  if (!isRunning) return;

  const now = performance.now();
  if (now - lastDetectionTime < detectionInterval) {
    requestAnimationFrame(detectFrame);
    return;
  }
  lastDetectionTime = now;

  try {
    const predictions = await model.detect(video);
    const people = predictions.filter(pred => pred.class === 'person' && pred.score > 0.6);

    log('detectFrame running');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    for (let person of people) {
      const [x, y, width, height] = person.bbox;
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = 'lime';
      ctx.fillText(`${(person.score * 100).toFixed(1)}%`, x, y > 10 ? y - 5 : 10);

      const matched = trackedPeople.find(tp => iou(tp.bbox, person.bbox) > 0.3);
      if (matched) {
        ctx.fillText(`ID: ${matched.id}`, x, y + height + 15);
      }
    }

    currentCount = people.length;
    countSpan.textContent = currentCount;

    const newPeople = updateTrackedPeople(people);
    if (newPeople > 0) {
      totalCount += newPeople;
      totalCountSpan.textContent = totalCount;
      log(`新しい人物 ${newPeople} 人を検出（累計 ${totalCount} 人）`);
    }
  } catch (err) {
    log(`エラー: ${err.message}`);
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
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "environment"
      }
    });
    log('カメラストリーム取得成功');
    video.srcObject = stream;

    await new Promise(resolve => {
      if (video.readyState >= 1) {
        resolve();
      } else {
        video.addEventListener('loadedmetadata', resolve, { once: true });
      }
    });

    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    return video;
  } catch (err) {
    log(`カメラの起動に失敗しました: ${err.message}`);
    throw err;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  startBtn.addEventListener('click', async () => {
    if (isRunning) return;
    isRunning = true;
    log('開始ボタンが押されました');
    log('検出を開始します…');

    try {
      await setupCamera();

      await new Promise(resolve => {
        if (video.videoWidth > 0 && video.videoHeight > 0) resolve();
        else video.onloadeddata = resolve;
      });

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      if (!model) {
        model = await cocoSsd.load();
        log('モデルをロードしました。');
      }

      detectFrame();
    } catch (err) {
      log(`初期化中にエラーが発生しました: ${err.message}`);
      isRunning = false;
    }
  });

  stopBtn.addEventListener('click', () => {
    if (!isRunning) return;
    isRunning = false;
    log('検出を停止しました。');
  });
});