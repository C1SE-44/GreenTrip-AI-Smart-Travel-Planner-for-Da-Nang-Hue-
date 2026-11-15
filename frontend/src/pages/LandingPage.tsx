import React, {useEffect, useRef, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {ArrowUpRight, ArrowRight, Leaf, MapPin, Clock3, Check, ChevronDown, X, Plus, RotateCcw, Copy, Pause, Play, Route, ArrowDown} from 'lucide-react';
import {HeroScenes} from '@/components/landing/HeroScenes';
import {places} from '@/components/landing/places';
import '@/components/landing/landing.css';

const steps=['Khám phá','Điều chỉnh','Mang theo'];
function CardTabs({active}: {active: number}) {
  return <nav className="card-tabs" aria-label={`Các bước · ${steps[active]}`}>{steps.map((label,i)=><a href={`#step-${i}`} aria-current={i===active?'step':undefined} key={label}>{label}</a>)}</nav>;
}
type City = keyof typeof places;
export default function LandingPage() {
  const location=useLocation();
  const [city,setCity]=useState<City>('danang');
  const [days,setDays]=useState(1);
  const [removed,setRemoved]=useState<string[]>([]);
  const [notice,setNotice]=useState('');
  const [sampleOpen,setSampleOpen]=useState(false);
  const [paused,setPaused]=useState(false);
  const [inView,setInView]=useState(true);
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [tabVisible,setTabVisible]=useState(!document.hidden);
  const dialog=useRef<HTMLDialogElement>(null);
  const hero=useRef<HTMLElement>(null);
  const place=places[city];
  const groups=place.groups.slice(0,days);
  const selected=groups.flat().filter(p=>!removed.includes(p.name));

  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion=(e: MediaQueryListEvent)=>setReduced(e.matches);
    const onVisibility=()=>setTabVisible(!document.hidden);
    media.addEventListener('change',onMotion);
    document.addEventListener('visibilitychange',onVisibility);
    const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.05});
    if(hero.current) observer.observe(hero.current);
    return ()=>{media.removeEventListener('change',onMotion);document.removeEventListener('visibilitychange',onVisibility);observer.disconnect();};
  },[]);
  const choose=(c: City,d: number)=>{setCity(c);setDays(d);setRemoved([]);setNotice('');};
  const openSample=(c=city,d=days)=>{
    if(c!==city||d!==days)choose(c,d);
    setSampleOpen(true);
    if(dialog.current&&!dialog.current.open)dialog.current.showModal();
  };
  const toggle=(name: string)=>{setRemoved(prev=>prev.includes(name)?prev.filter(n=>n!==name):[...prev,name]);setNotice('');};
  const restore=()=>{setRemoved([]);setNotice('Đã khôi phục các điểm của lịch mẫu.');};
  const copy=async()=>{
    const text=[`GreenTrip · ${place.name} · ${days} ngày`,'Lịch mẫu tham khảo. Kiểm tra giờ mở cửa, vé, thời tiết và thời gian di chuyển trước khi đi.',...groups.flatMap((g,i)=>[`\nNgày ${i+1}`,...g.filter(p=>!removed.includes(p.name)).map(p=>`${p.period}: ${p.name}`)])].join('\n');
    try{await navigator.clipboard.writeText(text);setNotice('Đã sao chép lịch. Dán vào ghi chú để mang theo nhé.');}
    catch{setNotice('Chưa sao chép được. Hãy mở lịch mẫu và chọn nội dung để sao chép.');}
  };

  useEffect(()=>{
    if(!sampleOpen) return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{document.body.style.overflow=previous;};
  },[sampleOpen]);

  return <div className="gt-landing">
    <a className="skip-link" href="#main">Đến nội dung chính</a>
    <main id="main">
      <section className={`hero hero-${city}`} ref={hero} aria-labelledby="hero-title">
        <HeroScenes selectedCity={city} running={inView&&tabVisible&&!paused&&!sampleOpen&&location.pathname==='/'} reduced={reduced}/>
        <div className="hero-content"><h1 id="hero-title">Khám phá Đà Nẵng, Huế.</h1><p>Chọn nơi muốn đến, xem gợi ý theo ngày.<br className="mobile-only"/> Chuyến đi bắt đầu từ đây.</p>
          <form className="hero-search" onSubmit={e=>{e.preventDefault();openSample();}}>
            <label><span><MapPin size={16}/> Bạn muốn đi đâu?</span><span className="select-wrap"><select value={city} onChange={e=>choose(e.target.value as City,days)}><option value="danang">Đà Nẵng</option><option value="hue">Huế</option></select><ChevronDown size={16}/></span></label>
            <label><span><Clock3 size={16}/> Bạn có bao lâu?</span><span className="select-wrap"><select value={days} onChange={e=>choose(city,Number(e.target.value))}>{[1,2,3].map(n=><option value={n} key={n}>{n} ngày</option>)}</select><ChevronDown size={16}/></span></label>
            <button className="button black" type="submit">Xem gợi ý <ArrowRight size={18}/></button>
          </form><p className="hero-note">Lịch mẫu có sẵn · Xem ngay, không cần tài khoản</p>
        </div>
        <button className="motion-control" onClick={()=>setPaused(!paused)} aria-label={paused?'Tiếp tục chuyển động':'Tạm dừng chuyển động'} disabled={reduced}>{paused||reduced?<Play size={14}/>:<Pause size={14}/>}</button>
        <a href="#step-0" className="hero-scroll" aria-label="Xem GreenTrip giúp bạn thế nào"><ArrowDown size={20}/></a>
      </section>

      <div className="story-intro section-width"><p>ĐI ÍT NGÀY HAY ĐI THONG THẢ</p><span>Có gợi ý để bắt đầu. Có lựa chọn để đổi ý.</span></div>
      <section id="step-0" className="feature-panel navy section-width" aria-labelledby="discover-title">
        <div className="panel-copy"><CardTabs active={0}/><h2 id="discover-title">Biết ghé đâu.<br/>Biết đi lúc nào.</h2><p>Xem các điểm dừng theo từng buổi, thay vì tự ghép một danh sách dài. Chọn một lịch mẫu rồi bắt đầu từ đó.</p><button className="panel-link" onClick={()=>openSample()}>Xem lịch {place.name} {days} ngày <ArrowUpRight size={20}/></button></div>
        <div className="panel-visual discovery-visual"><img className="panel-photo" src={place.image} srcSet={place.srcSet} sizes="(max-width: 760px) 100vw, 50vw" decoding="async" alt={place.alt} loading="lazy"/><div className="floating-schedule"><div className="paper-top"><span>LỊCH MẪU THAM KHẢO</span><Route size={18}/></div><h3>Một ngày ở {place.name}</h3><ol>{place.groups[0].map((stop,i)=><li key={stop.name}><span className="number-dot">{i+1}</span><div><small>{stop.period}</small><strong>{stop.name}</strong></div></li>)}</ol><button onClick={()=>openSample(city,1)}>Mở lịch trình <ArrowRight size={16}/></button></div><span className="visual-caption">Một gợi ý rõ ràng. Một khởi đầu nhẹ nhàng.</span></div>
      </section>
      <section id="step-1" className="feature-panel clay section-width" aria-labelledby="adjust-title">
        <div className="panel-copy"><CardTabs active={1}/><h2 id="adjust-title">Lịch có sẵn.<br/>Nhịp đi là<br/>của bạn.</h2><p>Thích một điểm thì giữ lại. Muốn dành thời gian nghỉ, bỏ bớt một điểm. Không cần đi hết mới là một chuyến đi trọn vẹn.</p><button className="panel-link" onClick={()=>openSample()}>Điều chỉnh lịch mẫu <ArrowUpRight size={20}/></button></div>
        <div className="panel-visual adjust-visual"><img className="panel-photo" src={places.hue.image} srcSet={places.hue.srcSet} sizes="(max-width: 760px) 100vw, 50vw" decoding="async" alt={places.hue.alt} loading="lazy"/><div className="choice-heading"><span>THỬ CHỌN THEO CÁCH CỦA BẠN</span><strong>Hôm nay, bạn muốn ghé đâu?</strong></div><div className="choice-stack">{place.groups[0].map((stop,i)=><button className={`choice-pill choice-${i}${removed.includes(stop.name)?' is-removed':''}`} key={stop.name} onClick={()=>toggle(stop.name)} aria-pressed={!removed.includes(stop.name)} aria-label={`${removed.includes(stop.name)?'Thêm lại':'Bỏ'} ${stop.name}`}><span className="choice-check">{removed.includes(stop.name)?<Plus size={18}/>:<Check size={18}/>}</span><span><small>{stop.period}</small><strong>{stop.name}</strong></span></button>)}</div><span className="visual-caption">Bấm vào một điểm để giữ hoặc bỏ khỏi lịch.</span></div>
      </section>
      <section id="step-2" className="feature-panel forest section-width" aria-labelledby="keep-title">
        <div className="panel-copy"><CardTabs active={2}/><h2 id="keep-title">Chốt lịch.<br/>Rồi lên đường.</h2><p>Giữ những điểm bạn đã chọn trong ghi chú để tiện mở lại. Một lịch trình vừa đủ, luôn ở bên khi cần.</p><button className="panel-link" disabled={!selected.length} onClick={copy}>Sao chép lịch của bạn <ArrowUpRight size={20}/></button><p className="panel-status" role="status">{notice}</p></div>
        <div className="panel-visual keep-visual"><div className="ticket"><div className="ticket-brand"><Leaf size={20}/><span>greentrip</span><ArrowUpRight size={17}/></div><span className="ticket-eyebrow">CHUYẾN ĐI BẮT ĐẦU TỪ ĐÂY</span><h3>{place.name}</h3><div className="ticket-details"><span><small>THỜI LƯỢNG</small>{days} ngày</span><span><small>ĐIỂM ĐÃ CHỌN</small>{selected.length} điểm</span></div><div className="ticket-divider"/><div className="ticket-stops">{selected.length?selected.slice(0,3).map(p=><p key={p.name}><Check size={14}/>{p.name}</p>):<p>Thêm lại điểm để hoàn thiện lịch.</p>}{selected.length>3&&<span>Và {selected.length-3} điểm cho những ngày tiếp theo.</span>}</div><button className="button black" onClick={copy} disabled={!selected.length}><Copy size={16}/> Sao chép lịch trình</button><small className="ticket-note">Lịch mẫu tham khảo · Chưa đồng bộ tài khoản</small></div><span className="visual-caption">Ít chuẩn bị hơn. Nhiều thời gian trải nghiệm hơn.</span></div>
      </section>

      <section id="explore" className="destinations section-width" aria-labelledby="destinations-title"><div className="section-heading"><div><p className="eyebrow">HAI ĐIỂM ĐẾN, NHIỀU CÁCH KHÁM PHÁ</p><h2 id="destinations-title">Bạn muốn bắt đầu ở đâu?</h2></div><p>Một ngày ngắn hay một chuyến đi dài.<br/>Chọn nơi bạn muốn ghé trước.</p></div><div className="destination-grid">{(Object.entries(places) as [City, typeof places[City]][]).map(([id,p])=><article className="destination-card" key={id}><button className="destination-image" onClick={()=>openSample(id,days)} aria-label={`Xem lịch mẫu ${p.name}`}><img src={p.image} srcSet={p.srcSet} sizes="(max-width: 760px) 100vw, 50vw" decoding="async" alt={p.alt} loading="lazy"/><span>{p.name}</span><span className="round-arrow"><ArrowUpRight size={24}/></span></button><div className="destination-bottom"><p>{id==='danang'?'Thành phố, biển và những khoảng nghỉ.':'Di sản, nhà vườn và một nhịp sống chậm.'}</p><div aria-label={`Lịch mẫu ${p.name}`}>{[1,2,3].map(n=><button key={n} onClick={()=>openSample(id,n)}>{n} ngày <ArrowUpRight size={13}/></button>)}</div></div></article>)}</div></section>
      <section className="closing-photo section-width"><img src="/images/landing/closing-resort-1400.webp" srcSet="/images/landing/closing-resort-640.webp 640w, /images/landing/closing-resort-1400.webp 1400w" sizes="100vw" decoding="async" alt="" loading="lazy"/><div className="closing-photo-content"><h2>Mỗi chuyến đi,<br/>nhiều bản sắc hơn.</h2><p>Chọn nơi muốn đến và số ngày bạn có.<br/>Tìm một lịch trình để bắt đầu, rồi khám phá theo cách của riêng mình.</p><button className="button" onClick={()=>openSample()}>Xem lịch trình gợi ý <ArrowRight size={18}/></button><span>Xem ngay, không cần tài khoản.</span></div></section>
    </main>
    <footer className="site-footer section-width"><div><a className="logo" href="#"><Leaf size={25}/>greentrip</a><p>Du lịch thông minh, bắt đầu từ những lựa chọn của bạn.<br/>Đà Nẵng · Huế</p></div><div className="footer-links"><Link to="/explore">Khám phá điểm đến</Link><button onClick={()=>openSample()}>Xem lịch mẫu</button><Link to="/planner">Lập lịch trình <ArrowUpRight size={14}/></Link></div><span className="copyright">© {new Date().getFullYear()} GreenTrip AI · Dự án du lịch thông minh</span></footer>
    <dialog ref={dialog} className="sample-dialog" aria-labelledby="sample-title" onClose={()=>setSampleOpen(false)} onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}>
      <div className="dialog-top"><div><span className="eyebrow">LỊCH MẪU THAM KHẢO</span><h2 id="sample-title">{place.name} · {days} ngày</h2></div><button className="icon-button" onClick={()=>dialog.current?.close()} aria-label="Đóng lịch mẫu" autoFocus><X size={23}/></button></div>
      <div className="dialog-options"><label>Điểm đến<select value={city} aria-label="Điểm đến của lịch mẫu" onChange={e=>choose(e.target.value as City,days)}><option value="danang">Đà Nẵng</option><option value="hue">Huế</option></select></label><label>Thời lượng<select value={days} aria-label="Số ngày của lịch mẫu" onChange={e=>choose(city,Number(e.target.value))}>{[1,2,3].map(n=><option value={n} key={n}>{n} ngày</option>)}</select></label><span>{selected.length} điểm đang chọn</span></div>
      <p className="sample-description">Một gợi ý theo buổi, có thể thêm/bỏ điểm ngay bên dưới. Bạn cần kiểm tra giờ mở cửa, vé, thời tiết và thời gian di chuyển trước khi đi.</p>
      <div className="dialog-days">{groups.map((g,i)=><section className="sample-day" key={`${city}-${i}`}><h3><span>{String(i+1).padStart(2,'0')}</span>Ngày {i+1}</h3><ol>{g.map(stop=>{const excluded=removed.includes(stop.name);return <li className={`sample-stop${excluded?' excluded':''}`} key={stop.name}><div className="stop-copy"><span>{stop.period} · {stop.type}</span><h4>{stop.name}</h4><p>{stop.desc}</p></div><button className="stop-button" aria-pressed={!excluded} onClick={()=>toggle(stop.name)} aria-label={`${excluded?'Thêm lại':'Bỏ'} ${stop.name}`}>{excluded?<Plus size={17}/>:<Check size={17}/>}<span>{excluded?'Thêm lại':'Đã chọn'}</span></button></li>;})}</ol></section>)}</div>
      {!selected.length&&<p className="empty-state">Bạn đã bỏ tất cả điểm. Thêm lại một điểm hoặc khôi phục lịch mẫu để tiếp tục.</p>}
      <div className="dialog-actions"><button className="button black" onClick={copy} disabled={!selected.length}><Copy size={16}/> Sao chép lịch trình</button><button className="reset-button" onClick={restore}><RotateCcw size={16}/> Khôi phục mẫu</button></div><p className="sample-status" role="status">{notice||'Thay đổi chỉ ở bản xem thử này. Sao chép lịch để giữ lại trước khi tải lại trang.'}</p>
    </dialog>
  </div>;
}
