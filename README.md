# norden-strategy

戦略マップを three.js で描画する新プロジェクト（nordencult-old の 2D 地図の置き換え）。

```sh
npm install
npm run dev
```

操作: ドラッグで移動 / ホイール（タッチはピンチ）でカーソル位置に向かって拡大縮小。

右上の「地図の色・羊皮紙」で地図全体の彩度・セピア・紙の地合いと染み・色あせ・周縁の焼け・明るさを調整できます。`norden-battle` の羊皮紙ポストプロセスを戦略マップの縮尺に合わせています。「標準・淡い水彩・古地図」のプリセットがあり、効果をオフにすると元の描画と比較できます。設定はこのブラウザに保存します。「標準」で採用済みの初期値に戻せます。

「設定JSONをコピー」で森と羊皮紙の現在値を `{ forest, parchment }` のJSONとしてコピーできます。初期値に採用したい設定の共有に使えます。自動コピーが使えない環境では、選択してコピーできるテキスト欄を表示します。

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
| `src/map/engine/ParchmentEffect.ts` | MSAA付きのシーン描画・羊皮紙の後処理 |
| `src/map/engine/parchmentSettings.ts` | 羊皮紙の設定・範囲チェック・保存 |
| `src/map/ParchmentControls.tsx` | 羊皮紙の調整UI・プリセット |
| `src/map/SettingsExport.tsx` | 森と羊皮紙の設定をJSONとしてコピー |

ワールド座標は 1 単位 = 旧地図画像の 8px（`IMAGE_TO_WORLD`）なので、旧 `map_overlay.svg` の都市・街道座標はそのまま換算して載せられる。
