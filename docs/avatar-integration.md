# Kokoro Avatar Integration

`avatar.html` は、外部Web UIから `postMessage` で制御できる喋るキャラクター表示モジュールです。LLM履歴やチャットセッションは持たず、Avatar表示、TTS再生、音量ベース口パクだけを担当します。

## 起動方法

```powershell
npm install
npm run dev
```

Vite の既定URLで `http://localhost:5173/kokoro/avatar.html` を開きます。確認用に `http://localhost:5173/kokoro/demo-avatar-controller.html` もあります。

## キャラクター画像

既定では `/kokoro/models/character.png` を読み込みます。存在しない場合でも落とさず、生成プレースホルダーで起動します。URL queryまたはlocalStorageで `characterUrl` を指定できます。

```text
http://127.0.0.1:5173/kokoro/avatar.html?characterUrl=/kokoro/models/my-character.png
```

深度推定による視差変形は `depth.html` と同じ `@kokoro/rig/depth` の処理を使います。

## TTS設定

OpenAI API互換の `/v1/audio/speech` へPOSTします。API keyはソースコードへ埋め込まず、URL queryまたは `localStorage` の `kokoro.avatar.settings` に保存します。

設定項目:

- `ttsEndpoint`: `/v1/audio/speech` の完全URL、またはベースURL
- `apiKey`: Bearer token。空なら `Authorization` ヘッダーは送りません
- `ttsModel`: 既定値 `irodori-tts-lite`
- `voice`: 既定値 `codex_test_calm_girl`
- `responseFormat`: 既定値 `wav`
- `allowedOrigins`: カンマ区切りの許可origin。未指定ならローカル個人用途として全originを許可します

例:

```text
http://127.0.0.1:5173/kokoro/avatar.html?ttsEndpoint=/irodori-tts&ttsModel=irodori-tts-lite&voice=codex_test_calm_girl&responseFormat=wav&characterUrl=/kokoro/models/character.png
```

## 音声再生の許可

ブラウザのautoplay制限により、iframe内の文書に一度もユーザー操作がない状態では `audio.play()` が拒否されることがあります。初回はAvatar右下の `Enable Voice` をクリックしてください。TTS生成済みで再生だけが拒否された場合は `Play Last Speech` が表示され、生成済み音声を再利用して再生できます。

## 口パク画像

差分スプライトは以下に置きます。

- `public/mouth/closed.png` -> `/kokoro/mouth/closed.png`
- `public/mouth/half.png` -> `/kokoro/mouth/half.png`
- `public/mouth/open.png` -> `/kokoro/mouth/open.png`

画像が存在しない場合は `console.warn` に留め、生成プレースホルダーの口パーツでAvatar本体は動き続けます。

添付キャラ画像向けの初期口中心は、元画像 `2304x3072` の座標でおおよそ `x=1152`, `y=1385` です。`320x180` 程度の透明キャンバス中央に口だけを描いた差分から始めると調整しやすいです。

## MouthConfig

`kokoro:setMouthConfig` または query parameter で調整します。保存値は `localStorage` の `kokoro.avatar.mouthConfig` に保持します。

```json
{
  "x": 1152,
  "y": 1385,
  "scale": 1,
  "halfThreshold": 0.15,
  "openThreshold": 0.35
}
```

## postMessage API

```js
iframe.contentWindow.postMessage({
  type: "kokoro:speak",
  text: "読み上げる文章"
}, "*");
```

```js
iframe.contentWindow.postMessage({ type: "kokoro:stop" }, "*");
```

```js
iframe.contentWindow.postMessage({
  type: "kokoro:setExpression",
  expression: "neutral"
}, "*");
```

```js
iframe.contentWindow.postMessage({
  type: "kokoro:setMouthConfig",
  config: {
    x: 0,
    y: 0,
    scale: 1,
    halfThreshold: 0.15,
    openThreshold: 0.35
  }
}, "*");
```

## SillyTavern連携

SillyTavern側のUI Extensionで `avatar.html` をiframe表示し、AI応答完了時に `kokoro:speak` を送ります。TTS API keyはSillyTavern側では扱わず、Avatar側のURL queryまたはlocalStorageに持たせます。

## CORS注意点

TTSエンドポイントはブラウザから呼ばれます。kokoro dev serverでは `/irodori-tts` を `http://127.0.0.1:8088` にプロキシするため、Irodori TTSのようにCORS preflightへ応答しないローカルサーバーでも開発時は同一originで使えます。プロキシを使わず別originのTTSサーバーを直接呼ぶ場合は、TTSサーバー側で `http://localhost:5173` などからのCORSを許可してください。iframe連携の送信元制限は `allowedOrigins` で後から締められる構造です。
