import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ErrorBoundary} from './ErrorBoundary.js';

test('ErrorBoundary shows children, then a reload screen after a render error (QE-02)', () => {
  const boundary = new ErrorBoundary({children: 'app'});
  assert.equal(boundary.render(), 'app');
  boundary.state = ErrorBoundary.getDerivedStateFromError(new TypeError("reading 'every'"));
  const html = renderToStaticMarkup(boundary.render());
  assert.match(html, /role="alert">화면을 표시하지 못했습니다/);
  assert.match(html, /새로고침<\/button>/);
});
