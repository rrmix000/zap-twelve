# Zap 12 設計書

## 目的

Discord の Activity として、ボイスチャンネル内の2人が別々の画面から Zap 12 を遊べるようにする。

まずは複雑な構成にしない。必要になったら後からリアルタイム性や認証を強くする。

## 基本方針

- 既存のローカル単独プレイ版とは別 repo で作る。
- 表示名は日本語/英語ともに `Zap 12` に統一する。repo/package 名は `zap-twelve` にする。
- UI は既存版と同じくシンプルにする。
- 操作感はローカル版を踏襲する。スコアボード中心、12マス、選択してから決定、短い表示を基本にする。
- 座る側が選択中の番号は、仕掛け側の待機画面に表示する。現在はHTTP actionと1秒ポーリングで同期しているが、操作感に影響が出る場合はWebSocketへ移行する。
- フロントはバニラ HTML/CSS/JS。
- Vite は使わない。
- Cloudflare Workers で配信と API を担当する。
- Durable Objects で部屋ごとのゲーム状態を持つ。
- WebSocket は使わない。
- 同期は HTTP API と 1秒ポーリングで行う。
- Discord 連携は最初は薄くし、Activity 内では Discord の起動単位を room ID として使う。

## 部屋の分け方

### 通常 Web / ローカル

ロビーの前に部屋番号入力画面を出す。

1. room code を入力する。
2. room code から Durable Object を選ぶ。
3. その room に入って Join / Lobby へ進む。

URLに `room` がある場合は、その値を初期入力済みとして扱える。

### Discord 内

Discord Activity の起動単位で得られる `instanceId` を room ID として使う。

同じ Activity 起動に参加している人は同じ Durable Object に接続される。
Discord 内では部屋番号入力画面を飛ばし、`instanceId` で自動入室する。

```text
Discord Activity instanceId
  -> Workers
  -> Durable Object idFromName(instanceId)
  -> その部屋のゲーム状態
```

### ローカル開発補助

Discord の `instanceId` がないので、URL の `room` クエリを使う。

```text
http://localhost:8787/?room=dev
http://localhost:8787/?room=test
```

`room=dev` のタブ同士は同じ部屋、`room=test` は別部屋になる。

同じブラウザで2タブ検証する場合は localStorage が共有されるので、開発用に `participant` クエリで参加者IDを上書きできる。

```text
http://localhost:8787/?room=dev&participant=a
http://localhost:8787/?room=dev&participant=b
```

## 参加フロー

1. 部屋番号を入力する。Discord ではここを飛ばす。
2. 名前を入力する。
3. `Aで参加` または `Bで参加` を選ぶ。
4. 選んだ席で `LOCK IN` する。
5. A/B 両方が lock in したら自動でゲーム開始。
6. A/B が埋まっている場合は `観戦` で入れる。

A/B は先着自動割り当てにしない。ユーザーが明示的に選ぶ。
名前入力欄にはデフォルト値を入れず、placeholder に `名前を入力` を出す。

## 観戦者

- 観戦者はスコアボードと進行状況を見る。
- 操作はできない。
- 初期実装では仕掛け中の番号も見える状態にする。
- あとで設定として `観戦者に仕掛け番号を見せる` を ON/OFF できるようにする。

## ゲーム進行

- A が毎ラウンド先に座る。
- 1ラウンド内で A/B がそれぞれ1回ずつ座る。
- 座った番号が仕掛け番号なら `×`。
- `×` がついたプレイヤーの合計点は 0 に戻る。
- `×` が3回で即アウト。
- セーフなら、座った番号がそのまま得点になる。
- 一度セーフで座られた番号はロックされ、以後誰も座れない。
- 合計点が 40 を超えたら勝ち。
- 椅子が残り1つになったら終了し、合計点が高い方が勝ち。

## ターン

- 各ラウンドの前半:
  - B が仕掛ける。
  - A が座る。
- 各ラウンドの後半:
  - A が仕掛ける。
  - B が座る。

## リセット

- A/B 両方が `RESET` を押したらリセットする。
- 片方だけが押している間は、リセット要求中として表示する。
- 観戦者はリセット要求に参加しない。
- ゲームオーバー後は、結果確認後に同じ room code のまま room state を完全初期化し、名前入力からやり直せるようにする。

