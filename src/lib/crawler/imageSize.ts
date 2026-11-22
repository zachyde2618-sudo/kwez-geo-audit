/** Read intrinsic dimensions from PNG, GIF, JPEG or WebP bytes. Returns null if unknown. */
export function imageDimensions(buf: Buffer): { width: number; height: number; format: string } | null {
  if (buf.length < 24) return null;
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
  }
  // GIF
  if (buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), format: "gif" };
  }
  // WebP
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buf.length >= 30) {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), format: "webp" };
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: "webp" };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const b = buf.readUInt32LE(21);
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), format: "webp" };
    }
    return null;
  }
  // JPEG: scan for a start-of-frame marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), format: "jpeg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

export function imageFormat(url: string, contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("image/")) return ct.slice(6).replace("svg+xml", "svg").replace("jpg", "jpeg");
  const ext = /\.([a-z0-9]+)(?:$|\?)/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  return ext === "jpg" ? "jpeg" : ext ?? "unknown";
}
