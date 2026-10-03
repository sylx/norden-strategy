export interface Faction {
  id: string
  name: string
  emblem: number,
  // 当主
  // patriarch: Character
  patriarchLabel: string
}

export const FACTION_LIST = [
  {
    id: "valhardt",
    name: "ヴァルハルト家",
    emblem: 5,
    patriarchLabel: "当主"
  },
  {
    id: "dracken",
    name: "ドラーケン家",
    emblem: 3,
    patriarchLabel: "当主"
  },
  {
    id: "leonis",
    name: "レオニス帝国",
    emblem: 6,
    patriarchLabel: "皇帝"
  },
  {
    id: "carta",
    name: "カルタ書院",
    emblem: 7,
    patriarchLabel: "総帥"
  },
  {
    id: "aqua",
    name: "アクア商会",
    emblem: 4,
    patriarchLabel: "会頭"
  },
  {
    id: "rosalia",
    name: "ロザリア家",
    emblem: 1,
    patriarchLabel: "当主"
  },
  {
    id: "taurus",
    name: "タウルス自由都市連合",
    emblem: 2,
    patriarchLabel: "議長"
  },
  {
    id: "sede",
    name: "法王府",
    emblem: 9,
    patriarchLabel: "法王"
  }
] satisfies Faction[]

export const FACTION_MAP = Object.fromEntries(FACTION_LIST.map((f) => [f.id, f]))
