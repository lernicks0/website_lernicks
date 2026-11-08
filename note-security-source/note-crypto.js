(function(scope){
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
  function encode(bytes) {
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(s) {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw Error('INVALID_KEY');
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }
  const random = size => encode(crypto.getRandomValues(new Uint8Array(size)));
  // Stable v1 alphabets. Each four-character phrase represents sixteen random bits.
  const spokenAlphabet = ['红黄蓝绿黑白金银紫粉灰青橙棕赤墨', '猫狗牛马羊虎兔鹿熊狼鸡鸭鹅鱼鸟猪',
    '吃看找追抱拿搬捡摘采画藏送换种买', '桃梨瓜枣梅橘柚杏蕉笋豆糖米盐茶葱'];
  const spokenLength = 8 * spokenAlphabet.length;
  function randomSpokenPhrase() {
    const bytes = crypto.getRandomValues(new Uint8Array(spokenLength / 2));
    return Array.from({length:8}, (_, group) => {
      const first = bytes[group * 2], second = bytes[group * 2 + 1];
      const digits = [first >> 4, first & 15, second >> 4, second & 15];
      return digits.map((digit, index) => spokenAlphabet[index][digit]).join('');
    }).join(' ');
  }
  async function spokenSecret(input) {
    const phrase = input.replace(/[\s、，,。·—-]/g, '');
    if (phrase.length !== spokenLength || [...phrase].some((letter, index) => !spokenAlphabet[index % 4].includes(letter))) {
      throw Error('请输入完整加密链接、链接密钥或八组四字口述口令。');
    }
    if (!crypto.subtle) throw Error('HTTPS_REQUIRED');
    const digest = await crypto.subtle.digest('SHA-256', enc.encode('lernicks-note-spoken-v1:' + phrase));
    return encode(new Uint8Array(digest));
  }
  async function derive(secret, password, salt) {
    if (!scope.isSecureContext && typeof window !== 'undefined') throw Error('HTTPS_REQUIRED');
    if (!crypto.subtle) throw Error('HTTPS_REQUIRED');
    const master = decode(secret), saltBytes = decode(salt);
    if (master.length !== 32 || saltBytes.length !== 16) throw Error('INVALID_KEY');
    const input = new Uint8Array(32 + enc.encode(password).length);
    input.set(master); input.set(enc.encode(password), 32);
    const material = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', salt:saltBytes, iterations:600000, hash:'SHA-256' }, material, 512));
    const key = await crypto.subtle.importKey('raw', bits.slice(0,32), 'AES-GCM', false, ['encrypt','decrypt']);
    const accessKey = encode(bits.slice(32)); bits.fill(0); input.fill(0); master.fill(0);
    return { key, accessKey, salt };
  }
  async function encrypt(content, keys, slug) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:enc.encode('note-v1:' + slug), tagLength:128 }, keys.key, enc.encode(content));
    return { v:1, kdf:'PBKDF2-SHA256', iterations:600000, salt:keys.salt, iv:encode(iv), ciphertext:encode(new Uint8Array(bytes)) };
  }
  async function decrypt(envelope, keys, slug) {
    if (envelope.v !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== 600000 || envelope.salt !== keys.salt) throw Error('INVALID_ENVELOPE');
    return dec.decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:decode(envelope.iv), additionalData:enc.encode('note-v1:' + slug), tagLength:128 }, keys.key, decode(envelope.ciphertext)));
  }
  scope.NoteCrypto = { random, randomSpokenPhrase, spokenSecret, derive, encrypt, decrypt };
  if (typeof module !== 'undefined') module.exports = scope.NoteCrypto;
})(globalThis);
