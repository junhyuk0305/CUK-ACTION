import React, { useEffect, useRef } from 'react';
import { noticeBlocks } from './contract.js';
import { watchNoticeBlocks } from './student-block-reach.js';

export default function NoticeBlocks({ notice, onReach }) {
  const container = useRef(null);
  const callback = useRef(onReach);
  callback.current = onReach;
  const blocks = noticeBlocks(notice);
  const blockIds = JSON.stringify(blocks.map(block => block.id));
  const tracked = !!onReach;
  useEffect(() => {
    if (tracked) return watchNoticeBlocks(container.current, id => callback.current?.(id));
  }, [notice?.id, blockIds, tracked]);

  return <div ref={container} className="notice-blocks">{blocks.map(block =>
    block.type === 'heading' ? <h3 key={block.id} data-block-id={block.id}>{block.text}</h3>
      : block.type === 'image' ? <img key={block.id} data-block-id={block.id} src={block.src} alt={block.alt} />
      : <p key={block.id} data-block-id={block.id}>{block.text}</p>)}</div>;
}
