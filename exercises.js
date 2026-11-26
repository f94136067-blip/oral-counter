// exercises.js — 每個動作「量什麼」
//
// MediaPipe Face Landmarker 每張臉給 478 個點，每個點有 x、y（0～1，相對於畫面寬、高）。
// 我們把距離換成像素再相除，所以結果和人離鏡頭多遠無關。
// 特徵點編號可查官方的 face mesh 對照圖（README 有連結）。


// exercises.js — 每個動作「量什麼」

export const LM = Object.freeze({
  mouthLeft: 61,    // 左嘴角
  mouthRight: 291,  // 右嘴角
  upperLipIn: 13,   // 上唇內緣中央
  lowerLipIn: 14,   // 下唇內緣中央
  faceLeft: 234,    // 左臉外緣
  faceRight: 454,   // 右臉外緣
});

// 兩點距離公式（換算成像素）
export function dist(p, q, width, height) {
  const dx = (p.x - q.x) * width;
  const dy = (p.y - q.y) * height;
  return Math.hypot(dx, dy);
}

export function faceWidth(lm, width, height) {
  return dist(
    lm[LM.faceLeft],
    lm[LM.faceRight],
    width,
    height
  );
}

export const EXERCISES = Object.freeze({
  // 原本的嘟嘴動作
  pucker: Object.freeze({
    name: "嘟嘴",
    hint: "嘴唇往前嘟起來，像要親親",
    points: [
      LM.mouthLeft,
      LM.mouthRight,
      LM.faceLeft,
      LM.faceRight
    ],
    measure: (lm, width, height) =>
      dist(
        lm[LM.mouthLeft],
        lm[LM.mouthRight],
        width,
        height
      ) / faceWidth(lm, width, height),
  }),

  // 新增：張大嘴動作
  mouthOpen: Object.freeze({
    name: "張大嘴",
    hint: "嘴巴盡量張大",
    points: [
      LM.upperLipIn,
      LM.lowerLipIn,
      LM.faceLeft,
      LM.faceRight
    ],
    measure: (lm, width, height) =>
      dist(
        lm[LM.upperLipIn],  // 上唇內緣（13）
        lm[LM.lowerLipIn],  // 下唇內緣（14）
        width,
        height
      ) / faceWidth(lm, width, height),
  }),

  // 新增動作：一笑呷百二（咧嘴笑）
  smile: Object.freeze({
    name: "一笑呷百二（咧嘴笑）",
    hint: "嘴角向左右兩側盡量拉開，露出笑容",
    // 嘴角兩點 + 臉部左右兩側
    points: [LM.mouthLeft, LM.mouthRight, LM.faceLeft, LM.faceRight],
    // 嘴角距離除以臉寬，咧嘴笑時數值會變大
    measure: (lm, width, height) =>
      dist(lm[LM.mouthLeft], lm[LM.mouthRight], width, height) /
      faceWidth(lm, width, height),
});
