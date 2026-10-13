import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function readArchive(bytes) {
  if (bytes.length < 16 || bytes.readUInt32LE(0) !== 4) throw new Error('Invalid ASAR prefix');
  const headerLength = bytes.readUInt32LE(12);
  const payloadStart = 8 + bytes.readUInt32LE(4);
  if (headerLength > 64 * 1024 * 1024 || 16 + headerLength > payloadStart || payloadStart > bytes.length) throw new Error('Invalid ASAR header bounds');
  const header = JSON.parse(bytes.subarray(16, 16 + headerLength).toString('utf8'));
  if (!header.files || typeof header.files !== 'object') throw new Error('Missing ASAR files');
  const read = name => {
    let entry = header;
    for (const part of name.split('/')) entry = entry?.files?.[part];
    if (!entry || entry.unpacked || entry.link || entry.files) throw new Error('Expected packed file: ' + name);
    const offset = Number(entry.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(entry.size) || entry.size < 0 || payloadStart + offset + entry.size > bytes.length) throw new Error('Invalid ASAR file bounds: ' + name);
    const content = bytes.subarray(payloadStart + offset, payloadStart + offset + entry.size);
    if (entry.integrity?.algorithm === 'SHA256' && entry.integrity.hash !== sha256(content)) throw new Error('ASAR file integrity mismatch: ' + name);
    return content;
  };
  return { header, payloadStart, read };
}

function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header));
  const padded = Math.ceil((4 + json.length) / 4) * 4;
  const prefix = Buffer.alloc(12 + padded);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(4 + padded, 4);
  prefix.writeUInt32LE(padded, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  return prefix;
}

// Retain every original payload offset and unpacked-file declaration. Changed
// files are appended, so native modules and unrelated plugins remain untouched.
export function appendFiles(bytes, files) {
  const { header, payloadStart } = readArchive(bytes);
  const payloads = [bytes.subarray(payloadStart)];
  let offset = bytes.length - payloadStart;
  for (const [name, content] of Object.entries(files)) {
    const parts = name.split('/');
    if (parts.some(part => !part || part === '..' || part === '__proto__')) throw new Error('Invalid archive path');
    let parent = header;
    for (const part of parts.slice(0, -1)) {
      parent.files[part] ??= { files: {} };
      parent = parent.files[part];
      if (!parent.files) throw new Error('Expected archive directory');
    }
    const data = Buffer.from(content);
    const blocks = [];
    const blockSize = 4 * 1024 * 1024;
    for (let i = 0; i < data.length; i += blockSize) blocks.push(sha256(data.subarray(i, i + blockSize)));
    parent.files[parts.at(-1)] = { size: data.length, offset: String(offset), integrity: { algorithm: 'SHA256', hash: sha256(data), blockSize, blocks } };
    payloads.push(data);
    offset += data.length;
  }
  return Buffer.concat([encodeHeader(header), ...payloads]);
}

export function createArchive(files) {
  return appendFiles(encodeHeader({ files: {} }), files);
}
