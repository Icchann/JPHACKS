import React, { useMemo } from "react";

type QrCodeProps = {
  value: string;
  size?: number;
  className?: string;
  color?: string;
  bgColor?: string;
};

// -------------------------------------------------------------
// 完全オフライン・外部依存ゼロの純粋TypeScript QRコード生成エンジン
// (QR Code Model 2, Version 3-M / 29x29マトリクス, Byte Mode)
// -------------------------------------------------------------

const GF_EXP: number[] = new Array(512).fill(0);
const GF_LOG: number[] = new Array(256).fill(0);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[(GF_LOG[x]! + GF_LOG[y]!) % 255]!;
}

// Version 3-M 用の生成多項式（26個の誤り訂正コードワード）
function getRsGeneratorPoly(ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const nextFactor = [1, GF_EXP[i]!];
    const newPoly = new Array(poly.length + nextFactor.length - 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < nextFactor.length; k++) {
        newPoly[j + k] ^= gfMul(poly[j]!, nextFactor[k]!);
      }
    }
    poly = newPoly;
  }
  return poly;
}

function calculateReedSolomon(data: number[], ecCount: number): number[] {
  const genPoly = getRsGeneratorPoly(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i]!;
    if (coef !== 0) {
      for (let j = 0; j < genPoly.length; j++) {
        msg[i + j] ^= gfMul(genPoly[j]!, coef);
      }
    }
  }
  return msg.slice(data.length);
}

// 29x29マトリクス（Version 3）の生成
function generateQrMatrix(text: string): boolean[][] {
  const size = 29;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    new Array(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array(size).fill(false),
  );

  // 1. 位置検出パターン（ファインダーパターン: 7x7）
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
          isFunction[mr]![mc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[mr]![mc] =
              r === 0 ||
              r === 6 ||
              c === 0 ||
              c === 6 ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else {
            matrix[mr]![mc] = false; // セパレーター
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. 位置合わせパターン（アライメントパターン: Version 3 は (22, 22)）
  function placeAlignment(row: number, col: number) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const mr = row + r;
        const mc = col + c;
        isFunction[mr]![mc] = true;
        matrix[mr]![mc] =
          Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      }
    }
  }
  placeAlignment(22, 22);

  // 3. タイミングパターン
  for (let i = 8; i < size - 8; i++) {
    isFunction[6]![i] = true;
    matrix[6]![i] = i % 2 === 0;
    isFunction[i]![6] = true;
    matrix[i]![6] = i % 2 === 0;
  }

  // 暗数（Dark Module）
  isFunction[size - 8]![8] = true;
  matrix[size - 8]![8] = true;

  // 4. データビット列の構築（Byte Mode）
  const utf8Bytes = Array.from(new TextEncoder().encode(text));
  const dataBits: number[] = [];

  // Mode: 0100 (Byte mode)
  dataBits.push(0, 1, 0, 0);
  // Length: 8 bits
  for (let i = 7; i >= 0; i--) {
    dataBits.push((utf8Bytes.length >> i) & 1);
  }
  // Payload
  for (const byte of utf8Bytes) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((byte >> i) & 1);
    }
  }
  // Terminator 0000
  dataBits.push(0, 0, 0, 0);
  // Pad to 8-bit boundary
  while (dataBits.length % 8 !== 0) {
    dataBits.push(0);
  }

  // Convert bits to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | (dataBits[i + b] ?? 0);
    }
    dataBytes.push(byte);
  }

  // Version 3-M capacity: 44 data codewords
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < 44) {
    dataBytes.push(padBytes[padIdx % 2]!);
    padIdx++;
  }

  // Reed-Solomon 誤り訂正コード（26コードワード）
  const ecBytes = calculateReedSolomon(dataBytes, 26);
  const totalCodewords = [...dataBytes, ...ecBytes];

  // 全ビット列
  const allBits: number[] = [];
  for (const byte of totalCodewords) {
    for (let i = 7; i >= 0; i--) {
      allBits.push((byte >> i) & 1);
    }
  }

  // 5. 形式情報（Mask 0: (row + col) % 2 === 0, EC: M）
  // Format bits for M / Mask 0: 101010000010010 (BCH 15 bits XORed with 101010000010010 = 0x5412)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 15; i++) {
    const bit = formatBits[i] === 1;
    if (i <= 5) {
      isFunction[8]![i] = true;
      matrix[8]![i] = bit;
    } else if (i === 6) {
      isFunction[8]![7] = true;
      matrix[8]![7] = bit;
    } else if (i === 7) {
      isFunction[8]![8] = true;
      matrix[8]![8] = bit;
    } else if (i === 8) {
      isFunction[7]![8] = true;
      matrix[7]![8] = bit;
    } else {
      isFunction[14 - i]![8] = true;
      matrix[14 - i]![8] = bit;
    }

    // 複製（右上と左下）
    if (i < 8) {
      isFunction[size - 1 - i]![8] = true;
      matrix[size - 1 - i]![8] = bit;
    } else {
      isFunction[8]![size - 15 + i] = true;
      matrix[8]![size - 15 + i] = bit;
    }
  }

  // 6. データモジュールの配置（ジグザグ走査）＋ Mask 0
  let bitIndex = 0;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // タイミングパターンの列をスキップ
    const colList = [right, right - 1];
    const upward = ((right + 1) / 2) % 2 === 1;

    for (let r = 0; r < size; r++) {
      const row = upward ? size - 1 - r : r;
      for (const col of colList) {
        if (!isFunction[row]![col]) {
          const bit = bitIndex < allBits.length ? allBits[bitIndex]! : 0;
          bitIndex++;
          // Mask 0: (row + col) % 2 === 0
          const mask = (row + col) % 2 === 0;
          matrix[row]![col] = (bit === 1) !== mask;
        }
      }
    }
  }

  return matrix;
}

// 現場でインターネット不要・完全オフラインでSVGのQRコードを描画するコンポーネント
export function QrCode({
  value,
  size = 200,
  className,
  color = "#1e293b",
  bgColor = "#ffffff",
}: QrCodeProps) {
  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return null;
  }

  const matrixSize = matrix.length;
  const padding = 2;
  const viewBoxSize = matrixSize + padding * 2;

  // 黒モジュールをSVGのrect要素に変換
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r]![c]) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            fill={color}
            height={1.02}
            width={1.02}
            x={c + padding}
            y={r + padding}
          />,
        );
      }
    }
  }

  return (
    <svg
      aria-label={`QRコード: ${value}`}
      className={className}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
    >
      <rect
        fill={bgColor}
        height={viewBoxSize}
        width={viewBoxSize}
        x={0}
        y={0}
      />
      {rects}
    </svg>
  );
}
