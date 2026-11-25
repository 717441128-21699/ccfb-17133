import type { Play } from '../types';

// 三出虚构的皮影戏折子（方言唱本 + 普通话释义）。
// 方言词汇参考陇东 / 陕北 / 关中一带口语自造，故事情节与人物均为虚构。
// perf 描述老艺人实际录音时的临场处理：漏句、加衬字、拖腔、锣鼓过门。

export const PLAYS: Play[] = [
  {
    id: 'ganjiao',
    title: '王贵赶脚',
    region: '陇东方言',
    motif: 'donkey',
    tagline: '脚户王贵赶骡遇尕英，一路喜剧',
    roles: ['王贵（丑·脚户）', '尕英（旦）'],
    lines: [
      { id: 'gj-01', kind: 'sing', role: '王贵', dialect: '太阳上来红彤彤', mandarin: '太阳升起来，满天红彤彤。' },
      { id: 'gj-02', kind: 'sing', role: '王贵', dialect: '我赶上骡子走陇东', mandarin: '我赶着骡子出门，奔走在陇东的山路上。' },
      { id: 'gj-03', kind: 'speak', role: '王贵', dialect: '天气不早咧，牲口你快些走！', mandarin: '天不早了，牲口啊你快点走！' },
      { id: 'gj-04', kind: 'sing', role: '王贵', dialect: '铃铛一响过山坳', mandarin: '铃铛一响，骡子已经走过了山坳。' },
      { id: 'gj-05', kind: 'sing', role: '王贵', dialect: '沟那边过来个女娇娇', mandarin: '山沟那边走来一位俊俏的姑娘。' },
      { id: 'gj-06', kind: 'speak', role: '尕英', dialect: '敢问大哥，往县城咋走哩？', mandarin: '请问大哥，到县城该怎么走呢？' },
      { id: 'gj-07', kind: 'sing', role: '王贵', dialect: '叫声妹子你莫愁', mandarin: '妹子你叫我一声大哥，先别发愁。' },
      { id: 'gj-08', kind: 'sing', role: '王贵', dialect: '顺路把你捎到城里头', mandarin: '我正好顺路，把你带到县城里。' },
      { id: 'gj-09', kind: 'speak', role: '尕英', dialect: '那可多谢大哥了！', mandarin: '那真是太感谢大哥了！' },
      { id: 'gj-10', kind: 'sing', role: '尕英', dialect: '风吹杨柳摆条条', mandarin: '春风吹过，杨柳枝条轻轻摇摆。' },
      { id: 'gj-11', kind: 'sing', role: '尕英', dialect: '心里头好比蜜罐浇', mandarin: '心里甜丝丝的，像被蜜罐浇过一样。' },
      { id: 'gj-12', kind: 'sing', role: '王贵', dialect: '骡蹄子哒哒铃铛铛', mandarin: '骡子蹄声哒哒，铃铛响个不停。' },
      { id: 'gj-13', kind: 'sing', role: '王贵', dialect: '一转眼到了大街上', mandarin: '一眨眼的工夫，就到了县城大街。' },
      { id: 'gj-14', kind: 'speak', role: '王贵', dialect: '呔，县城到咧！下骡子慢些！', mandarin: '嘿，县城到了！下骡子的时候慢一点！' },
      { id: 'gj-15', kind: 'sing', role: '合唱', dialect: '人影灯影团团转', mandarin: '皮影人儿伴着灯影团团转动。' },
      { id: 'gj-16', kind: 'sing', role: '合唱', dialect: '一出赶脚演到完', mandarin: '这一出《赶脚》就演到这里收场。' },
    ],
    perf: {
      // 艺人漏掉了 gj-08 这一整句
      skipLines: ['gj-08'],
      adLibs: [
        { lineId: 'gj-01', after: 0, text: '哎' },
        { lineId: 'gj-05', after: 5, text: '呀' },
        { lineId: 'gj-07', after: 2, text: '哟' },
        { lineId: 'gj-12', after: 3, text: '嗨' },
      ],
      longTones: [
        { lineId: 'gj-01', charIndex: 6, seconds: 3.8 }, // 彤——
        { lineId: 'gj-10', charIndex: 6, seconds: 4.6 }, // 条——
        { lineId: 'gj-16', charIndex: 6, seconds: 5.2 }, // 完——
      ],
      percussions: [
        { anchor: 'start', seconds: 6.5, kind: 'luogu', label: '开场锣鼓' },
        { anchor: 'gj-03', seconds: 3.2, kind: 'luogu', label: '过门锣鼓' },
        { anchor: 'gj-09', seconds: 5.5, kind: 'instrumental', label: '板胡过门' },
        { anchor: 'end', seconds: 7.5, kind: 'luogu', label: '收台锣鼓' },
      ],
    },
  },
  {
    id: 'xiuhébao',
    title: '绣荷包',
    region: '陕北/晋西方言',
    motif: 'lotus',
    tagline: '旦角独角唱段，一线荷包万种情',
    roles: ['秀莲（旦）'],
    lines: [
      { id: 'hb-01', kind: 'sing', role: '秀莲', dialect: '三月里来桃花开', mandarin: '三月初春，桃花漫山遍野地开了。' },
      { id: 'hb-02', kind: 'sing', role: '秀莲', dialect: '秀莲灯下绣荷包', mandarin: '我秀莲坐在油灯底下绣荷包。' },
      { id: 'hb-03', kind: 'sing', role: '秀莲', dialect: '一绣天上明月亮', mandarin: '第一绣，绣天上那轮明亮的圆月。' },
      { id: 'hb-04', kind: 'sing', role: '秀莲', dialect: '二绣牛郎会织女', mandarin: '第二绣，绣牛郎织女鹊桥相会。' },
      { id: 'hb-05', kind: 'sing', role: '秀莲', dialect: '三绣鸳鸯水上漂', mandarin: '第三绣，绣一对鸳鸯浮在水面上。' },
      { id: 'hb-06', kind: 'speak', role: '秀莲', dialect: '荷包绣成咧，可捎给哪个人呀？', mandarin: '荷包倒是绣好了，可是能送给谁呢？' },
      { id: 'hb-07', kind: 'sing', role: '秀莲', dialect: '手捏钢针光线线', mandarin: '手里捏着钢针，丝线在灯下发亮。' },
      { id: 'hb-08', kind: 'sing', role: '秀莲', dialect: '针扎指尖连心尖', mandarin: '针尖扎了手指，疼一直连到心尖上。' },
      { id: 'hb-09', kind: 'sing', role: '秀莲', dialect: '荷包上绣并蒂莲', mandarin: '荷包面上绣的是并蒂莲花。' },
      { id: 'hb-10', kind: 'sing', role: '秀莲', dialect: '愿和情哥常团圆', mandarin: '只求能和情郎哥哥早早团圆。' },
      { id: 'hb-11', kind: 'sing', role: '秀莲', dialect: '窗户外头风沙沙', mandarin: '窗户外面风声沙沙地响。' },
      { id: 'hb-12', kind: 'sing', role: '秀莲', dialect: '鸡叫三遍天要明', mandarin: '公鸡叫过三遍，天眼看就要亮了。' },
      { id: 'hb-13', kind: 'speak', role: '秀莲', dialect: '不说咧，我快些绣吧。', mandarin: '不胡思乱想了，我还是赶紧绣花吧。' },
      { id: 'hb-14', kind: 'sing', role: '秀莲', dialect: '荷包虽小情意重', mandarin: '荷包虽然小巧，里面的情意却很重。' },
      { id: 'hb-15', kind: 'sing', role: '秀莲', dialect: '千针万线在其中', mandarin: '千针万线，都缝在这荷包里头。' },
      { id: 'hb-16', kind: 'sing', role: '秀莲', dialect: '等得情哥回家转', mandarin: '等到情郎哥哥回家的那一天。' },
      { id: 'hb-17', kind: 'sing', role: '秀莲', dialect: '双手递上这片心', mandarin: '双手把荷包递过去，就是递上我这一片心。' },
    ],
    perf: {
      skipLines: ['hb-14'],
      adLibs: [
        { lineId: 'hb-02', after: 0, text: '啊' },
        { lineId: 'hb-05', after: 7, text: '哟' },
        { lineId: 'hb-10', after: 0, text: '咦' },
        { lineId: 'hb-15', after: 7, text: '哎' },
      ],
      longTones: [
        { lineId: 'hb-01', charIndex: 6, seconds: 4.1 }, // 开——
        { lineId: 'hb-05', charIndex: 6, seconds: 3.4 }, // 漂——
        { lineId: 'hb-10', charIndex: 6, seconds: 5.8 }, // 圆——
        { lineId: 'hb-17', charIndex: 6, seconds: 6.4 }, // 心——
      ],
      percussions: [
        { anchor: 'start', seconds: 5.0, kind: 'instrumental', label: '板胡前奏' },
        { anchor: 'hb-05', seconds: 3.6, kind: 'luogu', label: '小锣过门' },
        { anchor: 'hb-12', seconds: 6.0, kind: 'instrumental', label: '丝弦过门' },
        { anchor: 'end', seconds: 6.5, kind: 'luogu', label: '收尾锣鼓' },
      ],
    },
  },
  {
    id: 'kuangmiao',
    title: '逛庙会',
    region: '关中方言',
    motif: 'mask',
    tagline: '张家二老逛庙会看皮影，道白热闹',
    roles: ['张大（丑）', '二婶（彩旦）'],
    lines: [
      { id: 'km-01', kind: 'speak', role: '张大', dialect: '老婆子，快些走，去晚咧挤不到前头！', mandarin: '老伴啊，快点走，去晚了就挤不到前面了！' },
      { id: 'km-02', kind: 'sing', role: '张大', dialect: '正月十五闹新春', mandarin: '正月十五元宵节，到处闹着新春。' },
      { id: 'km-03', kind: 'sing', role: '张大', dialect: '男女老少出了门', mandarin: '男男女女、老老少少都走出家门看热闹。' },
      { id: 'km-04', kind: 'speak', role: '二婶', dialect: '你走那么快做啥哩？等我一等！', mandarin: '你走那么快干什么呀？稍微等等我！' },
      { id: 'km-05', kind: 'sing', role: '张大', dialect: '大头和尚戏柳翠', mandarin: '社火里演的是大头和尚逗柳翠的故事。' },
      { id: 'km-06', kind: 'sing', role: '张大', dialect: '旱船跑的像云飞', mandarin: '跑旱船的像驾着云一样飞快。' },
      { id: 'km-07', kind: 'speak', role: '二婶', dialect: '哎哟，这皮影耍得才叫嫽！', mandarin: '哎呀，这皮影戏演得可真是好！' },
      { id: 'km-08', kind: 'sing', role: '二婶', dialect: '牛皮刻成将和相', mandarin: '黄牛皮刻成了文官武将、帝王宰相。' },
      { id: 'km-09', kind: 'sing', role: '二婶', dialect: '灯一亮来就开场', mandarin: '油灯一亮，皮影戏就算开了场。' },
      { id: 'km-10', kind: 'sing', role: '二婶', dialect: '一口叙说千古事', mandarin: '一张嘴叙说着千百年的兴亡故事。' },
      { id: 'km-11', kind: 'sing', role: '张大', dialect: '双手对舞百万兵', mandarin: '两只手舞动着，就像指挥百万大军。' },
      { id: 'km-12', kind: 'speak', role: '张大', dialect: '唱得好！赏耍手两个铜板！', mandarin: '唱得好！打赏耍皮影的师傅两个铜板！' },
      { id: 'km-13', kind: 'sing', role: '合唱', dialect: '锣鼓敲得震天响', mandarin: '锣鼓敲起来，响声简直要震动天地。' },
      { id: 'km-14', kind: 'sing', role: '合唱', dialect: '明年咱还来看灯影', mandarin: '到了明年，咱们还来看这皮影灯影戏。' },
      { id: 'km-15', kind: 'speak', role: '二婶', dialect: '走慢些嘛，等等我！', mandarin: '你倒是走慢点呀，等等我！' },
    ],
    perf: {
      skipLines: ['km-11'],
      adLibs: [
        { lineId: 'km-02', after: 0, text: '嗨' },
        { lineId: 'km-06', after: 6, text: '啊' },
        { lineId: 'km-13', after: 7, text: '哟' },
      ],
      longTones: [
        { lineId: 'km-02', charIndex: 6, seconds: 3.2 },
        { lineId: 'km-13', charIndex: 6, seconds: 4.0 },
      ],
      percussions: [
        { anchor: 'start', seconds: 8.0, kind: 'luogu', label: '大闹台锣鼓' },
        { anchor: 'km-03', seconds: 2.8, kind: 'luogu', label: '过街锣鼓' },
        { anchor: 'km-09', seconds: 4.5, kind: 'instrumental', label: '唢呐曲牌' },
        { anchor: 'end', seconds: 8.5, kind: 'luogu', label: '收台锣鼓' },
      ],
    },
  },
];

export function getPlay(id: string | null | undefined): Play {
  return PLAYS.find((p) => p.id === id) ?? PLAYS[0];
}
