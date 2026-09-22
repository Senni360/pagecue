import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaURL, fileExtension, validateQuestion} from '../extension/core.js';
test('streaming URLs cannot masquerade as direct downloadable files', () => {
  for (const value of ['blob:https://example.org/id', 'javascript:alert(1)', 'https://example.org/live.m3u8?token=abc', 'https://example.org/live.mpd']) assert.throws(() => mediaURL(value));
  assert.equal(mediaURL('https://example.org/audio.mp3?token=abc'), 'https://example.org/audio.mp3?token=abc');
});
test('signed extensionless media uses the actual content type', () => {
  assert.equal(fileExtension('https://example.org/serve?id=1', 'video/mp4; charset=utf-8'), 'mp4');
  assert.throws(() => fileExtension('https://example.org/login', 'text/html'));
});
test('empty and oversized selections never reach the provider', () => {
  assert.throws(() => validateQuestion('  '));
  assert.throws(() => validateQuestion('a'.repeat(40001)));
  assert.equal(validateQuestion(' Which choice? '), 'Which choice?');
});
