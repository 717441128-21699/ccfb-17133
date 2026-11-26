/** 多声道混为单声道 */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** 混音并线性重采样到目标采样率，保证对齐引擎参数与环境采样率无关 */
export function mixToMonoResampled(
  buffer: AudioBuffer,
  targetRate = 22050,
): { data: Float32Array; sampleRate: number } {
  const mono = mixToMono(buffer);
  if (buffer.sampleRate === targetRate) return { data: mono, sampleRate: targetRate };
  const ratio = buffer.sampleRate / targetRate;
  const outLen = Math.floor(mono.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = mono[i0] ?? 0;
    const b = mono[Math.min(mono.length - 1, i0 + 1)] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return { data: out, sampleRate: targetRate };
}

export interface Peaks {
  /** 每个像素桶的最小/最大值，长度 = buckets */
  min: Float32Array;
  max: Float32Array;
  buckets: number;
}

/** 按显示宽度（像素桶数）计算波形峰值，O(n) */
export function computePeaks(channel: Float32Array, buckets: number): Peaks {
  const b = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(b);
  const max = new Float32Array(b);
  const per = Math.floor(channel.length / b) || 1;
  for (let i = 0; i < b; i++) {
    const start = i * per;
    const end = i === b - 1 ? channel.length : start + per;
    let mn = 0;
    let mx = 0;
    // 步进抽样以加速超长音频
    const step = Math.max(1, Math.floor((end - start) / 400));
    for (let j = start; j < end; j += step) {
      const v = channel[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    min[i] = mn;
    max[i] = mx;
  }
  return { min, max, buckets: b };
}
