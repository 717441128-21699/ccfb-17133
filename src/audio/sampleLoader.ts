import { getPlay } from '../data/plays';
import { synthesizePlay } from '../audio/synth';
import { player } from '../audio/player';
import { store, set } from '../state/store';

/** 载入示例戏的“编出来的”合成演出录音到 Web Audio 引擎 */
export function loadSampleAudio(playId: string): number {
  const play = getPlay(playId);
  const { pcm, sampleRate, duration } = synthesizePlay(play);
  player.setFromPcm(pcm, sampleRate);
  set({ audioDuration: duration });
  return duration;
}

/** 进入对齐/编辑页前确保 AudioBuffer 就绪（刷新后示例录音重新合成） */
export function ensureAudioReady(): boolean {
  if (player.buffer) return true;
  if (store.audioIsSample && store.playId) {
    loadSampleAudio(store.playId);
    return true;
  }
  return false;
}
