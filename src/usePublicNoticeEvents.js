import { useEffect, useRef, useState } from 'react';
import { resolveSource } from './contract.js';
import { publicEventNoticeId, recordStudentEvent, rememberPublicView } from './student-events.js';

export function usePublicNoticeEvents(row, userId, cameFromList) {
  const [visit, setVisit] = useState(null);
  const issued = useRef(null);
  useEffect(() => {
    let active = true;
    issued.current = null;
    setVisit(null);
    if (row && userId) {
      const source = resolveSource(location.search, cameFromList);
      publicEventNoticeId(row).then(async id => {
        if (!active || !id) return;
        const current = { rowId: row.id, userId, id };
        setVisit(current);
        issued.current = current;
        const recorded = await recordStudentEvent(id, 'view', { source });
        if (active && !recorded) issued.current = null;
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [row, userId, cameFromList]);
  const viewing = visit && visit.rowId === row?.id && visit.userId === userId;
  return {
    onReach: viewing ? blockId => recordStudentEvent(visit.id, 'block', { blockId }) : undefined,
    transfer: () => {
      if (viewing && issued.current === visit) rememberPublicView(userId, visit.id);
    },
  };
}
