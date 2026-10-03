import type { Faction } from "./faction"

export interface City {
  id: string
  name: string
  nameEn: string
  type: string,
  image?: "town" | "city" | "metropolice" | "fortress1" | "fortress2" | "temple"
  tags: string[]
  population: number
  agriculture: number
  market: number
  military: number
  special?: string,
  belongTo?: Faction['id']
}

export const CITY_LIST: City[] = [
  {
    "id": "P000",
    "name": "灰都 アシュダール",
    "nameEn": "Ashdal",
    "type": "pope_city",
    "image": "temple",
    "tags": ["遺跡", "聖地", "中立"],
    "population": 12000,
    "agriculture": 80,
    "market": 400,
    "military": 0,
    "belongTo": "sede"
  },
  {
    "id": "P001",
    "name": "カルデア",
    "nameEn": "Caldea",
    "type": "port_city",
    "tags": ["港湾", "西方", "漁港"],
    "population": 9000,
    "agriculture": 200,
    "market": 380,
    "military": 250,
    "belongTo": "taurus"
  },
  {
    "id": "P002",
    "name": "ハルヴァン",
    "nameEn": "Halvan",
    "type": "farm_city",
    "tags": ["農地", "南方", "果樹"],
    "population": 7000,
    "agriculture": 480,
    "market": 160,
    "military": 160,
    "belongTo": "taurus"
  },
  {
    "id": "P003",
    "name": "ダルム",
    "nameEn": "Dalm",
    "type": "farm_city",
    "tags": ["農地", "河川", "氾濫原"],
    "population": 8000,
    "agriculture": 560,
    "market": 160,
    "military": 140,
    "belongTo": "leonis"
  },
  {
    "id": "P004",
    "name": "アンバリア",
    "nameEn": "Ambaria",
    "type": "farm_city",
    "tags": ["農地", "牧畜", "軍馬"],
    "population": 8000,
    "agriculture": 560,
    "market": 160,
    "military": 220,
    "belongTo": "leonis"
  },
  {
    "id": "P005",
    "name": "ヴェルスタ",
    "nameEn": "Versta",
    "type": "farm_city",
    "tags": ["農地", "穀倉", "灌漑"],
    "population": 9000,
    "agriculture": 600,
    "market": 160,
    "military": 220,
    "belongTo": "leonis"
  },
  {
    "id": "P006",
    "name": "サルビア",
    "nameEn": "Salvia",
    "type": "farm_city",
    "tags": ["農地", "南方", "塩田"],
    "population": 10000,
    "agriculture": 440,
    "market": 260,
    "military": 220,
    "belongTo": "rosalia"
  },
  {
    "id": "P007",
    "name": "アクアルム",
    "nameEn": "Aquarum",
    "type": "port_city",
    "tags": ["港湾", "南東", "深海"],
    "population": 8000,
    "agriculture": 140,
    "market": 380,
    "military": 220,
    "belongTo": "rosalia"
  },
  {
    "id": "P008",
    "name": "ティルナ",
    "nameEn": "Tirna",
    "type": "ruin_city",
    "tags": ["遺跡", "ゴーレム", "禁忌"],
    "population": 5000,
    "agriculture": 140,
    "market": 160,
    "military": 140,
    "special": "ゴーレム遺跡",
    "belongTo": "rosalia"
  },
  {
    "id": "P009",
    "name": "デルタ・ポルト",
    "nameEn": "Delta Porto",
    "type": "port_city",
    "tags": ["港湾", "東岸", "海賊"],
    "population": 15000,
    "agriculture": 120,
    "market": 560,
    "military": 280,
    "belongTo": "aqua"
  },
  {
    "id": "P010",
    "name": "ソルナ",
    "nameEn": "Solna",
    "type": "farm_city",
    "tags": ["農地", "中央", "河川"],
    "population": 12000,
    "agriculture": 640,
    "market": 240,
    "military": 220,
    "belongTo": "leonis"
  },
  {
    "id": "P011",
    "name": "コルネリア",
    "nameEn": "Cornelia",
    "type": "trade_city",
    "tags": ["交差路", "中東", "市場"],
    "population": 11000,
    "agriculture": 220,
    "market": 460,
    "military": 220,
    "belongTo": "leonis"
  },
  {
    "id": "P012",
    "name": "フルーエン",
    "nameEn": "Fluen",
    "type": "port_city",
    "tags": ["港湾", "西岸", "河川"],
    "population": 11000,
    "agriculture": 220,
    "market": 440,
    "military": 220,
    "belongTo": "carta"
  },
  {
    "id": "P013",
    "name": "エルドラン",
    "nameEn": "Eldoran",
    "type": "military_city",
    "tags": ["要害", "北中央", "十字路"],
    "population": 10000,
    "agriculture": 220,
    "market": 240,
    "military": 460,
    "belongTo": "leonis"
  },
  {
    "id": "P023",
    "name": "メディア",
    "nameEn": "Media",
    "type": "trade_city",
    "tags": ["交差路", "中西", "大市場"],
    "population": 20000,
    "agriculture": 220,
    "market": 720,
    "military": 280,
    "belongTo": "leonis"
  },
  {
    "id": "P015",
    "name": "ブルムハーゲン",
    "nameEn": "Blumhagen",
    "type": "farm_city",
    "tags": ["農地", "中央", "学術"],
    "population": 10000,
    "agriculture": 460,
    "market": 260,
    "military": 140,
    "belongTo": "leonis"
  },
  {
    "id": "P016",
    "name": "アルガルデ",
    "nameEn": "Algarde",
    "type": "frontier_city",
    "tags": ["北西", "交易路", "木材"],
    "population": 5000,
    "agriculture": 240,
    "market": 240,
    "military": 300,
    "belongTo": "valhardt"
  },
  {
    "id": "P027",
    "name": "オスタリア",
    "nameEn": "Ostaria",
    "type": "trade_city",
    "tags": ["交差路", "北東", "大市場"],
    "population": 14000,
    "agriculture": 140,
    "market": 560,
    "military": 220,
    "belongTo": "dracken"
  },
  {
    "id": "P018",
    "name": "セルニア",
    "nameEn": "Sernia",
    "type": "ruin_city",
    "tags": ["遺跡", "北東", "古代研究"],
    "population": 4000,
    "agriculture": 140,
    "market": 180,
    "military": 140,
    "belongTo": "leonis"
  },
  {
    "id": "P019",
    "name": "ノルデン",
    "nameEn": "Norden",
    "type": "frontier_city",
    "tags": ["最北東", "岬", "未知の地"],
    "population": 3000,
    "agriculture": 120,
    "market": 100,
    "military": 240,
    "special": "未知領域への入口",
    "belongTo": "dracken"
  },
  {
    "id": "P020",
    "name": "ラドゥン",
    "nameEn": "Radun",
    "type": "military_city",
    "tags": ["要害", "北方", "関所"],
    "population": 7000,
    "agriculture": 140,
    "market": 160,
    "military": 460,
    "belongTo": "dracken"
  },
  {
    "id": "P021",
    "name": "コーカサ",
    "nameEn": "Caucasa",
    "type": "military_city",
    "tags": ["要害", "最北", "山岳"],
    "population": 8000,
    "agriculture": 140,
    "market": 160,
    "military": 560,
    "belongTo": "valhardt"
  },
  {
    "id": "P022",
    "name": "マルカヴァ",
    "nameEn": "Marcava",
    "type": "port_city",
    "tags": ["港湾", "東岸", "海上交易"],
    "population": 18000,
    "agriculture": 140,
    "market": 660,
    "military": 280,
    "belongTo": "aqua"
  },
  {
    "id": "P014",
    "name": "イグニス",
    "nameEn": "Ignis",
    "type": "ruin_city",
    "tags": ["遺跡", "中央", "鍛冶"],
    "population": 5000,
    "agriculture": 80,
    "market": 240,
    "military": 240,
    "special": "旧帝国鍛冶遺跡",
    "belongTo": "leonis" 
  },
  {
    "id": "P024",
    "name": "ガルドハイム",
    "nameEn": "Gardheim",
    "type": "military_city",
    "image": "fortress1",
    "tags": ["要害", "中東", "騎士団"],
    "population": 9000,
    "agriculture": 140,
    "market": 160,
    "military": 640,
    "special": "誓約騎士団の本拠地",
    "belongTo": "leonis"
  },
  {
    "id": "P025",
    "name": "ヴェサンタ",
    "nameEn": "Vesanta",
    "type": "military_city",
    "image": "fortress1",
    "tags": ["要害", "中央北", "岩山"],
    "population": 7000,
    "agriculture": 60,
    "market": 140,
    "military": 560,
    "belongTo": "leonis"
  },
  {
    "id": "P026",
    "name": "シルヴァ",
    "nameEn": "Silva",
    "type": "frontier_city",
    "tags": ["森林", "西方", "狩人"],
    "population": 4000,
    "agriculture": 240,
    "market": 160,
    "military": 300,
    "belongTo": "carta"
  },
  {
    "id": "P017",
    "name": "アルカナム",
    "nameEn": "Arcanum",
    "type": "ruin_city",
    "tags": ["魔法", "北方", "魔法師ギルド"],
    "population": 6000,
    "agriculture": 80,
    "market": 240,
    "military": 140,
    "special": "魔法師ギルド本部",
    "belongTo": "dracken"
  },
  {
    "id": "P028",
    "name": "レンハウス",
    "nameEn": "Renhaus",
    "type": "frontier_city",
    "tags": ["辺境", "北西", "鉱山"],
    "population": 5000,
    "agriculture": 140,
    "market": 240,
    "military": 300,
    "belongTo": "valhardt"
  },
  {
    "id": "P029",
    "name": "ヘクサリア",
    "nameEn": "Hexalia",
    "type": "ruin_city",
    "tags": ["魔法", "北中央", "禁忌"],
    "image": "fortress2",
    "population": 3000,
    "agriculture": 120,
    "market": 80,
    "military": 140,
    "special": "禁忌魔法の発生源",
    "belongTo": "valhardt"
  },
  {
    "id": "P030",
    "name": "タルガル",
    "nameEn": "Talgar",
    "type": "military_city",
    "tags": ["要害", "西端", "断崖"],
    "population": 6000,
    "agriculture": 80,
    "market": 140,
    "military": 460,
    "belongTo": "taurus"
  }

]

export const CITY_MAP: Record<string, City> = CITY_LIST.reduce((acc, city) => {
  acc[city.id] = city
  return acc
}, {} as Record<string, City>)
