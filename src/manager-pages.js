// 담당자 공고 목록의 페이지 번호. 처음·끝·현재 앞뒤만 남기고 사이는 'gap'으로 줄인다.
export function managerPageItems(current, count) {
  const keep = [...new Set([1, current - 1, current, current + 1, count])].filter(n => n >= 1 && n <= count).sort((a, b) => a - b);
  return keep.flatMap((n, i) => !i ? [n] : n - keep[i - 1] === 2 ? [n - 1, n] : n - keep[i - 1] > 2 ? ['gap', n] : [n]);
}

// 목록의 마감일. 올해 날짜는 '12.10', 다른 해는 '2027.01.05'로 쓴다. 기준 연도는 한국 시간이다.
export function listDate(date, year = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric'}).format(new Date())) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!match) return date;
  return match[1] === String(year) ? `${match[2]}.${match[3]}` : `${match[1]}.${match[2]}.${match[3]}`;
}
