/**
 * A faction as the map draws it (its emblem). The same as the game's
 * src/data/factionData.json (nordencult, written by norden-data's faction
 * editor), which holds the rest; keep them in step (the game's tests compare them).
 */
export interface Faction {
  id: string
  name: string
  /** Number of the emblem image (src/assets/emblems/emblem_NN.webp) */
  emblem: number
}

export const FACTION_LIST = [
  {
    id: "valhardt",
    name: "ヴァルハルト家",
    emblem: 5
  },
  {
    id: "nordis",
    name: "ノルディス家",
    emblem: 3
  },
  {
    id: "leonis",
    name: "レオニス帝国",
    emblem: 6
  },
  {
    id: "carta",
    name: "カルタ書院",
    emblem: 7
  },
  {
    id: "aqua",
    name: "アクア商会",
    emblem: 4
  },
  {
    id: "rosalia",
    name: "ロザリア家",
    emblem: 1
  },
  {
    id: "taurus",
    name: "タウルス自由都市連合",
    emblem: 2
  },
  {
    id: "sede",
    name: "法王府",
    emblem: 9
  }
] satisfies Faction[]

export const FACTION_MAP = Object.fromEntries(FACTION_LIST.map((f) => [f.id, f]))
