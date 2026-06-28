# Zap 12

Discord Activity で遊ぶ Zap 12 の試作です。

表示名: Zap 12
repo/package 名: zap-twelve

最初の実装はシンプル優先です。

- Vanilla HTML/CSS/JS
- Cloudflare Workers
- Durable Objects
- WebSocket 同期
- HTTP API は設定取得のみ
- Viteなし

## Local Dev

```bash
npm install
npm run dev
```

ローカルでは同じ room を2タブで開きます。

```text
http://localhost:8787/?room=dev
```

片方で A、もう片方で B を選び、両方 `LOCK IN` すると自動で開始します。
同じブラウザで2タブ検証する場合は、参加者IDをクエリで分けられます。

```text
http://localhost:8787/?room=dev&participant=a
http://localhost:8787/?room=dev&participant=b
```

## Discord

Discord 内では Activity の `instance_id` / SDK `instanceId` を room ID として使います。
そのため Discord から起動した場合は room code 入力画面を飛ばします。

### Discord Developer Portal

1. Discord Developer Portal でアプリを作る。
2. OAuth2 Client ID を控える。
3. Activities を有効にして、URL Mapping に Worker の URL を設定する。

```text
/
https://zap-twelve.rrmix000.workers.dev
```

4. Cloudflare Worker に `DISCORD_CLIENT_ID` を設定する。

```bash
wrangler secret put DISCORD_CLIENT_ID
```

現時点では Discord OAuth の認証までは使っていません。
名前はアプリ内で入力します。
