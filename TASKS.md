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
- [x] `GET /api/state` を作る。
- [x] `POST /api/join` を作る。
- [x] `POST /api/action` を作る。
- [x] Durable Object の状態を storage に保存する。

## 3. ゲームルール

- [x] 初期状態を作る。
- [x] A/B の参加処理を作る。
- [x] 観戦参加を作る。
- [x] lock in 処理を作る。
- [x] A/B 両方 lock in で自動開始する。
- [x] 仕掛け処理を作る。
- [x] 座る処理を作る。
- [x] SAFE / SHOCK 判定を作る。
- [x] スコア加算を作る。
- [x] SHOCK 時に合計点を 0 に戻す。
- [x] セーフ席をロックする。
- [x] `×3` 勝利条件を作る。
- [x] `40点超え` 勝利条件を作る。
- [x] `残り1席` 終了条件を作る。
- [x] ラウンド前半/後半のターン遷移を作る。
- [x] リセット要求を作る。
- [x] A/B 両方のリセット要求で初期化する。

## 4. フロントエンド

- [x] participant ID を localStorage に保存する。
- [x] `?room=dev` から room ID を読む。
- [x] 名前入力画面を作る。
- [x] A/B/観戦の参加ボタンを作る。
- [x] ロビー画面を作る。
- [x] lock in 表示を作る。
- [x] 1秒ごとの state ポーリングを作る。
- [x] スコアボードを作る。
- [x] 現在の座るセルをハイライトする。
- [x] 自分の操作ターンだけ操作 UI を有効化する。
- [x] 待機中 UI を作る。
- [x] 仕掛け側に相手の選択中番号を表示する。
- [x] 結果表示を作る。
- [x] RESET 投票表示を作る。

## 4.1 UX修正

- [x] 座る側/仕掛け側の自分の数字選択が即時反応するように、preview送信後に選択状態が消えないよう修正する。
- [x] preview送信中でもローカル選択状態を優先して表示する。
- [x] 仕掛け側の相手選択表示でも、ロック済み席を通常盤面と同じ見た目でロックする。
- [ ] 必要なら preview だけ WebSocket 化する。
- [x] 表示名を `Zap 12` に統一し、`ビリビリナンバー` を画面/README/DESIGNから外す。
- [x] 電撃結果の `SHOCK` 表示を `Zap!` に変更する。
- [ ] `MESSAGES.md` の文言が決まったら画面に反映する。
- [x] 名前入力のデフォルト `Player` を消し、placeholder `名前を入力` にする。

## 4.2 Room / Durable Object ライフサイクル

- [x] ロビーの前に room code 入力画面を追加する。
- [x] URLに `room` がある場合は room code 入力を初期化またはスキップできるようにする。
- [ ] Discord Activity では `instanceId` を room code として使い、room code 入力画面を飛ばす。
- [x] ゲームオーバー後に room を完全初期化する操作を追加する。
- [x] room reset 時に参加者ごと消す方針にする。
- [ ] `storage.deleteAll()` 相当の完全初期化ルートを検討する。
- [ ] 古いroomの掃除方針を決める。

## 5. Discord Activity 対応

- [ ] UX修正と room lifecycle 整理が終わってから着手する。
- [ ] Discord Embedded App SDK を読み込む。
- [ ] Discord 内で起動した場合に `instanceId` を room ID に使う。
- [x] Discord 外では `?room=dev` を使う。
- [ ] Discord Developer Portal 用の設定メモを README に書く。

## 6. ローカル確認

- [x] `wrangler dev` で起動する。
- [x] 2タブで A/B 参加できる。
- [x] A/B 両方 lock in で自動開始する。
- [x] A の座るターンから始まる。
- [x] 仕掛け、座る、結果が同期される。
- [x] 観戦者が状態を見られる。
- [x] RESET が A/B 両方要求で成立する。
- [ ] 勝利条件が動く。

## 7. 後続

- [ ] GitHub repo を作る。
- [ ] 初回 push する。
- [ ] Cloudflare にデプロイする。
- [ ] Discord Developer Portal で Activity 設定をする。
- [ ] Discord 内で動作確認する。
