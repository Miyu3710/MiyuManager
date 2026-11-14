import type { CoverId } from "../design-system/components/CoverArt";

export type GameStatus = "playing" | "queued" | "finished" | "paused";

export interface PlaySession {
  id: string;
  date: string;
  time: string;
  duration: string;
  minutes: number;
  ended: "正常结束" | "手动结束" | "异常中断";
}

export interface Game {
  id: string;
  title: string;
  originalTitle: string;
  romaji: string;
  year: number;
  developer: string;
  tags: string[];
  status: GameStatus;
  playtime: string;
  playtimeMinutes: number;
  lastPlayed: string;
  addedAt: string;
  rating: number;
  description: string;
  cover: CoverId;
  catalogNo: string;
  source: string;
  engine: string;
  ageRating: "全年龄" | "18+";
  edition: "正式版" | "体验版";
  launchCount: number;
  lastSession: string;
  installedSize: string;
  installedPath: string;
  exePath: string;
  sessions: PlaySession[];
}

export const statusLabels: Record<GameStatus, string> = {
  playing: "在玩",
  queued: "想玩",
  finished: "已通关",
  paused: "搁置",
};

export const games: Game[] = [
  {
    id: "moonlit-atelier",
    title: "月影工房",
    originalTitle: "月影のアトリエ",
    romaji: "Tsukikage no Atelier",
    year: 2024,
    developer: "Lunar Atelier",
    tags: ["奇幻", "悬疑", "美术馆"],
    status: "playing",
    playtime: "12 小时 24 分",
    playtimeMinutes: 744,
    lastPlayed: "昨晚 23:18",
    addedAt: "3 天前",
    rating: 8.6,
    description:
      "一座只在月夜开门的美术馆，和被遗忘的画家留下的最后一幅画。你受委托整理藏品，却发现每幅画都在等待一个人回来。",
    cover: "moonlit",
    catalogNo: "MM-0128",
    source: "VNDB · Bangumi",
    engine: "Kirikiri 2",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 14,
    lastSession: "1 小时 42 分",
    installedSize: "4.8 GB",
    installedPath: "D:\\Games\\月影工房",
    exePath: "D:\\Games\\月影工房\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "昨晚",
        time: "23:18",
        duration: "1 小时 42 分",
        minutes: 102,
        ended: "正常结束",
      },
      {
        id: "s2",
        date: "11 月 11 日",
        time: "21:04",
        duration: "2 小时 06 分",
        minutes: 126,
        ended: "正常结束",
      },
      {
        id: "s3",
        date: "11 月 09 日",
        time: "22:40",
        duration: "54 分",
        minutes: 54,
        ended: "手动结束",
      },
    ],
  },
  {
    id: "seaside-cafe",
    title: "海边的咖啡露台",
    originalTitle: "海辺のカフェテラス",
    romaji: "Umibe no Cafe Terrace",
    year: 2023,
    developer: "潮风社",
    tags: ["日常", "治愈", "夏日"],
    status: "playing",
    playtime: "6 小时 48 分",
    playtimeMinutes: 408,
    lastPlayed: "周二",
    addedAt: "1 周前",
    rating: 8.1,
    description:
      "暑假的最后一个星期，你回到海边小镇，替祖母照看一间快要关门的咖啡店。潮声、冰咖啡和三位常客，组成了一个缓慢的夏天。",
    cover: "seaside",
    catalogNo: "MM-0127",
    source: "Bangumi",
    engine: "Artemis Engine",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 9,
    lastSession: "48 分",
    installedSize: "2.1 GB",
    installedPath: "D:\\Games\\海辺のカフェテラス",
    exePath: "D:\\Games\\海辺のカフェテラス\\game.exe",
    sessions: [
      { id: "s1", date: "周二", time: "20:42", duration: "48 分", minutes: 48, ended: "正常结束" },
      {
        id: "s2",
        date: "11 月 06 日",
        time: "22:18",
        duration: "1 小时 36 分",
        minutes: 96,
        ended: "正常结束",
      },
    ],
  },
  {
    id: "end-of-summer-signal",
    title: "夏日终点的信号灯",
    originalTitle: "夏の終わりの信号",
    romaji: "Natsu no Owari no Shingou",
    year: 2022,
    developer: "青い踏切",
    tags: ["青春", "离别", "铁路"],
    status: "finished",
    playtime: "9 小时 12 分",
    playtimeMinutes: 552,
    lastPlayed: "10 月 12 日",
    addedAt: "2 周前",
    rating: 8.9,
    description:
      "小镇的铁路即将停运。四个高中生在最后一个夏天，决定把没能说出口的话录进一盘磁带，寄给十年后的自己。",
    cover: "signal",
    catalogNo: "MM-0119",
    source: "VNDB",
    engine: "Siglus Engine",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 22,
    lastSession: "1 小时 06 分",
    installedSize: "3.6 GB",
    installedPath: "D:\\Games\\夏の終わりの信号",
    exePath: "D:\\Games\\夏の終わりの信号\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "10 月 12 日",
        time: "21:30",
        duration: "1 小时 06 分",
        minutes: 66,
        ended: "正常结束",
      },
      {
        id: "s2",
        date: "10 月 11 日",
        time: "22:02",
        duration: "2 小时 12 分",
        minutes: 132,
        ended: "正常结束",
      },
    ],
  },
  {
    id: "daydream",
    title: "白昼之梦",
    originalTitle: "白昼の夢",
    romaji: "Hakuchuu no Yume",
    year: 2025,
    developer: "空色书房",
    tags: ["实验", "梦境", "短篇"],
    status: "queued",
    playtime: "3 小时 06 分",
    playtimeMinutes: 186,
    lastPlayed: "尚未开始",
    addedAt: "2 天前",
    rating: 7.8,
    description:
      "每天下午三点，你都会在同一间房里醒来。窗外是同一片海，桌上却每天多出一件不属于你的东西。",
    cover: "daydream",
    catalogNo: "MM-0131",
    source: "Steam",
    engine: "Ren'Py",
    ageRating: "全年龄",
    edition: "体验版",
    launchCount: 0,
    lastSession: "—",
    installedSize: "1.2 GB",
    installedPath: "D:\\Games\\白昼の夢",
    exePath: "D:\\Games\\白昼の夢\\game.exe",
    sessions: [],
  },
  {
    id: "stardust-record",
    title: "星屑唱片",
    originalTitle: "星屑のレコード",
    romaji: "Hoshikuzu no Record",
    year: 2021,
    developer: "夜航唱片",
    tags: ["音乐", "科幻", "群像"],
    status: "playing",
    playtime: "18 小时 36 分",
    playtimeMinutes: 1116,
    lastPlayed: "上周六",
    addedAt: "3 周前",
    rating: 9.1,
    description:
      "在一座漂流于轨道上的城市里，唱片店老板收到了一张来自未来的黑胶。每一首歌，都对应着一位即将离开的人。",
    cover: "stardust",
    catalogNo: "MM-0104",
    source: "VNDB · Steam",
    engine: "Kirikiri 2",
    ageRating: "18+",
    edition: "正式版",
    launchCount: 31,
    lastSession: "2 小时 06 分",
    installedSize: "8.4 GB",
    installedPath: "D:\\Games\\星屑のレコード",
    exePath: "D:\\Games\\星屑のレコード\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "上周六",
        time: "22:10",
        duration: "2 小时 06 分",
        minutes: 126,
        ended: "正常结束",
      },
      {
        id: "s2",
        date: "11 月 02 日",
        time: "20:34",
        duration: "1 小时 44 分",
        minutes: 104,
        ended: "正常结束",
      },
      {
        id: "s3",
        date: "10 月 28 日",
        time: "23:02",
        duration: "1 小时 12 分",
        minutes: 72,
        ended: "异常中断",
      },
    ],
  },
  {
    id: "rain-promise",
    title: "雨天的约定",
    originalTitle: "雨の日の約束",
    romaji: "Ame no Hi no Yakusoku",
    year: 2020,
    developer: "苔色制作",
    tags: ["悬疑", "雨", "重逢"],
    status: "finished",
    playtime: "11 小时 42 分",
    playtimeMinutes: 702,
    lastPlayed: "9 月 28 日",
    addedAt: "1 个月前",
    rating: 8.4,
    description:
      "十年前的那个雨天，你们约好在这里见面。如今旧公寓即将拆除，一封没有署名的信把你带回了那段没有结束的对话。",
    cover: "rain",
    catalogNo: "MM-0096",
    source: "Bangumi",
    engine: "Siglus Engine",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 18,
    lastSession: "54 分",
    installedSize: "5.2 GB",
    installedPath: "D:\\Games\\雨の日の約束",
    exePath: "D:\\Games\\雨の日の約束\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "9 月 28 日",
        time: "19:48",
        duration: "54 分",
        minutes: 54,
        ended: "正常结束",
      },
      {
        id: "s2",
        date: "9 月 27 日",
        time: "21:12",
        duration: "1 小时 28 分",
        minutes: 88,
        ended: "正常结束",
      },
    ],
  },
  {
    id: "winter-lamp",
    title: "冬灯",
    originalTitle: "冬の灯",
    romaji: "Fuyu no Akari",
    year: 2019,
    developer: "北窗",
    tags: ["家庭", "冬日", "叙事"],
    status: "paused",
    playtime: "7 小时 30 分",
    playtimeMinutes: 450,
    lastPlayed: "8 月 3 日",
    addedAt: "2 个月前",
    rating: 8.0,
    description:
      "大雪封路的夜晚，一家人围坐在旧屋里。母亲的日记、父亲未寄出的信，还有你一直不愿提起的那年冬天。",
    cover: "winter",
    catalogNo: "MM-0082",
    source: "VNDB",
    engine: "Artemis Engine",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 11,
    lastSession: "26 分",
    installedSize: "3.0 GB",
    installedPath: "D:\\Games\\冬の灯",
    exePath: "D:\\Games\\冬の灯\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "8 月 3 日",
        time: "22:26",
        duration: "26 分",
        minutes: 26,
        ended: "手动结束",
      },
    ],
  },
  {
    id: "glass-garden",
    title: "玻璃庭院",
    originalTitle: "ガラスの庭",
    romaji: "Garasu no Niwa",
    year: 2024,
    developer: "玻璃庭院",
    tags: ["百合", "庭园", "记忆"],
    status: "playing",
    playtime: "5 小时 24 分",
    playtimeMinutes: 324,
    lastPlayed: "昨天 21:06",
    addedAt: "4 天前",
    rating: 8.7,
    description:
      "温室里的花只在无人时开放。园艺师与来访的少女，在玻璃与雨声之间，慢慢拼起一段被剪掉的童年。",
    cover: "glass",
    catalogNo: "MM-0129",
    source: "VNDB · Bangumi",
    engine: "Kirikiri 2",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 7,
    lastSession: "1 小时 18 分",
    installedSize: "2.8 GB",
    installedPath: "D:\\Games\\ガラスの庭",
    exePath: "D:\\Games\\ガラスの庭\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "昨天",
        time: "21:06",
        duration: "1 小时 18 分",
        minutes: 78,
        ended: "正常结束",
      },
      {
        id: "s2",
        date: "11 月 12 日",
        time: "20:40",
        duration: "46 分",
        minutes: 46,
        ended: "正常结束",
      },
    ],
  },
  {
    id: "nocturnal-lovers",
    title: "夜行性恋人",
    originalTitle: "夜行性の恋人",
    romaji: "Yakousei no Koibito",
    year: 2023,
    developer: "午夜剧场",
    tags: ["都市", "怪谈", "恋爱"],
    status: "queued",
    playtime: "13 小时 18 分",
    playtimeMinutes: 798,
    lastPlayed: "尚未开始",
    addedAt: "5 天前",
    rating: 8.2,
    description:
      "凌晨两点的便利店，只接待睡不着的人。她是夜班店员，也是你梦里反复出现、却从未见过的恋人。",
    cover: "nocturnal",
    catalogNo: "MM-0125",
    source: "Steam",
    engine: "Ren'Py",
    ageRating: "18+",
    edition: "正式版",
    launchCount: 0,
    lastSession: "—",
    installedSize: "6.7 GB",
    installedPath: "D:\\Games\\夜行性の恋人",
    exePath: "D:\\Games\\夜行性の恋人\\game.exe",
    sessions: [],
  },
  {
    id: "goodbye-spring",
    title: "再见，春天",
    originalTitle: "さよなら、春",
    romaji: "Sayonara, Haru",
    year: 2018,
    developer: "春日列车",
    tags: ["校园", "毕业", "群像"],
    status: "finished",
    playtime: "16 小时 12 分",
    playtimeMinutes: 972,
    lastPlayed: "6 月 30 日",
    addedAt: "3 个月前",
    rating: 9.0,
    description:
      "毕业前的最后一个月，摄影社的六个人决定拍一部电影。镜头里是樱花和教室，镜头外是各自要去的地方。",
    cover: "spring",
    catalogNo: "MM-0068",
    source: "Bangumi",
    engine: "Siglus Engine",
    ageRating: "全年龄",
    edition: "正式版",
    launchCount: 25,
    lastSession: "1 小时 36 分",
    installedSize: "7.1 GB",
    installedPath: "D:\\Games\\さよなら、春",
    exePath: "D:\\Games\\さよなら、春\\game.exe",
    sessions: [
      {
        id: "s1",
        date: "6 月 30 日",
        time: "20:18",
        duration: "1 小时 36 分",
        minutes: 96,
        ended: "正常结束",
      },
      {
        id: "s2",
        date: "6 月 28 日",
        time: "21:42",
        duration: "2 小时 18 分",
        minutes: 138,
        ended: "正常结束",
      },
    ],
  },
];

export const featuredGame = games[0]!;
export const recentGames = [games[0]!, games[1]!, games[4]!, games[7]!];
export const recentlyAdded = [games[3]!, games[8]!, games[7]!, games[1]!, games[2]!, games[6]!];

export function getGame(id: string | undefined): Game {
  return games.find((game) => game.id === id) ?? featuredGame;
}

export const totalPlaytime = games.reduce((sum, game) => sum + game.playtimeMinutes, 0);
export const weeklyPlaytime = "6.4";
