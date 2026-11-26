// app.js — 相機 + MediaPipe + 畫面。計數規則在 counter.js，動作定義在 exercises.js。
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { DEFAULTS, calibrate, initialState, step, faceLost } from "./counter.js";
import { EXERCISES } from "./exercises.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// 校正時間軸（毫秒）：準備 2 秒 → 放鬆 3 秒 → 準備 2 秒 → 盡力 3 秒
const CALIB_STEPS = [
  { until: 2000, collect: null, text: "準備：請放鬆，看著鏡頭" },
  { until: 5000, collect: "rest", text: "放鬆不動… 3 秒" },
  { until: 7000, collect: null, text: "準備：等一下請盡力做動作並保持" },
  { until: 10000, collect: "max", text: "盡力做並保持… 3 秒" },
];

let exercise = EXERCISES.pucker;
const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");

let landmarker = null;
let mode = "idle";        // idle | calibrating | counting
let calibStart = 0;
let samples = { rest: [], max: [] };
let calib = null;
let state = initialState();
let lastVideoTime = -1;

// 給自動測試看的資訊（不影響功能）
window.__oral = { frames: 0, faces: 0, lastA: null, mode: () => mode };

$("exName").textContent = exercise.name;
$("exHint").textContent = exercise.hint;

function options() {
  return { ...DEFAULTS, holdMs: Number($("holdSel").value) * 1000 };
}

function say(text) { $("message").textContent = text; }
function status(text) { $("status").textContent = text; }
// 使用者切換動作時，清除舊資料並重新開始
function changeExercise() {
  // 取得下拉選單選擇的動作
  const selected = $("exerciseSel").value;
  exercise = EXERCISES[selected];

  // 更新畫面上的動作名稱和提示
  $("exName").textContent = exercise.name;
  $("exHint").textContent = exercise.hint;

  // 清除舊的校正資料
  calib = null;
  samples = { rest: [], max: [] };
  calibStart = 0;

  // 停止原本的校正或計數流程
  mode = "idle";

  // 清除舊的計數狀態
  state = initialState();

  // 清除校正提示
  $("calibBanner").hidden = true;

  // 尚未重新校正，因此不能使用次數歸零功能
  $("resetBtn").disabled = true;

  // 更新畫面，讓次數和進度條歸零
  render();

  // 提醒使用者重新校正
  if (landmarker) {
    say("已切換動作，請重新校正！");
    status("動作已切換，等待重新校正");
  } else {
    say("已切換動作，請先開啟相機，再進行校正");
    status("尚未開啟相機");
  }
}

async function loadModel() {
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  const base = { modelAssetPath: MODEL_URL };
  const settings = { runningMode: "VIDEO", numFaces: 1 };
  try {
    return await FaceLandmarker.createFromOptions(files, { baseOptions: { ...base, delegate: "GPU" }, ...settings });
  } catch (gpuError) {
    status(`GPU 無法使用，改用 CPU（${gpuError.message ?? gpuError}）`);
    return FaceLandmarker.createFromOptions(files, { baseOptions: { ...base, delegate: "CPU" }, ...settings });
  }
}

async function start() {
  $("startBtn").disabled = true;
  try {
    status("開啟相機中…");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    status("載入臉部特徵點模型中（第一次約需幾秒）…");
    landmarker = await loadModel();
    status("模型已載入，相機運作中");
    say("請按「校正」");
    $("calibBtn").disabled = false;
    requestAnimationFrame(loop);
  } catch (error) {
    $("startBtn").disabled = false;
    const denied = error?.name === "NotAllowedError";
    say(denied ? "相機權限被拒絕，請在瀏覽器設定中允許使用相機" : "無法啟動");
    status(`錯誤：${error?.message ?? error}`);
  }
}

function startCalibration() {
  mode = "calibrating";
  calibStart = performance.now();
  samples = { rest: [], max: [] };
  $("calibBanner").hidden = false;
  $("resetBtn").disabled = true;
}

function calibrationTick(now, a) {
  const elapsed = now - calibStart;
  const current = CALIB_STEPS.find((s) => elapsed < s.until);
  if (current) {
    $("calibBanner").textContent = current.text;
    if (current.collect && a !== null) {
      samples = { ...samples, [current.collect]: [...samples[current.collect], a] };
    }
    return;
  }
  $("calibBanner").hidden = true;
  if (!samples.rest.length || !samples.max.length) {
    mode = "idle";
    say("校正時偵測不到臉，請正對鏡頭再校正一次");
    return;
  }
  try {
    calib = calibrate(samples.rest, samples.max);
    state = initialState();
    mode = "counting";
    $("resetBtn").disabled = false;
    status(`校正完成：放鬆 ${calib.rest.toFixed(3)}，盡力 ${calib.max.toFixed(3)}`);
    say("開始練習！");
  } catch (error) {
    mode = "idle";
    say(error.message);
  }
}

function draw(landmarks) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  ctx.fillStyle = "#3ee0b4";
  for (const i of exercise.points) {
    const p = landmarks[i];
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  $("count").textContent = String(state.count);
  const pct = Math.max(0, Math.min(1, state.p)) * 100;
  $("barFill").style.width = `${pct}%`;
  const hold = options().holdMs / 1000;
  $("hold").textContent = `維持 ${(state.heldMs / 1000).toFixed(1)} / ${hold} 秒`;
  say(state.message);
}

function loop() {
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    const landmarks = result.faceLandmarks?.[0] ?? null;
    const a = landmarks ? exercise.measure(landmarks, video.videoWidth, video.videoHeight) : null;
    window.__oral = { ...window.__oral, frames: window.__oral.frames + 1, faces: window.__oral.faces + (landmarks ? 1 : 0), lastA: a };
    draw(landmarks);

    if (mode === "calibrating") {
      calibrationTick(now, a);
    } else if (mode === "counting") {
  state = a === null ? faceLost(state) : step(state, a, now, calib, options());
  render();
} else {
      status(landmarks ? "相機運作中，已偵測到臉" : "偵測不到臉：請正對鏡頭、讓臉部光線充足");
    }
  }
  requestAnimationFrame(loop);
}

$("startBtn").addEventListener("click", start);
$("calibBtn").addEventListener("click", startCalibration);
$("resetBtn").addEventListener("click", () => {
  state = initialState();
  render();
});

// 新增：選擇不同動作時執行切換函式
$("exerciseSel").addEventListener("change", changeExercise);
// 切換動作時，清除舊的校正資料並重新開始
$("exerciseSel").addEventListener("change", (event) => {
  // 根據下拉選單選擇新的動作
  exercise = EXERCISES[event.target.value];

  // 更新畫面上的動作名稱與提示
  $("exName").textContent = exercise.name;
  $("exHint").textContent = exercise.hint;

  // 清除舊的校正結果與校正樣本
  calib = null;
  samples = { rest: [], max: [] };

  // 停止目前的計數或校正流程
  mode = "idle";

  // 次數歸零，進度重新開始
  state = initialState();
  render();

  // 隱藏校正提示，並要求重新校正
  $("calibBanner").hidden = true;
  $("resetBtn").disabled = true;

  if (landmarker) {
    $("calibBtn").disabled = false;
    say("動作已切換，請重新按「校正」");
  } else {
    say("動作已切換，請先開啟相機，再重新校正");
  }

  status("已切換動作，舊的校正結果已清除");
});
