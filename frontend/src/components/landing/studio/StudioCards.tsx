import {DanangMiniMapCard} from './DanangMiniMapCard';
import {DaNangHueFoodCard} from './DaNangHueFoodCard';
import {TripPlannerCard} from './TripPlannerCard';
import './studio-cards.css';
export default function StudioCards({onNature,onFood,onPlan}: {onNature:()=>void;onFood:(dish:string)=>void;onPlan:()=>void}) {
  return <div className="studio-cards"><div id="step-0"><DanangMiniMapCard onOpenDanangItinerary={onNature}/></div><DaNangHueFoodCard onFindDish={onFood}/><TripPlannerCard onStartPlanning={onPlan}/></div>;
}
