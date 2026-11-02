/* global console */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.resolve(__dirname, "..");
const outDir = path.join(frontendDir, "out");

// out ディレクトリを確保
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Capacitor が同期に必要な初期 index.html を生成
const indexHtmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>山網</title>
</head>
<body style="background-color: #0f172a; color: #f8fafc; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
  <div style="text-align: center;">
    <h2>🌲 山網 現場モバイル</h2>
    <p>現場画面を読み込み中...</p>
  </div>
  <script>
    if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
      window.location.href = "/mobile";
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, "index.html"), indexHtmlContent, "utf-8");

// public ディレクトリのアセット（アイコン、マニフェスト等）があれば out へコピー
const publicDir = path.join(frontendDir, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, outDir, { recursive: true });
}

console.log("✓ Mobile assets prepared in frontend/out");
