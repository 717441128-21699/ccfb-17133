# 影戏字幕工坊 · 皮影戏唱本对齐与双语字幕

非遗皮影戏录音 / 视频的方言唱本自动对齐、双语字幕编辑与导出烧录工具。
纯前端 TypeScript 单页应用：**对齐计算在 Web Worker 中完成，波形与试听使用 Web Audio API + Canvas，文件不上传服务器**。

内置三出**虚构**的皮影戏（陇东方言《王贵赶脚》、陕北/晋西方言《绣荷包》、关中方言《逛庙会》），
方言唱词、普通话释义以及“演出录音”均由程序编配 / 合成，专门埋入了漏句、临场衬字、长拖腔与锣鼓过门，
保证一键就能看到题目要求的全部标黄 / 灰字 / 拖腔 / 过门避让效果。

---

## 快速开始

```bash
npm install
npm run dev        # 打开终端提示的 http://127.0.0.1:5188
```

生产构建与本地预览：

```bash
npm run build      # tsc 类型检查 + vite 打包（含独立 worker chunk）
npm run preview    # 静态预览
```

自检：

```bash
npm run selftest       # Node 中跑 合成 → DSP → 两级对齐 → cue 规则 → SRT/VTT/ASS 全链路断言
npm run check:browser  # 需先在 4190 端口跑 preview；真实 Chrome 验证 Worker 对齐、拖拽、标黄、灰字、SRT 下载
npm run check:burn     # 真实 Chrome 验证 MediaRecorder 烧录帧、SRT BOM/CRLF、两小时规模基准
```

---

## 四个页面

| 页面 | 功能 |
| --- | --- |
| **① 唱本导入** | 三出示例戏卡片；粘贴 / 上传 `.txt` / `.json` 唱本（支持 `【唱】`/`【白】` 标记与 `方言 \|\| 普通话` 格式）；上传自己的录音 / 视频；示例录音由 PCM 合成器现场生成 |
| **② 录音对齐** | 一键在 Web Worker 中跑完整对齐，实时进度；输出统计、漏句 / 衬字 / 拖腔 / 过门清单；可运行“两小时规模性能自测” |
| **③ 字幕编辑** | Canvas 波形（峰值、过门阴影、唱腔/道白/漏句色块、逐字边界）；**鼠标拖动 cue 左右边界微调（自动吸附音节）**；Web Audio 播放 / 试听本句；黄句、灰衬字、拖腔标记；逐字时间编辑；普通话行编辑；空格播放、←/→ 快退快进 |
| **④ 导出** | SRT / WebVTT / ASS / JSON；行数与双语选项；实时文件预览；SRT 可选 UTF-8 BOM、统一 CRLF；浏览器内 Canvas + MediaRecorder **直接把双语字幕烧进视频**（WebM/MP4 视浏览器支持）；并给出 FFmpeg + ASS 压 MP4 命令 |

工程（唱本、对齐结果、字幕修改、设置）自动保存到 `localStorage`，顶栏“新工程”可清空。

---

## 题目硬性要求与实现位置

1. **唱本有、艺人没唱的句子 → 编辑页整卡标黄提醒**
   句级 DP 把该句判为 deletion（`AlignedLine.matched=false`），生成 `missingLine` cue，
   编辑页黄底卡片 + ⚠ 警示条 + 黄色波形块；默认不导出，可勾选“导出此句”。
2. **临场加的衬字 → 单独显示成灰字**
   字级 NW 对齐把多余音节判为 insertion，标记 `TimeChar.adlib`；
   编辑页灰色斜体字（`.tok-adlib`），**双击可改成实际字音**；导出文本包含衬字。
3. **一个字拖腔超过 3 秒，它的字幕不能提前消失**
   DSP 段长即拖腔总时长；`buildCues()` 对 `end-start ≥ longToneThreshold` 的字，
   强制 `cue.end ≥ 拖腔字.end + holdTail(0.6s)`；编辑页有“拖”角标，阈值滑块可即时重算。
4. **锣鼓过门 / 纯器乐段落不出字幕**
   频谱 + 自相关分类出 percussion 段并合并为“锣鼓过门”，未匹配乐句作为“器乐过门”；
   `buildCues()` 让每个 cue 与过门区间做避让截断，自测用 `findInterludeConflicts()`
   断言“导出 cue 与过门零时间冲突”。

其他要求：

- **一行不超过 N 字自动断行**：`wrapLine()` 按字数贪心断行并优先在标点后断；
  编辑页按同样规则分行渲染，SRT/VTT/ASS 导出时套用，N 可在 8–24 之间调节。
