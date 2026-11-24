import React, {useCallback, useEffect, useRef, useState} from 'react';
import {MapPin} from 'lucide-react';
import {TravelerSprite} from './TravelerSprite';
import {places} from './places';
import './scene-motion.css';

const SCENE_HOLD_MS=6500;
const TRANSITION_MS=820;

export function HeroScenes({selectedCity,running,reduced}: {selectedCity: keyof typeof places; running: boolean; reduced: boolean}) {
  const [scene,setScene]=useState(selectedCity);
  const [transition,setTransition]=useState<{from: keyof typeof places; to: keyof typeof places; id: number} | null>(null);
  const [beat,setBeat]=useState(0);
  const [ready,setReady]=useState(false);
  const current=useRef(selectedCity);
  const changing=useRef(false);
  const timer=useRef<number | undefined>(undefined);
  const sequence=useRef(0);

  useEffect(()=>{
    // Paint the static hero and usable form before starting continuous work.
    const delay=window.setTimeout(()=>setReady(true),1600);
    return ()=>window.clearTimeout(delay);
  },[]);

  const start=useCallback((next: keyof typeof places)=>{
    if(changing.current||next===current.current)return;
    changing.current=true;
    const id=++sequence.current;
    setTransition({from:current.current,to:next,id});
    setBeat(id);
    timer.current=window.setTimeout(()=>{
      current.current=next;
      changing.current=false;
      setScene(next);
      setTransition(null);
      timer.current=undefined;
    },TRANSITION_MS);
  },[]);

  useEffect(()=>{
    // A deliberate destination selection takes priority over an in-flight scene.
    window.clearTimeout(timer.current);
    timer.current=undefined;
    changing.current=false;
    setTransition(null);
    if(reduced){current.current=selectedCity;setScene(selectedCity);}
    else start(selectedCity);
  },[selectedCity,reduced,start]);

  useEffect(()=>{
    if(!running||reduced||!ready)return;
    const interval=window.setInterval(()=>start(current.current==='danang'?'hue':'danang'),SCENE_HOLD_MS+TRANSITION_MS);
    return ()=>window.clearInterval(interval);
  },[running,reduced,ready,start,selectedCity]);

  useEffect(()=>()=>window.clearTimeout(timer.current),[]);

  const visibleScene=transition?.to??scene;
  const sceneClass=(id: string)=>transition
    ? id===transition.from?'is-exiting':id===transition.to?'is-entering':'is-standby'
    : id===scene?'is-active':'is-standby';

  return <>
    <div className="hero-scenery" aria-hidden="true" data-scene={visibleScene} data-transitioning={!!transition}>
      {Object.entries(places).map(([id,p])=><div key={id} className={`hero-scene ${sceneClass(id)}`}><div className="hero-scene-motion"><img src={p.image} srcSet={p.srcSet} sizes="100vw" decoding="async" className={`hero-scene-img image-${id}`} alt="" fetchPriority={id===selectedCity?'high':'low'}/></div></div>)}
      {transition&&<div key={transition.id} className="scene-sweep"/>}
    </div>
    <div className="hero-travelers"><TravelerSprite active={running&&ready&&!reduced} transitionId={beat} reducedMotion={reduced}/></div>
    <div className="scene-caption"><span><MapPin size={14}/>{visibleScene==='hue'?'HUẾ · NGỌ MÔN':'ĐÀ NẴNG · CẦU RỒNG'}</span><p>{visibleScene==='hue'?'Một nhịp chậm giữa lòng cố đô.':'Một khởi đầu bên dòng sông Hàn.'}</p></div>
  </>;
}
