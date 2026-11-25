import React, {useEffect, useRef, useState} from 'react';
import {ArrowRight, ChevronLeft, ChevronRight} from 'lucide-react';
import './featured.css';

const features = [
  {id:'277842', image:'bootcamp', title:'동계 직무 부트캠프', date:'12월 14일까지 모집'},
  {id:'277821', image:'mentoring', title:'가대 후배사랑 100인 멘토링', date:'12월 18일까지 신청'},
];
const motionQuery = '(prefers-reduced-motion: reduce)';

export default function Featured({rows, onOpen, initialId}) {
  const stage = useRef(null);
  const [slide, setSlide] = useState(() => ({
    index: Math.max(0, features.findIndex(f => f.id === initialId)), direction: 0,
  }));
  const [paused, setPaused] = useState(() => matchMedia(motionQuery).matches);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState(() => !document.hidden);
  const [failed, setFailed] = useState({});
  const feature = features[slide.index];
  const row = rows.find(r => r.id === feature.id);
  const rotating = !paused && visible && activeTab;

  function step(direction) {
    setSlide(old => ({
      index: (old.index + direction + features.length) % features.length, direction,
    }));
  }

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(stage.current);
    const media = matchMedia(motionQuery);
    const preference = event => setPaused(event.matches);
    const visibility = () => setActiveTab(!document.hidden);
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = setTimeout(() => step(1), 3000);
    return () => clearTimeout(timer);
  }, [rotating, slide]);

  return <section ref={stage} className="panel feature" data-direction={slide.direction} aria-label="추천 공고" aria-roledescription="캐러셀">
    <div className="feature-copy">
      <div key={feature.id} className="feature-story">
        <small className="kicker">가톨릭대학교 대표 공고　/　{row?.department}</small>
        <div className="feature-titles">
          <h2>{feature.title}</h2>
          <span aria-hidden="true">{features[1-slide.index].title}</span>
        </div>
        <p>{feature.date}</p>
      </div>
      <a id="feature-start" className="button primary feature-link" href={'#notice/'+feature.id}
        onClick={onOpen} onFocus={() => setPaused(true)}>공고 보기 <ArrowRight size={16}/></a>
      <div className="feature-controls">
        <button aria-label="이전 추천 공고" onClick={() => step(-1)}><ChevronLeft size={17}/></button>
        <span aria-live={rotating ? 'off' : 'polite'}>{slide.index+1} / {features.length}</span>
        <button aria-label="다음 추천 공고" onClick={() => step(1)}><ChevronRight size={17}/></button>
        <button className="autoplay" onClick={() => setPaused(value => !value)}>{paused?'재생':'일시정지'}</button>
        <a className="text-button" href="#browse">전체 공고 ↓</a>
      </div>
    </div>
    <figure>
      {!failed[feature.id] && <img key={feature.id} src={'/featured/'+feature.image+'.webp'} alt=""
        onError={() => setFailed(old => ({...old,[feature.id]:true}))}/>}
      {!failed[feature.id] && <figcaption>AI로 생성한 이미지</figcaption>}
    </figure>
  </section>;
}
