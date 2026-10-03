# norden-strategy

戦略マップを three.js で描画する新プロジェクト（nordencult-old の 2D 地図の置き換え）。

```sh
npm install
npm run dev
```

操作: ドラッグで移動 / ホイール（タッチはピンチ）でカーソル位置に向かって拡大縮小。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/map/world/islandDesign.ts` | 島の設計データ（海岸線・山脈・多島海ゾーン・湖・砂漠）。座標は旧地図の 8192px 画像空間 |
| `src/map/world/generateWorld.ts` | 設計データ＋ノイズから 1024² のマクロ地形を生成（標高・河川/湖・山岳度・森林密度・流向・乾燥度）。Web Worker で実行 |
| `src/map/engine/terrainShader.ts` | マクロ地形にノイズの細部を重ねるシェーダー。画素の大きさに応じて細部を増減（拡大するほど岩肌・樹冠・砂紋・水面の流れが現れる） |
| `src/map/engine/TerrainQuadtree.ts` | カメラ距離に応じた四分木タイル（1 ドローコールのインスタンス描画） |
| `src/map/engine/MapCameraController.ts` | パン・ズーム・慣性・地形追従 |
| `src/map/engine/StrategyMap.ts` | three.js シーン全体 |

ワールド座標は 1 単位 = 旧地図画像の 8px（`IMAGE_TO_WORLD`）なので、旧 `map_overlay.svg` の都市・街道座標はそのまま換算して載せられる。
