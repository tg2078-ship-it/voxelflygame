export type Quality = "balanced" | "high" | "ultra";
export type Phase = "loading" | "unsupported" | "profile" | "menu" | "hangar" | "takeoff" | "flying" | "paused" | "crashing" | "results";
export type ThemeId = "coast" | "village" | "city" | "ice" | "desert" | "forest" | "farm" | "korea" | "river" | "landmark" | "aurora" | "volcano" | "waterfall";
export interface Aircraft {
  id: string; name: string; kind: string; grade: "C"|"B"|"A"|"S"; price: number;
  speed: number; acceleration: number; handling: number; hp: number;
  color: string; accent: string; style: "light"|"float"|"biplane"|"sport"|"warbird"|"jet"|"fighter"; description: string;
}
export const AIRCRAFT: Aircraft[] = [
 {id:"skyhawk",name:"Cessna Skyhawk",kind:"경비행기",grade:"C",price:0,speed:1,acceleration:1,handling:1,hp:100,color:"#eceadf",accent:"#e96632",style:"light",description:"처음 비행하기 좋은 균형 잡힌 기체"},
 {id:"beaver",name:"DHC-2 Beaver",kind:"수상 경비행기",grade:"C",price:600,speed:.96,acceleration:.94,handling:.92,hp:125,color:"#e5c963",accent:"#263e4b",style:"float",description:"조금 느리지만 충돌에 강한 수상 기체"},
 {id:"stearman",name:"Stearman Model 75",kind:"클래식 복엽기",grade:"B",price:1500,speed:1.02,acceleration:1.08,handling:1.10,hp:120,color:"#e9ba45",accent:"#254d67",style:"biplane",description:"안정적인 비행을 즐기는 클래식 복엽기"},
 {id:"pitts",name:"Pitts S-2C",kind:"곡예 복엽기",grade:"B",price:1800,speed:1.06,acceleration:1.16,handling:1.18,hp:105,color:"#e85647",accent:"#f4eedf",style:"biplane",description:"작은 틈을 빠르게 통과하는 민첩한 기체"},
 {id:"extra",name:"EXTRA 330LX",kind:"곡예·레이싱",grade:"A",price:4500,speed:1.08,acceleration:1.24,handling:1.28,hp:120,color:"#f0ece1",accent:"#35a3ac",style:"sport",description:"정밀한 조종과 빠른 반응에 강한 곡예기"},
 {id:"mustang",name:"P-51D Mustang",kind:"클래식 전투기",grade:"A",price:5500,speed:1.12,acceleration:1.30,handling:1.12,hp:140,color:"#a9b8ba",accent:"#d4553b",style:"warbird",description:"속도와 내구도를 갖춘 클래식 전투기"},
 {id:"albatros",name:"L-39 Albatros",kind:"제트기",grade:"S",price:10000,speed:1.14,acceleration:1.36,handling:1.32,hp:140,color:"#e3e6e5",accent:"#3c7898",style:"jet",description:"제트 등급의 안정적인 고성능 기체"},
 {id:"falcon",name:"F-16 Fighting Falcon",kind:"전투 제트기",grade:"S",price:12000,speed:1.18,acceleration:1.45,handling:1.38,hp:125,color:"#a2adb4",accent:"#ea994f",style:"fighter",description:"빠른 속도와 날카로운 조종 반응의 기체"},
];
export interface Theme {id:ThemeId;name:string;en:string;color:string;ground:string;foliage:string;sky:string;special?:boolean;variant?:number;}
export const THEMES: Theme[]=[
 {id:"coast",name:"해안",en:"SUNLIT COAST",color:"#dfb36a",ground:"#a3af70",foliage:"#476f50",sky:"#92c9d1"},
 {id:"village",name:"마을",en:"WINDMILL VALLEY",color:"#92b271",ground:"#9aa96a",foliage:"#4e7958",sky:"#b4d6d0"},
 {id:"city",name:"도시",en:"SKYLINE DISTRICT",color:"#73a5b3",ground:"#818e82",foliage:"#527762",sky:"#acc9ce"},
 {id:"ice",name:"설원·빙하",en:"GLACIER PASS",color:"#b8e2e9",ground:"#d7e5e4",foliage:"#8aafa9",sky:"#aacddd"},
 {id:"desert",name:"사막·협곡",en:"REDSTONE CANYON",color:"#d99659",ground:"#b97e51",foliage:"#8b9570",sky:"#c7ccc1"},
 {id:"forest",name:"숲·산악·호수",en:"ALPINE LAKES",color:"#7fa59b",ground:"#6e8873",foliage:"#355e53",sky:"#adcad0"},
 {id:"farm",name:"농촌·초원",en:"GOLDEN FIELDS",color:"#c8b36a",ground:"#9faa6b",foliage:"#4e7356",sky:"#bfd4c8"},
 {id:"korea",name:"한국",en:"KOREAN LANDSCAPES",color:"#bb8071",ground:"#849882",foliage:"#4f7161",sky:"#b4cbd0"},
 {id:"river",name:"강",en:"RIVERBEND",color:"#66aaba",ground:"#8fa382",foliage:"#547764",sky:"#9fcbd0"},
 {id:"landmark",name:"랜드마크",en:"MONUMENT VALLEY",color:"#bcac86",ground:"#a79779",foliage:"#718476",sky:"#c5cfc8"},
 {id:"aurora",name:"오로라 빙하 해안",en:"NORTHERN LIGHTS",color:"#78cbb3",ground:"#c7ddd9",foliage:"#7eaaa6",sky:"#a1c1d0",special:true},
 {id:"volcano",name:"화산섬",en:"EMBER ISLAND",color:"#e78248",ground:"#575f5a",foliage:"#557768",sky:"#b1c4c0",special:true},
 {id:"waterfall",name:"거대 폭포 협곡",en:"FALLING WATERS",color:"#85c6c6",ground:"#6e9b88",foliage:"#3e6d59",sky:"#a7ccd0",special:true},
];
export const THEME_SECONDS=180;
export const GEAR_RATIOS=[.70,.85,1,1.15,1.35];
export const UPGRADE_UNITS={C:50,B:80,A:130,S:200};
export function baseSpeed(distance:number){return 32+2.5*Math.log1p(Math.max(0,distance)/1000)+.00025*Math.max(0,distance);}
export function aircraftStats(plane:Aircraft,level:number){
 return {speed:plane.speed*(1+.005*(level-1)),acceleration:plane.acceleration*(1+.02*(level-1)),handling:plane.handling*(1+.015*(level-1)),hp:plane.hp+3*(level-1)};
}
export function randomSeed(){return Math.floor(Math.random()*0x7fffffff);}
export function hash(n:number){n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
export function seeded(seed:number){let n=seed>>>0;return ()=>{n+=0x6d2b79f5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function themeTimeline(seed:number,slot:number):Theme {
 const output:ThemeId[]=["coast","village","city"];let bag:ThemeId[]=[];const rng=seeded(seed^0x16a971);
 for(let i=3;i<=slot;i++){
  const prev=output[i-1];if(!THEMES.find(t=>t.id===prev)?.special&&rng()<.15){
   const special=THEMES.filter(t=>t.special&&t.id!==output[i-2]);output.push(special[Math.floor(rng()*special.length)].id);continue;
  }
  if(bag.length===0){bag=THEMES.filter(t=>!t.special).map(t=>t.id);for(let j=bag.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[bag[j],bag[k]]=[bag[k],bag[j]];}}
  let index=bag.findIndex(t=>t!==output[i-1]&&t!==output[i-2]);
  if(index<0){bag=THEMES.filter(t=>!t.special&&t.id!==output[i-1]&&t.id!==output[i-2]).map(t=>t.id);index=Math.floor(rng()*bag.length);}
  output.push(bag.splice(index,1)[0]);
 }
 const theme=THEMES.find(t=>t.id===output[Math.max(0,slot)])??THEMES[0];
 if(theme.id==="korea")return {...theme,variant:(Math.floor(hash(seed^0x772)*4)+output.filter(t=>t==="korea").length-1)%4};
 return theme;
}
export function formatDistance(d:number){return d<1000?Math.floor(d).toLocaleString("ko-KR")+" m":(d/1000).toFixed(2)+" km";}
export type RunMode="endless"|"practice";
export type WeatherChoice="natural"|"clear"|"cloudy"|"rain"|"storm"|"fog";
export interface PracticeConfig {planeId:string;theme:ThemeId;variant:number;light:"cycle"|"day"|"night";weather:WeatherChoice;}
export const DEFAULT_PRACTICE:PracticeConfig={planeId:"skyhawk",theme:"coast",variant:0,light:"day",weather:"clear"};
export type EffectKind="shield"|"multiplier"|"slow"|"turbo"|"repair";
export type PickupKind="coin"|"ring"|"crystal"|EffectKind;
export const EFFECTS:Record<EffectKind,{name:string;color:string;seconds:number}>={shield:{name:"보호막",color:"#70ceef",seconds:10},multiplier:{name:"점수 ×2",color:"#d5a6ef",seconds:12},slow:{name:"슬로우 타임",color:"#99ddbf",seconds:6},turbo:{name:"터보",color:"#ffab69",seconds:5},repair:{name:"수리 +35",color:"#b9e689",seconds:0}};
export const SKINS=[{id:"default",name:"기본 도장",price:0,color:"",accent:""},{id:"ocean",name:"오션 블루",price:600,color:"#3e91b0",accent:"#dce5d9"},{id:"sunrise",name:"선라이즈 오렌지",price:600,color:"#e48741",accent:"#243f54"},{id:"midnight",name:"미드나이트 블랙",price:800,color:"#293b47",accent:"#d1ae72"}] as const;
export type SkinId=typeof SKINS[number]["id"];
export function paintedAircraft(p:Aircraft,skin:SkinId="default"):Aircraft{const s=SKINS.find(s=>s.id===skin);return s&&skin!=="default"?{...p,color:s.color,accent:s.accent}:p;}
export interface Settings {control:"hold"|"gear";quality:Quality;volume:number;music:number;sensitivity:number;reducedMotion:boolean;skipTakeoff:boolean;leftHanded:boolean;targetFPS:30|60;adaptiveResolution:boolean;}
export const DEFAULT_SETTINGS:Settings={control:"hold",quality:"high",volume:.5,music:.3,sensitivity:1,reducedMotion:false,skipTakeoff:false,leftHanded:false,targetFPS:60,adaptiveResolution:true};
export interface RunMetrics {rings:number;nearMisses:number;narrowPasses:number;lowDistance:number;themeTimes:Record<string,number>;}
export function emptyMetrics():RunMetrics{return {rings:0,nearMisses:0,narrowPasses:0,lowDistance:0,themeTimes:{}};}
export interface RunResult {id:string;date:string;planeId:string;distance:number;score:number;bonus:number;coins:number;maxCombo:number;reward:number;theme:ThemeId;interrupted?:boolean;mode?:RunMode;eUsed?:boolean;metrics?:RunMetrics;newBest?:boolean;}
export type QuestKind="distance"|"coins"|"rings"|"nearMisses"|"narrowPasses"|"lowDistance";
export interface Quest {id:number;kind:QuestKind;label:string;target:number;progress:number;reward:number;}
export const QUEST_POOL:Omit<Quest,"id"|"progress">[]=[
 {kind:"distance",label:"누적 2 km 비행",target:2000,reward:80},{kind:"coins",label:"코인 40개 수집",target:40,reward:80},{kind:"rings",label:"점수 링 5개 통과",target:5,reward:100},
 {kind:"nearMisses",label:"근접 통과 10회",target:10,reward:120},{kind:"lowDistance",label:"저공으로 1 km 비행",target:1000,reward:120},{kind:"narrowPasses",label:"좁은 게이트 4회 통과",target:4,reward:150},
 {kind:"distance",label:"누적 8 km 비행",target:8000,reward:180},{kind:"coins",label:"코인 80개 수집",target:80,reward:160},{kind:"rings",label:"점수 링 12개 통과",target:12,reward:200},
];
export function makeQuest(id:number):Quest{return {...QUEST_POOL[id%QUEST_POOL.length],id,progress:0};}
export interface Discovery {date:string;flights:number;seconds:number;}
export interface RecordBest {distance:number;score:number;combo:number;}
export interface SaveData {schemaVersion:2;nickname:string;coins:number;selected:number;owned:string[];levels:Record<string,number>;settings:Settings;bestDistance:number;bestScore:number;bestEDistance:number;bestEScore:number;planeBests:Record<string,RecordBest>;runs:RunResult[];settled:string[];checkpoint:RunResult|null;skins:Record<string,SkinId[]>;skinSelected:Record<string,SkinId>;quests:Quest[];nextQuest:number;achievements:string[];discoveries:Record<string,Discovery>;totals:{distance:number;coins:number;rings:number;nearMisses:number;narrowPasses:number;lowDistance:number;maxCombo:number};}
export function freshSave():SaveData {return {schemaVersion:2,nickname:"",coins:0,selected:0,owned:["skyhawk"],levels:{skyhawk:1},settings:{...DEFAULT_SETTINGS},bestDistance:0,bestScore:0,bestEDistance:0,bestEScore:0,planeBests:{},runs:[],settled:[],checkpoint:null,skins:{},skinSelected:{},quests:[0,1,2].map(makeQuest),nextQuest:3,achievements:[],discoveries:{},totals:{distance:0,coins:0,rings:0,nearMisses:0,narrowPasses:0,lowDistance:0,maxCombo:0}};}
export const KOREA_VARIANTS=["현대 도심·한강","한옥·궁궐·성곽","논밭·산촌","항구·해안 도시"];
export const THEME_DETAILS:Record<ThemeId,{description:string;landmark:string;obstacles:string}>={
 coast:{description:"바다를 따라 절벽과 모래사장, 항구를 지나는 비행입니다.",landmark:"연안 대교 · 등대 · 항구",obstacles:"배의 돛대 · 크레인 · 교량"},
 village:{description:"붉은 지붕과 풍차가 이어지는 작은 마을입니다.",landmark:"풍차 · 교회 · 들판",obstacles:"나무 · 지붕 · 풍차"},
 city:{description:"빌딩 숲과 도로 사이에서 고도를 읽어야 합니다.",landmark:"스카이라인 · 공장 · 스카이워크",obstacles:"건물 · 드론 · 크레인"},
 ice:{description:"눈 덮인 평원과 층층이 쌓인 빙벽을 탐험합니다.",landmark:"얼음 호수 · 빙하 통로",obstacles:"빙주 · 설송 · 빙벽"},
 desert:{description:"붉은 암벽과 모래 언덕이 만드는 거대한 협곡입니다.",landmark:"그랜드캐니언 참고 지형 · 철도",obstacles:"암주 · 협곡 천장 · 열차"},
 forest:{description:"침엽수 숲 너머 산봉우리와 고요한 호수가 나타납니다.",landmark:"산악 호수 · 자연 암문",obstacles:"굵은 나무 · 능선 · 바위"},
 farm:{description:"논밭과 황금빛 들판, 풍력발전기가 이어집니다.",landmark:"농장 · 철도 · 풍력발전기",obstacles:"나무 · 헛간 · 회전 날개"},
 korea:{description:"도심·전통·산촌·해안의 네 가지 한국 풍경입니다.",landmark:"남산서울타워 · 궁궐 · 광안대교 참고 모델",obstacles:"한강 다리 · 성곽 · 항구 구조물"},
 river:{description:"넓은 강과 지류, 강변의 작은 도시를 따라 비행합니다.",landmark:"강변 대교 · 섬 · 선박",obstacles:"교량 · 선박 · 강변 나무"},
 landmark:{description:"실제 명소에서 얻은 인상과 가상의 건축을 섞은 구간입니다.",landmark:"절벽 성채 · 기념 아치",obstacles:"대형 구조물 · 암벽"},
 aurora:{description:"차가운 빙하 해안의 밤에 오로라가 펼쳐집니다.",landmark:"오로라 · 얼음 바다",obstacles:"빙벽 · 설송 · 새 떼"},
 volcano:{description:"검은 바위와 용암빛, 얕은 화산재가 있는 섬입니다.",landmark:"화산 분화구 · 용암 사면",obstacles:"암벽 · 돛대 · 새 떼"},
 waterfall:{description:"협곡 양쪽의 거대한 폭포와 물안개를 통과합니다.",landmark:"나이아가라 참고 폭포 · 협곡 대교",obstacles:"폭포 암벽 · 다리 · 나무"},
};
