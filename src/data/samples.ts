import type { Show } from '../types/domain';

/**
 * 三出自编的方言皮影戏。
 * 方言文本采用关中方言风味的拟写，仅供演示；
 * perf 字段描述老艺人实际演出时的拖腔、衬字、漏句与锣鼓过门，
 * scripts/generate-samples.ts 据此合成“演出录音” WAV。
 * 对齐引擎只分析音频特征与唱本，不读取 perf 中的时间结论。
 */
export const SAMPLE_SHOWS: Show[] = [
  {
    id: 'jieshan',
    title: '借芭蕉扇',
    troupe: '秦川老腔皮影班',
    category: '神话武戏',
    summary: '《西游记》片段：孙悟空三调芭蕉扇。老腔高亢，锣鼓激烈，含一处漏唱长句与多处衬字。',
    audioFile: 'samples/jieshan.wav',
    builtin: true,
    script: [
      {
        id: 'js-l1',
        kind: 'sing',
        role: '孙悟空',
        dialect: '河东城刮起了呼呼大风，',
        mandarin: '河东一带刮起了呼呼大风，',
      },
      {
        id: 'js-l2',
        kind: 'sing',
        role: '孙悟空',
        dialect: '半空中来了我齐天大圣。',
        mandarin: '半空中来了我齐天大圣。',
      },
      {
        id: 'js-l3',
        kind: 'speak',
        role: '铁扇公主',
        dialect: '呔！你这泼猴，又来做甚？',
        mandarin: '站住！你这猴子，又来干什么？',
      },
      {
        id: 'js-l4',
        kind: 'speak',
        role: '孙悟空',
        dialect: '嫂嫂息怒，借扇一用。',
        mandarin: '嫂嫂别生气，把扇子借我用一下。',
      },
      {
        id: 'js-l5',
        kind: 'sing',
        role: '铁扇公主',
        dialect: '恨只恨孙悟空害我孩儿红孩儿做了那善财童子！',
        mandarin: '都怪孙悟空害得我儿子红孩儿被观音收去做了善财童子！',
      },
      {
        id: 'js-l6',
        kind: 'sing',
        role: '铁扇公主',
        dialect: '那芭蕉宝扇怎肯借与你？',
        mandarin: '这芭蕉宝扇我怎么肯借给你？',
      },
      {
        id: 'js-l7',
        kind: 'sing',
        role: '孙悟空',
        dialect: '你若不借，我便不走！',
        mandarin: '你要是不借，我就不走了！',
      },
      {
        id: 'js-l8',
        kind: 'sing',
        role: '孙悟空',
        dialect: '看金箍棒扫平火焰山冈！',
        mandarin: '看我用金箍棒扫平火焰山！',
      },
    ],
    perf: {
      intro: { sec: 3.4, type: 'luogu' },
      outro: { sec: 3.0, type: 'luogu' },
      lines: {
        'js-l1': {
          lineId: 'js-l1',
          charDur: 0.34,
          extras: [{ after: 0, ch: '呀', dur: 0.34 }],
          gapAfter: { sec: 0.7, type: 'silence' },
        },
        'js-l2': {
          lineId: 'js-l2',
          charDur: 0.36,
          drag: { 9: 2.6 },
          gapAfter: { sec: 0.9, type: 'silence' },
        },
        'js-l3': { lineId: 'js-l3', charDur: 0.17, gapAfter: { sec: 0.55, type: 'silence' } },
        'js-l4': {
          lineId: 'js-l4',
          charDur: 0.18,
          extras: [{ after: 8, ch: '哩', dur: 0.16 }],
          gapAfter: { sec: 0.7, type: 'silence' },
        },
        // 艺人临场漏唱了这一长句 —— 对齐后应在编辑页标黄
        'js-l5': {
          lineId: 'js-l5',
          sung: false,
          gapAfter: { sec: 2.0, type: 'luogu' },
        },
        'js-l6': {
          lineId: 'js-l6',
          charDur: 0.4,
          extras: [{ after: 0, ch: '哎', dur: 0.42 }],
          gapAfter: { sec: 0.8, type: 'silence' },
        },
        'js-l7': {
          lineId: 'js-l7',
          charDur: 0.38,
          extras: [{ after: 8, ch: '嗨', dur: 0.3 }],
          gapAfter: { sec: 0.7, type: 'silence' },
        },
        'js-l8': {
          lineId: 'js-l8',
          charDur: 0.42,
          // 末字拖腔 3.8 秒 —— 字幕不得提前消失
          drag: { 9: 3.8 },
          gapAfter: { sec: 1.2, type: 'luogu' },
        },
      },
    },
  },
  {
    id: 'maixian',
    title: '王货郎卖线',
    troupe: '碗碗腔皮影社',
    category: '乡土喜剧文戏',
    summary: '货郎下乡与桃花姑娘的一段买卖趣事，道白密集，含纯器乐过门、句中衬字与一处漏句。',
    audioFile: 'samples/maixian.wav',
    builtin: true,
    script: [
      { id: 'mx-l1', kind: 'sing', role: '王货郎', dialect: '肩挑着货担走四方，', mandarin: '我挑着货担走村串乡，' },
      { id: 'mx-l2', kind: 'sing', role: '王货郎', dialect: '针头线脑样样全。', mandarin: '缝衣针、线头、零碎百货样样齐全。' },
      { id: 'mx-l3', kind: 'speak', role: '桃花', dialect: '门外摇拨浪鼓的，可是卖线的货郎？', mandarin: '门外摇拨浪鼓的那位，是卖线的货郎吗？' },
      { id: 'mx-l4', kind: 'speak', role: '王货郎', dialect: '正是正是，姑娘要买些什么？', mandarin: '正是我，姑娘想买点什么？' },
      { id: 'mx-l5', kind: 'speak', role: '桃花', dialect: '要三根绣花针，两丈红头绳。', mandarin: '我要三根绣花针，两丈长的红头绳。' },
      { id: 'mx-l6', kind: 'speak', role: '王货郎', dialect: '好嘞，针要大号还是小号？', mandarin: '好咧，针要粗的还是细的？' },
      { id: 'mx-l7', kind: 'sing', role: '桃花', dialect: '桃花女开门来笑脸相迎，', mandarin: '我桃花打开门，笑着把客人迎进来，' },
      {
        id: 'mx-l8',
        kind: 'sing',
        role: '王货郎',
        dialect: '多谢那好姑娘照顾我这小本生意呀！',
        mandarin: '多谢好姑娘关照我这小买卖！',
      },
      { id: 'mx-l9', kind: 'speak', role: '桃花', dialect: '明日可还来么？', mandarin: '明天你还来不来？' },
      { id: 'mx-l10', kind: 'sing', role: '王货郎', dialect: '拨浪鼓一摇转过了村庄。', mandarin: '拨浪鼓一摇，我又转去别的村子了。' },
    ],
    perf: {
      intro: { sec: 2.6, type: 'instrumental' },
      outro: { sec: 2.4, type: 'instrumental' },
      lines: {
        'mx-l1': {
          lineId: 'mx-l1',
          charDur: 0.34,
          extras: [{ after: 0, ch: '哎', dur: 0.4 }],
          gapAfter: { sec: 4.2, type: 'instrumental' },
        },
        'mx-l2': {
          lineId: 'mx-l2',
          charDur: 0.33,
          // 句中衬字：唱到“线脑”后加一个“呀”
          extras: [{ after: 4, ch: '呀', dur: 0.18 }],
          gapAfter: { sec: 0.8, type: 'silence' },
        },
        'mx-l3': { lineId: 'mx-l3', charDur: 0.16, gapAfter: { sec: 0.5, type: 'silence' } },
        'mx-l4': { lineId: 'mx-l4', charDur: 0.17, gapAfter: { sec: 0.5, type: 'silence' } },
        'mx-l5': {
          lineId: 'mx-l5',
          charDur: 0.17,
          extras: [{ after: 11, ch: '哟', dur: 0.2 }],
          gapAfter: { sec: 0.5, type: 'silence' },
        },
        'mx-l6': { lineId: 'mx-l6', charDur: 0.18, gapAfter: { sec: 0.7, type: 'silence' } },
        'mx-l7': { lineId: 'mx-l7', charDur: 0.38, gapAfter: { sec: 0.7, type: 'silence' } },
        // 漏唱的长句（全本最长的一句，便于自动定位）
        'mx-l8': { lineId: 'mx-l8', sung: false, gapAfter: { sec: 1.4, type: 'silence' } },
        'mx-l9': { lineId: 'mx-l9', charDur: 0.18, gapAfter: { sec: 0.6, type: 'silence' } },
        'mx-l10': {
          lineId: 'mx-l10',
          charDur: 0.4,
          drag: { 9: 3.3 },
          extras: [{ after: 10, ch: '喽', dur: 0.3 }],
          gapAfter: { sec: 1.0, type: 'silence' },
        },
      },
    },
  },
  {
    id: 'shibali',
    title: '十八里相送',
    troupe: '东路皮影传世班',
    category: '文戏唱功戏',
    summary: '梁山伯与祝英台十八里相送，唱腔婉转、拖腔绵长，含两处超过三秒的长拖腔与一处漏句。',
    audioFile: 'samples/shibali.wav',
    builtin: true,
    script: [
      { id: 'sb-l1', kind: 'sing', role: '祝英台', dialect: '书房门前一枝梅，', mandarin: '书房门前长着一枝梅花，' },
      { id: 'sb-l2', kind: 'sing', role: '梁山伯', dialect: '树上鸟儿对打对。', mandarin: '树上的鸟儿成双成对。' },
      { id: 'sb-l3', kind: 'sing', role: '祝英台', dialect: '喜鹊满树喳喳叫，', mandarin: '满树喜鹊喳喳地叫，' },
      { id: 'sb-l4', kind: 'sing', role: '梁山伯', dialect: '报与梁兄喜双眉。', mandarin: '像是给梁兄你报喜呢。' },
      { id: 'sb-l5', kind: 'sing', role: '祝英台', dialect: '梁兄送我到九曲溪，', mandarin: '梁兄送我送到九曲溪边，' },
      {
        id: 'sb-l6',
        kind: 'sing',
        role: '祝英台',
        dialect: '溪水里鸳鸯成对白鹅交颈相依偎！',
        mandarin: '溪水里鸳鸯成对、白鹅脖子挨着脖子，多亲热呀！',
      },
      { id: 'sb-l7', kind: 'sing', role: '梁山伯', dialect: '贤弟说话巧比方，', mandarin: '贤弟你说话真会打比方，' },
      { id: 'sb-l8', kind: 'sing', role: '祝英台', dialect: '声声相送十八里长。', mandarin: '一声一声，送了十八里那么长。' },
    ],
    perf: {
      intro: { sec: 4.2, type: 'instrumental' },
      outro: { sec: 3.2, type: 'luogu' },
      lines: {
        'sb-l1': {
          lineId: 'sb-l1',
          charDur: 0.46,
          drag: { 6: 3.1 },
          extras: [{ after: 0, ch: '啊', dur: 0.5 }],
          gapAfter: { sec: 1.0, type: 'silence' },
        },
        'sb-l2': { lineId: 'sb-l2', charDur: 0.46, gapAfter: { sec: 1.0, type: 'silence' } },
        'sb-l3': {
          lineId: 'sb-l3',
          charDur: 0.44,
          extras: [{ after: 7, ch: '喳', dur: 0.3 }],
          gapAfter: { sec: 0.9, type: 'silence' },
        },
        'sb-l4': { lineId: 'sb-l4', charDur: 0.46, gapAfter: { sec: 1.1, type: 'silence' } },
        'sb-l5': { lineId: 'sb-l5', charDur: 0.48, gapAfter: { sec: 0.9, type: 'silence' } },
        // 漏唱的长句
        'sb-l6': { lineId: 'sb-l6', sung: false, gapAfter: { sec: 1.6, type: 'instrumental' } },
        'sb-l7': { lineId: 'sb-l7', charDur: 0.46, gapAfter: { sec: 1.0, type: 'silence' } },
        'sb-l8': {
          lineId: 'sb-l8',
          charDur: 0.5,
          // “长”字拖腔 4.4 秒
          drag: { 7: 4.4 },
          gapAfter: { sec: 1.4, type: 'silence' },
        },
      },
    },
  },
];

export function getSampleShow(id: string): Show | undefined {
  return SAMPLE_SHOWS.find((s) => s.id === id);
}
