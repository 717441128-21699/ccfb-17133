// 精简原地基-2 FFT（1024 点），用于频谱中心/平坦度分类。

export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // 位逆序置换
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + half] * cwr - im[i + k + half] * cwi;
        const vi = re[i + k + half] * cwi + im[i + k + half] * cwr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
}

export interface SpectralFeatures {
  centroid: number;
  flatness: number;
  highRatio: number;
}

/** 对一帧加 Hann 窗并计算频谱特征 */
export function spectralFeatures(frame: Float32Array, sampleRate: number): SpectralFeatures {
  const n = frame.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = frame[i] * w;
  }
  fft(re, im);
  const bins = n >> 1;
  let sumMag = 0;
  let weighted = 0;
  let logSum = 0;
  let logN = 0;
  let highEnergy = 0;
  let totalEnergy = 0;
  for (let b = 1; b < bins; b++) {
    const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    const freq = (b * sampleRate) / n;
    sumMag += mag;
    weighted += freq * mag;
    if (mag > 1e-7) {
      logSum += Math.log(mag);
      logN++;
    }
    if (freq > 2600) highEnergy += mag * mag;
    totalEnergy += mag * mag;
  }
  const centroid = sumMag > 0 ? weighted / sumMag : 0;
  const geo = logN > 0 ? Math.exp(logSum / logN) : 0;
  const flatness = sumMag > 0 ? geo / (sumMag / bins) : 0;
  const highRatio = totalEnergy > 0 ? highEnergy / totalEnergy : 0;
  return { centroid, flatness: Math.min(1, flatness), highRatio };
}
