import {EFFECTS,type EffectKind} from "./data";

// Expiry follows active flight time, so pause freezes every effect without drift.
export class FlightEffects {
 until={shield:0,multiplier:0,slow:0,turbo:0};
 reset(){this.until={shield:0,multiplier:0,slow:0,turbo:0};}
 active(kind:keyof FlightEffects["until"],time:number){return this.until[kind]>time+1e-8;}
 apply(kind:EffectKind,time:number){
  if(kind==="repair")return;
  this.until[kind]=time+EFFECTS[kind].seconds;
  if(kind==="slow")this.until.turbo=0;
  if(kind==="turbo")this.until.slow=0;
 }
 defend(time:number){if(!this.active("shield",time))return false;this.until.shield=0;return true;}
 speed(time:number){return this.active("slow",time)?.65:this.active("turbo",time)?1.25:1;}
 score(time:number){return this.active("multiplier",time)?2:1;}
 hud(time:number){return (Object.keys(this.until) as (keyof FlightEffects["until"])[]).filter(k=>this.active(k,time)).map(kind=>({kind,remaining:this.until[kind]-time}));}
}
