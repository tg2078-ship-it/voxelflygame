import {THEMES,emptyMetrics,makeQuest,type SaveData,type RunResult} from "./data";

export const ACHIEVEMENTS=[
 {id:"distance100",name:"첫 이륙",description:"한 판에 100 m 비행",reward:50,target:100,kind:"distance"},
 {id:"distance1000",name:"하늘에 익숙해지다",description:"한 판에 1 km 비행",reward:100,target:1000,kind:"distance"},
 {id:"distance5000",name:"장거리 조종사",description:"한 판에 5 km 비행",reward:200,target:5000,kind:"distance"},
 {id:"distance10000",name:"지평선 너머",description:"한 판에 10 km 비행",reward:350,target:10000,kind:"distance"},
 {id:"distance25000",name:"끊임없는 비행",description:"한 판에 25 km 비행",reward:600,target:25000,kind:"distance"},
 {id:"distance50000",name:"대륙을 건너다",description:"한 판에 50 km 비행",reward:1000,target:50000,kind:"distance"},
 {id:"combo10",name:"위험을 읽는 눈",description:"한 판에 콤보 10회",reward:250,target:10,kind:"combo"},
 {id:"rings30",name:"링 마스터",description:"누적 점수 링 30개 통과",reward:200,target:30,kind:"rings"},
 {id:"coins300",name:"하늘의 수집가",description:"누적 코인 300개 수집",reward:300,target:300,kind:"coins"},
 {id:"planes3",name:"나만의 편대",description:"기체 3종 보유",reward:350,target:3,kind:"planes"},
 {id:"themes5",name:"새로운 풍경",description:"테마 5종 발견",reward:250,target:5,kind:"themes"},
 {id:"themes13",name:"세계의 모든 하늘",description:"테마 13종 모두 발견",reward:1000,target:13,kind:"themes"},
] as const;
export function discoveryCount(save:SaveData){return THEMES.filter(t=>Object.keys(save.discoveries).some(k=>k===t.id||k.startsWith(t.id+":"))).length;}
export function achievementProgress(save:SaveData,kind:typeof ACHIEVEMENTS[number]["kind"]){
 switch(kind){case "distance":return Math.max(save.bestDistance,save.bestEDistance);case "combo":return save.totals.maxCombo;case "rings":return save.totals.rings;case "coins":return save.totals.coins;case "planes":return save.owned.length;case "themes":return discoveryCount(save);}
}
export function applyRun(save:SaveData,run:RunResult):SaveData{
 const metrics=run.metrics??emptyMetrics(),eUsed=run.eUsed??false;
 const totals={distance:save.totals.distance+run.distance,coins:save.totals.coins+run.coins,rings:save.totals.rings+metrics.rings,nearMisses:save.totals.nearMisses+metrics.nearMisses,narrowPasses:save.totals.narrowPasses+metrics.narrowPasses,lowDistance:save.totals.lowDistance+metrics.lowDistance,maxCombo:Math.max(save.totals.maxCombo,run.maxCombo)};
 const discoveries={...save.discoveries};for(const [key,seconds] of Object.entries(metrics.themeTimes))if(seconds>=20){const old=discoveries[key];discoveries[key]={date:old?.date??run.date,flights:(old?.flights??0)+1,seconds:(old?.seconds??0)+seconds};}
 const increments={distance:run.distance,coins:run.coins,rings:metrics.rings,nearMisses:metrics.nearMisses,narrowPasses:metrics.narrowPasses,lowDistance:metrics.lowDistance};
 const key=run.planeId+":"+(eUsed?"e":"normal"),old=save.planeBests[key]??{distance:0,score:0,combo:0};
 return {...save,coins:save.coins+run.reward,
  bestDistance:eUsed?save.bestDistance:Math.max(save.bestDistance,run.distance),bestScore:eUsed?save.bestScore:Math.max(save.bestScore,run.score),
  bestEDistance:eUsed?Math.max(save.bestEDistance,run.distance):save.bestEDistance,bestEScore:eUsed?Math.max(save.bestEScore,run.score):save.bestEScore,
  planeBests:{...save.planeBests,[key]:{distance:Math.max(old.distance,run.distance),score:Math.max(old.score,run.score),combo:Math.max(old.combo,run.maxCombo)}},
  totals,discoveries,quests:save.quests.map(q=>({...q,progress:Math.min(q.target,q.progress+increments[q.kind])})),
  runs:[run,...save.runs].slice(0,20),settled:[run.id,...save.settled].slice(0,500),checkpoint:null};
}
export function replaceQuest(save:SaveData,id:number):SaveData|null{
 const q=save.quests.find(q=>q.id===id);if(!q||q.progress<q.target)return null;
 return {...save,coins:save.coins+q.reward,quests:save.quests.map(q=>q.id===id?makeQuest(save.nextQuest):q),nextQuest:save.nextQuest+1};
}
