import sharp from 'sharp';

// ============================================================
// 1️⃣ pHash 256 bits (16x16 DCT simplifiée)
// ============================================================
export async function computePhash(buffer: Buffer): Promise<string> {
    const size = 32;
    const raw = await sharp(buffer)
        .resize(size, size, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

    const pixels: number[] = Array.from(raw);

    // Réduction 32x32 → 16x16 (moyenne des blocs 2x2)
    const reduced: number[] = [];
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            let sum = 0;
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    sum += pixels[(y * 2 + dy) * size + (x * 2 + dx)];
                }
            }
            reduced.push(sum / 4);
        }
    }

    // Moyenne (sans DC)
    const avg =
        reduced.slice(1).reduce((a, b) => a + b, 0) / (reduced.length - 1);

    // 256 bits → 64 hex chars
    let bits = '';
    for (const v of reduced) bits += v > avg ? '1' : '0';

    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
        hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex;
}

// ============================================================
// 2️⃣ dHash 64 bits (différence horizontale)
// ============================================================
export async function computeDhash(buffer: Buffer): Promise<string> {
    const raw = await sharp(buffer)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

    const pixels: number[] = Array.from(raw);
    let bits = '';

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const left = pixels[y * 9 + x];
            const right = pixels[y * 9 + x + 1];
            bits += left > right ? '1' : '0';
        }
    }

    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
        hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex;
}

// ============================================================
// 3️⃣ aHash 64 bits (moyenne globale)
// ============================================================
export async function computeAhash(buffer: Buffer): Promise<string> {
    const raw = await sharp(buffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

    const pixels: number[] = Array.from(raw);
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;

    let bits = '';
    for (const v of pixels) bits += v > avg ? '1' : '0';

    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
        hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex;
}

// ============================================================
// 4️⃣ Histogramme couleur HSV (32 bins H + 8 bins S + 8 bins V)
// ============================================================
export async function computeColorHistogram(buffer: Buffer): Promise<number[]> {
    const size = 64;
    const { data, info } = await sharp(buffer)
        .resize(size, size, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const binsH = new Array(32).fill(0);
    const binsS = new Array(8).fill(0);
    const binsV = new Array(8).fill(0);

    for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;

        // H
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }

        // S
        const s = max === 0 ? 0 : d / max;

        // V
        const v = max;

        binsH[Math.min(31, Math.floor((h / 360) * 32))]++;
        binsS[Math.min(7, Math.floor(s * 8))]++;
        binsV[Math.min(7, Math.floor(v * 8))]++;
    }

    // Normaliser (somme = 1)
    const total = size * size;
    const hist = [
        ...binsH.map((v) => v / total),
        ...binsS.map((v) => v / total),
        ...binsV.map((v) => v / total),
    ];

    return hist;
}

// ============================================================
// 5️⃣ Distance de Hamming
// ============================================================
export function hammingDistance(h1: string, h2: string): number {
    if (!h1 || !h2 || h1.length !== h2.length) return 9999;
    let dist = 0;
    for (let i = 0; i < h1.length; i++) {
        const a = parseInt(h1[i], 16);
        const b = parseInt(h2[i], 16);
        let xor = a ^ b;
        while (xor) {
            dist += xor & 1;
            xor >>= 1;
        }
    }
    return dist;
}

// ============================================================
// 6️⃣ Similarité cosinus (pour histogramme)
// ============================================================
export function cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0,
        magA = 0,
        magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ============================================================
// 7️⃣ Signature complète
// ============================================================
export type ImageSignature = {
    phash: string;
    dhash: string;
    ahash: string;
    histogram: number[];
};

export async function computeImageSignature(
    buffer: Buffer,
): Promise<ImageSignature> {
    const [phash, dhash, ahash, histogram] = await Promise.all([
        computePhash(buffer),
        computeDhash(buffer),
        computeAhash(buffer),
        computeColorHistogram(buffer),
    ]);
    return { phash, dhash, ahash, histogram };
}

// ============================================================
// 8️⃣ Score de similarité pondéré (0 → 100)
// ============================================================
export function computeSimilarityScore(
    query: ImageSignature,
    candidate: ImageSignature,
): number {
    // pHash 256 bits → distance max 256
    const phashDist = hammingDistance(query.phash, candidate.phash);
    const phashScore = 1 - phashDist / 256;

    // dHash 64 bits → distance max 64
    const dhashDist = hammingDistance(query.dhash, candidate.dhash);
    const dhashScore = 1 - dhashDist / 64;

    // aHash 64 bits → distance max 64
    const ahashDist = hammingDistance(query.ahash, candidate.ahash);
    const ahashScore = 1 - ahashDist / 64;

    // Histogramme couleur → cosinus [0, 1]
    const colorScore = cosineSimilarity(query.histogram, candidate.histogram);

    // Pondération (somme = 1)
    const WEIGHT_PHASH = 0.40;
    const WEIGHT_DHASH = 0.20;
    const WEIGHT_AHASH = 0.10;
    const WEIGHT_COLOR = 0.30;

    const finalScore =
        phashScore * WEIGHT_PHASH +
        dhashScore * WEIGHT_DHASH +
        ahashScore * WEIGHT_AHASH +
        colorScore * WEIGHT_COLOR;

    return Math.max(0, Math.min(100, Math.round(finalScore * 100)));
}