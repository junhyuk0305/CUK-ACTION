import React, { useState } from 'react';
import { noticeQuestions } from './contract.js';

export default function ApplicationForm({ notice, profile, verifiedIds, value = {}, onChange, readOnly, preview }) {
  const [previewEdit, setPreviewEdit] = useState(null);
  const answers = preview && previewEdit?.notice === notice ? previewEdit.answers : value.answers ?? {};
  function change(id, text) {
    const next = { ...answers, [id]: text };
    if (preview) setPreviewEdit({ notice, answers: next });
    else onChange?.({ ...value, claims: value.claims ?? [], answers: next });
  }
  return noticeQuestions(notice).map(q => {
    const text = answers[q.id] ?? (q.type === 'profile' ? profile?.[q.profileField] ?? '' : '');
    const input = {
      disabled: readOnly, required: q.required, 'aria-label': q.label, 'data-question-id': q.id,
      value: text, onChange: e => change(q.id, e.target.value),
    };
    return <label className="question" key={q.id}>
      <strong>{q.label}{q.required && <small className="danger"> 필수</small>}</strong>
      {q.hint && <span>{q.hint}</span>}
      {q.type === 'long' ? <textarea {...input} maxLength={q.max} />
        : q.type === 'select' ? <select {...input}><option value="">선택</option>{q.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
        : <input {...input} type="text" maxLength={q.type === 'short' ? q.max : undefined} />}
      {['short','long'].includes(q.type) && q.max && <small>{String(text).length.toLocaleString()} / {q.max.toLocaleString()}자</small>}
    </label>;
  });
}