- **方言行下面配普通话释义行**：每个 cue 先方言断行，再附普通话行；ASS 用独立 `Mandarin` 样式。
- **两小时一出戏对齐不超过 5 分钟**：算法为 O(采样数) DSP + 句/字两级带状 DP。
  Worker 内“规模自测”模拟 1000 句 / 1.4 万字 / 2.4 万音节段，DP 实测约 9–24s（机器不同），
  叠加两小时 PCM 的 O(N) 分析保守约 45s，整体外推 **约 1 分钟，远低于 5 分钟**。
- **导出文件能被常见播放器正确读出**：标准 SRT 序号 + `HH:MM:SS,mmm` + CRLF，
  默认写 UTF-8 BOM（Windows 播放器兼容）；VTT 头正确；ASS 为标准 v4.00+ 结构。
  已用 Chrome 真实下载验证 `BOM=true, CRLF=true`。

---

## 对齐引擎原理

```
PCM (主线程 AudioBuffer / 合成器)
   └─ transfer 给 Web Worker
       ├─ DSP (src/align/dsp.ts)
       │    分帧 RMS/过零率 + 512 点 FFT 频谱质心/平坦度
       │    噪声底自适应 VAD → 能量凹陷细分音节
       │    YIN 累积均值归一化基频（早/中/晚三窗 + 八度折叠）
       │    分类：唱腔 / 道白 / 锣鼓(钹锣鼓舞特征) / 未知
       ├─ 按停顿聚成“乐句”
       ├─ 句 ↔ 乐句 全局 DP（跳过漏句 / 额外器乐段）
       └─ 句内 字 ↔ 音节 Needleman–Wunsch
            匹配分 = 音高锚点码 +10 / 半音邻近分 + 时长先验 + 唱腔道白一致性
            insertion/deletion 局部 gap → 衬字 / 漏字，不会整段错位
```

**关于“音高锚点码”的诚实说明**：真实方言录音没有逐字绝对音高锚点。
因为内置示例录音是我们自己合成的，合成器按字符的确定性哈希映射到十二平均律音高
（`src/audio/pitchcode.ts`），Worker 用 YIN 还原该音级，相当于一个用于 demo 的
“微型声学模型”，保证漏句位置、衬字位置与衬字原字稳定可复现。
对用户上传的真实录音，`pitchCode=-1`，引擎退化为能量分段 + 时长 / 序列模糊匹配，
所有边界仍可在波形上手工拖动校正——这正是字幕员的工作流。

衬字原字通过“装饰音特征（短 + 甩腔滑音）+ 音级反查 `PARTICLE_CODES` / 循环最近音级”得到
（哎/呀/啊/哟/嗨/咦/哦/喏），识别不出时显示为“衬”，双击即可改字。

---

## 目录结构

```
src/
  types.ts                 全部领域类型
  data/plays.ts            三出虚构方言戏 + 漏句/衬字/拖腔/锣鼓编排
  audio/
    synth.ts               纯 PCM 合成：唱腔/道白/鼓/锣/钹/拨弦 + WAV 编码
    pitchcode.ts           合成示例的音高锚点与衬字音级码表
    player.ts              Web Audio 播放引擎（区间试听、rAF 时间订阅）
    burn.ts                Canvas + MediaRecorder 烧录
  align/
    fft.ts                 精简 FFT
    dsp.ts                 VAD / YIN / 分类 / 碎片合并
    engine.ts              两级模糊 DP
    align.worker.ts        Web Worker 入口
    runner.ts              Worker Promise 客户端
    bench.ts               两小时规模基准
  subtitles/cues.ts        cue 生成：断行/拖腔保持/过门避让
  subtitles/render.ts      标点 + 衬字合并的渲染序列
  export/formats.ts        SRT/VTT/ASS/JSON + 下载
  ui/pages/                import / align / editor / export 四页
  ui/components/waveform.ts Canvas 波形与边界拖拽
  state/store.ts           全局 store + localStorage
scripts/
  selftest.ts              Node 全链路断言（npm run selftest）
  browser-check.mjs        Puppeteer 交互/下载回归
  browser-burn-check.mjs   烧录与基准回归
```

## 技术栈

TypeScript 5.9（strict）、Vite 6、Web Worker（Vite `?worker`）、Web Audio API、
Canvas 2D、MediaRecorder、原生 DOM（无重型框架）、esbuild 跑 Node 自测、Puppeteer-core 做浏览器验证。
