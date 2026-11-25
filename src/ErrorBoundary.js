import React from 'react';

// Keeps a render error from unmounting the whole React root and leaving a blank page.
export class ErrorBoundary extends React.Component {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    const h = React.createElement;
    return h('main', {className: 'access-main'}, h('section', {className: 'panel access-card'},
      h('p', {role: 'alert'}, '화면을 표시하지 못했습니다. 새로고침해 주세요.'),
      h('button', {className: 'button primary', onClick: () => location.reload()}, '새로고침')));
  }
}
