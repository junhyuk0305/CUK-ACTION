// Per-notice funnel sections: sources, stages, block reach and question answers from notice_funnel.
import React from 'react';
import {applyMode} from './contract.js';
import {SOURCE_LABELS, blockRows, questionRows, stageRows} from './funnel.js';

const countText = value => value === null || value === undefined ? '비공개' : `${value.toLocaleString()}명`;
const rateText = (row, index) => index === 0 ? '기준 단계' : row.rate === 'hidden' ? '비공개 인원이 있어 전환율을 알 수 없습니다' : row.rate === null ? '앞 단계 인원이 없습니다' : `앞 단계 대비 ${row.rate}%`;

function Bars({rows, dropIndex}) {
  const max = Math.max(1, ...rows.map(row => row.count ?? 0));
  return <div className="overview-stages">{rows.map((row, index) => <div key={row.id}>
    <span>{row.label}{index === dropIndex && <b className="tag">가장 많이 줄어듦</b>}</span>
    <div className="overview-stage-track">{row.count !== null && <i className={index === dropIndex ? 'complete' : row.deleted ? 'link' : ''} style={{width: row.count / max * 100 + '%'}}/>}</div>
    <strong>{countText(row.count)}</strong>
  </div>)}</div>;
}

export default function NoticeFunnel({notice, funnel, error, testMode, suggest}) {
  if (testMode) return <div className="info-note">테스트 공간에서는 유입, 단계, 블록, 문항 집계와 AI 수정 제안을 볼 수 없습니다. 담당자 계정으로 로그인하세요.</div>;
  if (error) return <div className="warning" role="alert">{error}</div>;
  if (!funnel) return null;
  const site = applyMode(notice) === 'site';
  const stages = stageRows(notice, funnel.stages || {});
  const blocks = blockRows(notice, funnel.blocks || {});
  const questions = questionRows(notice, funnel.questions || {});
  const blockBars = blocks.deleted ? [...blocks.rows, {id: 'deleted', label: `삭제된 블록 ${blocks.deleted.blocks}개`, count: blocks.deleted.count, deleted: true}] : blocks.rows;
  return <>
    <section className="panel workflow-metrics"><h3>유입별 인원</h3>
      <div className="manager-counts">{SOURCE_LABELS.map(([key, label]) => <div key={key}><span>{label}</span><strong>{countText(funnel.sources?.[key])}</strong></div>)}</div>
      <p className="muted">상세를 연 경로별 학생 수입니다. 한 학생이 여러 경로로 들어오면 경로마다 셉니다.</p>
    </section>
    <section className="panel workflow-metrics"><h3>단계별 인원</h3>
      <div className="manager-counts">{stages.map((row, index) => <div key={row.key}><span>{row.label}</span><strong>{countText(row.count)}</strong><small>{rateText(row, index)}</small></div>)}</div>
      <p className="muted">1~4명은 비공개입니다. 같은 학생은 단계마다 한 번만 셉니다.</p>
    </section>
    {site && <section className="panel workflow-metrics"><h3>본문 블록별 도달</h3>
      {blockBars.length ? <Bars rows={blockBars} dropIndex={blocks.dropIndex}/> : <p className="muted">본문 블록이 없습니다.</p>}
      <p className="muted">블록이 화면에 절반 이상 1초 보인 학생 수입니다.</p>
      {blocks.deleted && <p className="muted">삭제된 블록은 블록별 인원 중 가장 큰 값입니다.</p>}
      {blocks.rows.length > 0 && suggest}
    </section>}
    {site && <section className="panel workflow-metrics"><h3>문항별 작성 인원</h3>
      {questions.rows.length ? <Bars rows={questions.rows} dropIndex={questions.dropIndex}/> : <p className="muted">문항이 없습니다.</p>}
      <p className="muted">문항에 답을 쓰고 칸을 벗어난 학생 수입니다. 한 학생은 문항마다 한 번만 셉니다.</p>
    </section>}
  </>;
}
