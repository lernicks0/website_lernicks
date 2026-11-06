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
  scope.NoteCrypto = { random, derive, encrypt, decrypt };
  if (typeof module !== 'undefined') module.exports = scope.NoteCrypto;
})(globalThis);
