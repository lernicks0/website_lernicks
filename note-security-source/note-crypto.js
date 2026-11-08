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
  async function deriveKeys(input, salt, version) {
    if (!scope.isSecureContext && typeof window !== 'undefined') throw Error('HTTPS_REQUIRED');
    if (!crypto.subtle) throw Error('HTTPS_REQUIRED');
    const saltBytes = decode(salt);
    if (saltBytes.length !== 16) throw Error('INVALID_KEY');
    const material = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
    input.fill(0);
    const params = { name:'PBKDF2', salt:saltBytes, iterations:600000, hash:'SHA-256' };
    let bits = new Uint8Array(await crypto.subtle.deriveBits(params, material, version === 1 ? 512 : 256));
    if (version === 2) {
      const seed = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits']);
      bits.fill(0);
      bits = new Uint8Array(await crypto.subtle.deriveBits({
        name:'HKDF', hash:'SHA-256', salt:saltBytes, info:enc.encode('lernicks-note-v2:content-and-access')
      }, seed, 512));
    }
    const key = await crypto.subtle.importKey('raw', bits.slice(0,32), 'AES-GCM', false, ['encrypt','decrypt']);
    const accessKey = encode(bits.slice(32)); bits.fill(0);
    return { key, accessKey, salt, version };
  }
  async function derive(secret, password, salt) {
    const master = decode(secret), passwordBytes = enc.encode(password);
    if (master.length !== 32) throw Error('INVALID_KEY');
    const input = new Uint8Array(master.length + passwordBytes.length);
    input.set(master); input.set(passwordBytes, master.length);
    master.fill(0); passwordBytes.fill(0);
    return deriveKeys(input, salt, 1);
  }
  async function derivePassword(password, salt) {
    if (!password) throw Error('PASSWORD_REQUIRED');
    return deriveKeys(enc.encode(password), salt, 2);
  }
  async function encrypt(content, keys, slug) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:enc.encode('note-v' + keys.version + ':' + slug), tagLength:128 }, keys.key, enc.encode(content));
    return { v:keys.version, kdf:'PBKDF2-SHA256', iterations:600000, salt:keys.salt, iv:encode(iv), ciphertext:encode(new Uint8Array(bytes)) };
  }
  async function decrypt(envelope, keys, slug) {
    if (envelope.v !== keys.version || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== 600000 || envelope.salt !== keys.salt) throw Error('INVALID_ENVELOPE');
    return dec.decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:decode(envelope.iv), additionalData:enc.encode('note-v' + keys.version + ':' + slug), tagLength:128 }, keys.key, decode(envelope.ciphertext)));
  }
  scope.NoteCrypto = { random, derive, derivePassword, encrypt, decrypt };
  if (typeof module !== 'undefined') module.exports = scope.NoteCrypto;
})(globalThis);
