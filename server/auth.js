'use strict';

/**
 * server/auth.js · 密码与会话
 *
 * - 密码用 scrypt 加盐哈希；只存哈希，永不存明文。
 * - 会话是一串随机 token，放在 HttpOnly + SameSite=Lax 的 cookie 里。
 * - 所有比较都用 timingSafeEqual，避免时间差泄露。
 */

const crypto = require('node:crypto');

const SESSION_DAYS = 30;
const COOKIE_NAME = 'la_session';

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 64).toString('hex');
}

function verifyPassword(password, salt, expectedHex) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(String(expectedHex || ''), 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sessionExpiry() {
  const t = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach(function (part) {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function sessionCookie(token, maxAgeSeconds) {
  const parts = [
    COOKIE_NAME + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.max(0, Math.floor(maxAgeSeconds))
  ];
  return parts.join('; ');
}

function clearCookie() {
  return COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

/** 简单但有效的输入校验：用户名 2–24 个字符，密码 8–128。 */
function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return '用户名和密码不能为空。';
  }
  const name = username.trim();
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5-]{2,24}$/.test(name)) {
    return '用户名只能是 2–24 个字母、数字、下划线、连字符或汉字。';
  }
  if (password.length < 8 || password.length > 128) {
    return '密码长度需要在 8–128 个字符之间。';
  }
  return null;
}

module.exports = {
  COOKIE_NAME,
  SESSION_DAYS,
  newSalt,
  hashPassword,
  verifyPassword,
  newSessionToken,
  sessionExpiry,
  parseCookies,
  sessionCookie,
  clearCookie,
  validateCredentials
};