## Durable Object ライフサイクル

Durable Object は room ごとに1つ作る。`idFromName(roomCode)` に同じ room code を渡す限り、同じ Durable Object に到達する。

### 1. Room 未選択

- 通常 Web / ローカルではクライアントだけの状態。
- room code が決まるまで Durable Object にはアクセスしない。
- Discord では Activity の `instanceId` を room code として使うので、この段階を飛ばす。

### 2. Room 作成 / 復帰

- 初回アクセス時に `idFromName(roomCode)` で Durable Object を取得する。
- Durable Object は必要になった時に起動される。
- `storage.get("room")` が空なら `initialState()` を作る。
- `storage.get("room")` があれば、その room の状態を復元する。

### 3. Lobby

- A/B/観戦者、lock in、reset要求を Durable Object の storage に保存する。
- A/B 両方 lock in で `phase = "trap"` に進む。

### 4. Game

- trap / seat / result / gameOver の進行を同じ Durable Object が処理する。
- 同時操作は Durable Object 側で順番に処理される前提にする。
- 選択中番号などの一時状態も room state に持つ。ただし操作感が悪い場合は WebSocket の接続状態に移す。

### 5. Game Over

- 勝敗表示に必要な結果を残す。
- 次の操作で room state を完全初期化する。
- A/Bの席、名前、観戦者、lock in、スコア、履歴、席ロックをすべて消す。
- 同じ room code は残るため、再入室時は名前入力から始める。

### 6. Room Reset

- Durable Object 自体を明示的に消す、というより storage の room state を初期化する。
- 完全初期化したい場合は `storage.deleteAll()` 相当で状態を消し、次回アクセス時に `initialState()` を作る。
- 同じ room code を使い続ける限り、次回も同じ Durable Object ID にアクセスする。

### 7. Idle

- 誰もアクセスしなくなった Durable Object はCloudflare側でアイドル化される。
- storage に残した状態は残るため、再アクセス時に復帰できる。
- 古いroomを自動掃除したい場合は、最終更新時刻とアラーム/TTL相当の仕組みを後で検討する。

## 画面

### Join

- 部屋番号入力
- 名前入力
- Aで参加
- Bで参加
- 観戦

### Lobby

- A/B の名前
- lock in 状態
- 観戦者数
- A/B 両方 lock in で自動開始

### Game

- スコアボード
- 現在座るプレイヤーの行とセルをハイライト
- 自分の操作ターンだけ操作パネルを出す
- 操作できない人には待機表示を出す

### Result

- 座った番号
- 仕掛け番号
- SAFE / Zap
- 次のターンまたはゲーム終了

## API

### `GET /api/state?room=ROOM&participant=ID`

現在の部屋状態を返す。

### `POST /api/join`

参加する。

```json
{
  "room": "dev",
  "participantId": "browser-local-id",
  "name": "Alice",
  "role": "A"
}
```

`role` は `A`, `B`, `spectator` のいずれか。

### `POST /api/action`

ゲーム操作を送る。

```json
{
  "room": "dev",
  "participantId": "browser-local-id",
  "type": "lockIn",
  "payload": {}
}
```

想定する `type`:

- `lockIn`
- `setTrap`
- `previewSeat`
- `chooseSeat`
- `next`
- `requestReset`
- `cancelReset`
- `resetRoom`

## 状態モデル

```js
{
  phase: "room" | "join" | "lobby" | "trap" | "seat" | "result" | "gameOver",
  players: {
    A: { id, name, lockedIn, resetRequested },
    B: { id, name, lockedIn, resetRequested }
  },
  spectators: [{ id, name }],
  settings: {
    revealTrapToSpectators: true
  },
  game: {
    round,
    trapper,
    sitter,
    trappedNumber,
    previewSeat,
    pendingResult,
    scores,
    strikes,
    occupiedSeats,
    history,
    winner
  }
}
```

## 後回しにすること

- WebSocket 対応
- 選択中表示の即時反映
- Vite 導入
- React などの UI フレームワーク
- Discord OAuth の本格的なユーザー認証
- 退出検知と席の自動解放
- 観戦者向けの仕掛け番号非表示設定
- 本番デプロイ自動化
