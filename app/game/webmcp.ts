import {AIRCRAFT} from "./data";
import {useGame} from "./store";
interface Registry {registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>unknown;}
export function registerFlightTools(context?:Registry){
 const registry=context??(document as unknown as {modelContext?:Registry}).modelContext;if(!registry?.registerTool)return ()=>{};const life=new AbortController();
 const register=(name:string,title:string,description:string,schema:object,readOnly:boolean,execute:(input:unknown)=>unknown)=>{
  try{const result=registry.registerTool({name,title,description,inputSchema:schema,annotations:{readOnlyHint:readOnly,untrustedContentHint:false},execute},{signal:life.signal});if(result&&typeof(result as Promise<void>).catch==="function")void(result as Promise<void>).catch(()=>{});}catch{}
 };
 register("get_flight_status","비행 상태 확인","Read the current flight state, selected aircraft, distance and locally saved personal record.",{type:"object",properties:{},additionalProperties:false},true,()=>{
  const s=useGame.getState();return {phase:s.phase,plane:AIRCRAFT[s.save.selected].name,distance:Math.floor(s.hud.distance),bestDistance:s.save.bestDistance,coins:s.save.coins};
 });
 register("select_aircraft","기체 선택","Select a displayed aircraft in the hangar. Does not buy or upgrade the aircraft.",{type:"object",properties:{planeId:{type:"string",enum:AIRCRAFT.map(p=>p.id)}},required:["planeId"],additionalProperties:false},false,v=>{
  if(!v||typeof v!=="object"||Object.keys(v).length!==1||typeof(v as {planeId:unknown}).planeId!=="string")throw new Error("planeId is required");const s=useGame.getState();if(!["menu","hangar"].includes(s.phase))throw new Error("Aircraft selection is available in the hangar");const i=AIRCRAFT.findIndex(p=>p.id===(v as {planeId:string}).planeId);if(i<0)throw new Error("Unknown aircraft");s.select(i);s.setPhase("hangar");return {plane:AIRCRAFT[i].name,owned:s.save.owned.includes(AIRCRAFT[i].id)};
 });
 register("start_flight","비행 시작","Start a new endless flight with the selected owned aircraft. The takeoff sequence begins.",{type:"object",properties:{},additionalProperties:false},false,v=>{
  if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).length)throw new Error("No arguments expected");const s=useGame.getState();if(!["hangar","menu","results"].includes(s.phase))throw new Error("Finish or pause the active flight first");if(!s.save.owned.includes(AIRCRAFT[s.save.selected].id))throw new Error("Selected aircraft is locked");s.start();return {phase:useGame.getState().phase};
 });
 register("pause_flight","비행 일시정지","Pause an active flight without ending it.",{type:"object",properties:{},additionalProperties:false},false,v=>{
  if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).length)throw new Error("No arguments expected");const s=useGame.getState();if(!["flying","takeoff"].includes(s.phase))throw new Error("No active flight");s.pause();return {phase:useGame.getState().phase};
 });
 return ()=>life.abort();
}
