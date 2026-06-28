# Zap 12 作業書

## 0. 実装前確認

- [x] この設計で進めてよいか確認する。
- [x] repo 名と場所を確定する。
- [x] Discord Developer Portal の作業は後回しでよいか確認する。

## 1. プロジェクト初期化

- [x] `package.json` を作る。
- [x] `wrangler.toml` を作る。
- [x] `src/worker.js` を作る。
- [x] `public/index.html` を作る。
- [x] `public/styles.css` を作る。
- [x] `public/client.js` を作る。
- [x] `.gitignore` を作る。

## 2. Workers / Durable Objects

- [x] Worker で静的ファイルを返す。
- [x] `GameRoom` Durable Object を作る。
- [x] `room` クエリから Durable Object を選ぶ。
- [x] WebSocket `/ws` を作る。
- [x] `join` message を作る。
- [x] `action` message を作る。
- [x] `state` broadcast を作る。
- [x] Durable Object の状態を storage に保存する。

## 3. ゲームルール

- [x] 初期状態を作る。
- [x] A/B の参加処理を作る。
- [x] 観戦参加を作る。
- [x] lock in 処理を作る。
- [x] A/B 両方 lock in で自動開始する。
- [x] 仕掛け処理を作る。
- [x] 座る処理を作る。
- [x] SAFE / Zap 判定を作る。
- [x] スコア加算を作る。
- [x] Zap 時に合計点を 0 に戻す。
- [x] セーフ席をロックする。
- [x] `×3` 勝利条件を作る。
- [x] `40点超え` 勝利条件を作る。
- [x] `残り1席` 終了条件を作る。
- [x] ラウンド前半/後半のターン遷移を作る。
- [x] ルーム削除要求を作る。
- [x] A/B 両方の削除要求で storage を削除する。

## 4. フロントエンド

- [x] participant ID を localStorage に保存する。
- [x] `?room=dev` から room ID を読む。
- [x] 名前入力画面を作る。
- [x] A/B/観戦の参加ボタンを作る。
- [x] ロビー画面を作る。
- [x] lock in 表示を作る。
- [x] WebSocket で state を同期する。
- [x] スコアボードを作る。
- [x] 現在の座るセルをハイライトする。
- [x] 自分の操作ターンだけ操作 UI を有効化する。
- [x] 待機中 UI を作る。
- [x] 仕掛け側に相手の選択中番号を表示する。
- [x] 観戦者に仕掛け中/座り中の盤面を表示する。
- [x] 結果表示を作る。
- [x] ルーム削除の同意表示を作る。

## 4.1 UX修正

- [x] 座る側/仕掛け側の自分の数字選択が即時反応するように、preview送信後に選択状態が消えないよう修正する。
- [x] preview送信中でもローカル選択状態を優先して表示する。
- [x] 仕掛け側の相手選択表示でも、ロック済み席を通常盤面と同じ見た目でロックする。
- [x] 仕掛け中の仮選択を観戦者に表示する。
- [x] ポーリングをやめて WebSocket に一本化する。
- [x] 表示名を `Zap 12` に統一し、旧表示名を画面/README/DESIGNから外す。
- [x] 電撃結果の旧表示を `Zap!` に変更する。
- [ ] `MESSAGES.md` の文言が決まったら画面に反映する。
- [x] 名前入力のデフォルト `Player` を消し、placeholder `名前を入力` にする。

## 4.2 Room / Durable Object ライフサイクル

- [x] ロビーの前に room code 入力画面を追加する。
- [x] URLに `room` がある場合は room code 入力を初期化またはスキップできるようにする。
- [x] Discord Activity では `instanceId` を room code として使い、room code 入力画面を飛ばす。
- [x] ゲームオーバー時に room state を削除する。
- [x] ゲームオーバー後は結果画面をフロントに残し、更新で消えるようにする。
- [x] room delete 時に参加者ごと消す方針にする。
- [x] `storage.deleteAll()` で room state を削除する。
- [x] 無操作/プレイヤー不在時のアラーム掃除を作る。

## 5. Discord Activity 対応

- [x] UX修正と room lifecycle 整理が終わってから着手する。
- [x] Discord Embedded App SDK を読み込む。
- [x] Discord 内で起動した場合に `instanceId` を room ID に使う。
- [x] Discord 外では `?room=dev` を使う。
- [x] Discord Developer Portal 用の設定メモを README に書く。
- [ ] Discord OAuth でユーザー名を自動入力するか検討する。
- [ ] Discord 内で実機確認する。

## 6. ローカル確認

- [x] `wrangler dev` で起動する。
- [x] 2タブで A/B 参加できる。
- [x] A/B 両方 lock in で自動開始する。
- [x] A の座るターンから始まる。
- [x] 仕掛け、座る、結果が同期される。
- [x] 観戦者が状態を見られる。
- [x] ルーム削除が A/B 両方要求で成立する。
- [ ] 勝利条件が動く。

## 7. 後続

- [ ] GitHub repo を作る。
- [ ] 初回 push する。
- [ ] Cloudflare にデプロイする。
- [ ] Discord Developer Portal で Activity 設定をする。
- [ ] Discord 内で動作確認する。
