import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_MAX, uploadNoticeImage} from './manager-api.js';
import {blockReady, newBlock} from './notice-editor.js';

function fakeStorage(error = null) {
  const calls = [];
  return {calls, from: bucket => ({
    upload: async (path, file, options) => {calls.push({bucket, path, file, options}); return {data: error ? null : {path}, error};},
    getPublicUrl: path => ({data: {publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`}})
  })};
}
const file = (type, size = 10) => ({type, size});

test('uploadNoticeImage puts the file at <user>/<notice>/<uuid>.<ext> in notice-images and returns the public URL', async () => {
  const storage = fakeStorage(), image = file('image/jpeg');
  const url = await uploadNoticeImage(image, 'notice-1', {storage, userId: 'user-1'});
  const [call] = storage.calls;
  assert.equal(call.bucket, 'notice-images');
  assert.match(call.path, /^user-1\/notice-1\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(call.file, image);
  assert.equal(call.options.contentType, 'image/jpeg');
  assert.equal(url, `https://example.supabase.co/storage/v1/object/public/notice-images/${call.path}`);
  for (const [type, ext] of [['image/png', 'png'], ['image/webp', 'webp']]) {
    await uploadNoticeImage(file(type), 'n', {storage, userId: 'u'});
    assert.ok(storage.calls.at(-1).path.endsWith('.' + ext));
  }
});

test('uploadNoticeImage rejects other types and files over 5MB without calling storage', async () => {
  const storage = fakeStorage();
  await assert.rejects(uploadNoticeImage(file('image/gif'), 'n', {storage, userId: 'u'}), /png, jpg, webp/);
  await assert.rejects(uploadNoticeImage(file('application/pdf'), 'n', {storage, userId: 'u'}), /png, jpg, webp/);
  await assert.rejects(uploadNoticeImage(file('image/png', IMAGE_MAX + 1), 'n', {storage, userId: 'u'}), /5MB/);
  assert.equal(storage.calls.length, 0);
  await uploadNoticeImage(file('image/png', IMAGE_MAX), 'n', {storage, userId: 'u'});
  assert.equal(storage.calls.length, 1);
});

test('uploadNoticeImage surfaces storage errors', async () => {
  const cause = {message: 'new row violates row-level security policy'};
  await assert.rejects(uploadNoticeImage(file('image/png'), 'n', {storage: fakeStorage(cause), userId: 'u'}), error => error.message.includes('이미지 올리기에 실패했습니다') && error.cause === cause);
});

test('a new image block needs both src and alt', () => {
  const block = newBlock('image');
  assert.deepEqual(Object.keys(block).sort(), ['alt', 'id', 'src', 'type']);
  assert.equal(blockReady(block), false);
  assert.equal(blockReady({...block, src: 'https://x/notice-images/a.png'}), false);
  assert.equal(blockReady({...block, src: 'https://x/notice-images/a.png', alt: ' '}), false);
  assert.equal(blockReady({...block, src: 'https://x/notice-images/a.png', alt: '일정표'}), true);
});
