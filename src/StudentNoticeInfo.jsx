import React, { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { applyMode, isSchoolNotice } from './contract.js';
import { initialGuide } from './guide.js';
import { readGuide } from './gateway.js';

export const modeLabel = notice => applyMode(notice) === 'site' ? '사이트 신청' : '외부 신청';

// Spans for the detail's attribute line (.meta-line): posted date, then the school original as an external text link.
export function SchoolSource({ notice }) {
  if (!isSchoolNotice(notice)) return null;
  return <>
    <span>{notice.postedAt ? '게시일 ' + notice.postedAt : '게시일 미상'}</span>
    {/^https:\/\//i.test(notice.sourceUrl) && <a className="text-button" href={notice.sourceUrl} target="_blank" rel="noreferrer">학교 원문 보기<ArrowUpRight size={14}/></a>}
  </>;
}

export function GuideAttribution({ notice }) {
  const [hasGuide, setHasGuide] = useState(false);
  useEffect(() => {
    let active = true;
    const id = notice.sourceArchiveId;
    if (id) readGuide(id).then(rows => {
      if (active) setHasGuide(!!(rows ?? initialGuide(id, notice.excerpt))?.length);
    }).catch(() => {});
    return () => { active = false; };
  }, [notice.sourceArchiveId, notice.excerpt]);
  return hasGuide ? <p className="help-text">AI가 정리한 정보이니 원문을 확인하세요.</p> : null;
}
