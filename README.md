# norden-strategy

戦略マップを three.js で描画する新プロジェクト（nordencult-old の 2D 地図の置き換え）。

```sh
npm install
npm run dev
```

操作: ドラッグで移動 / ホイール（タッチはピンチ）でカーソル位置に向かって拡大縮小。

右上の「森の表現」で、生成した透過テクスチャによる森を調整できます。密度・樹冠サイズ・ばらつき・針葉樹の割合・明るさ・色味・陰影を即時反映し、設定はこのブラウザに保存します。「標準」で初期値に戻せます。「従来のシェーダー（比較）」では以前の半球状の樹冠を表示します。パネルの見出しで折りたためます。

木は4種類の板絵をインスタンス描画し、64単位の区画で画面外を除外します。川岸・急斜面・高山を避けて配置し、地形と共通の高さシェーダーで接地させています。密度調整は固定された配置の本数だけを変更します。画像の読み込みに失敗した場合は従来の描画へ戻ります。

テクスチャは `src/assets/forest/woodland-atlas.png`。生成方法・最終プロンプトは [アセットの記録](src/assets/forest/README.md) を参照してください。葉の光は画像に描かれているため、現在の北向きカメラに合わせた表現です。

描画例: [全景](docs/image/forest-overview.png) / [森の拡大](docs/image/forest-detail.png)。ソフトウェアWebGLで撮影しているため、画像内のfpsは実GPUの性能を示すものではありません。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/map/world/islandDesign.ts` | 島の設計データ（海岸線・山脈・多島海ゾーン・湖・砂漠）。座標は旧地図の 8192px 画像空間 |
| `src/map/world/generateWorld.ts` | 設計データ＋ノイズから 1024² のマクロ地形を生成（標高・河川/湖・山岳度・森林密度・流向・乾燥度）。Web Worker で実行 |
| `src/map/engine/terrainShader.ts` | マクロ地形にノイズの細部を重ねるシェーダー。画素の大きさに応じて細部を増減（拡大するほど岩肌・樹冠・砂紋・水面の流れが現れる） |
| `src/map/engine/TerrainQuadtree.ts` | カメラ距離に応じた四分木タイル（1 ドローコールのインスタンス描画） |
| `src/map/engine/MapCameraController.ts` | パン・ズーム・慣性・地形追従 |
| `src/map/engine/StrategyMap.ts` | three.js シーン全体 |
| `src/map/engine/Forest.ts` | 生成テクスチャの樹木・区画単位のインスタンス描画 |
| `src/map/engine/forestSettings.ts` | 森の設定・範囲チェック・保存 |
| `src/map/ForestControls.tsx` | 森の調整UI・プリセット・従来描画との比較 |

ワールド座標は 1 単位 = 旧地図画像の 8px（`IMAGE_TO_WORLD`）なので、旧 `map_overlay.svg` の都市・街道座標はそのまま換算して載せられる。
