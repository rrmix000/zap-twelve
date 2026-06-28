# Zap 12

Discord Activity で遊ぶビリビリナンバーの試作です。

日本語名: ビリビリナンバー
英語名: Zap 12
repo/package 名: zap-twelve

最初の実装はシンプル優先です。

- Vanilla HTML/CSS/JS
- Cloudflare Workers
- Durable Objects
- HTTP API + 1秒ポーリング
- WebSocketなし
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

Discord 内では Activity の起動単位から得られる room ID を使う想定です。
Discord Developer Portal の設定は後続タスクで整理します。
