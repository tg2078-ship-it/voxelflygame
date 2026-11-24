import assert from 'node:assert/strict';
import { ensureQuests } from '../../app/airrun/progression';
import { parseSave, recoverPilot } from '../../app/airrun/state';
import { freshSave } from '../../app/airrun/data';

const pilot = ensureQuests(freshSave());
Object.assign(pilot,{ nickname:'SKIPPER', coins:1740, owned:['skyhawk','beaver'], levels:{skyhawk:4,beaver:7}, selected:'beaver' });
const patches = [
    {nickname:'TOO LONG TO FIT THIS PILOT NAME'}, {quests:pilot.quests.slice(1)},
    {levels:{...pilot.levels,extra:0},owned:[...pilot.owned,'obsolete']},
    {selected:'obsolete'}, {skins:{beaver:['removed']}}, {skinSelected:{beaver:'missing'}},
    {achievements:['missing']}, {runs:[{}]}, {bests:{corrupt:{score:-1}}},
    {landmarks:{corrupt:{}}}, {discoveries:{corrupt:false}}, {settings:{...pilot.settings,sensitivity:80}},
    {tickets:-5}, {settled:[7]}, {dailyRecords:{invalid:1}}
];
for (const patch of patches) {
    const recovered = recoverPilot({...pilot,...patch});
    assert(recovered && recovered.fields.length,JSON.stringify(patch));
    assert(parseSave(recovered.save)); assert.equal(recovered.save.coins,1740);
    assert.deepEqual(recovered.save.owned,pilot.owned);
    assert.deepEqual(recovered.save.levels,pilot.levels);
}
assert(!recoverPilot({schema:37}));
console.log('15 damaged pilot fields independently recovered.');

const {GameAudio} = await import('../../app/airrun/audio');
const previousFetch = globalThis.fetch;
let unavailable: string[] = [];
const sound = new GameAudio(files => { unavailable=files; });
sound.context = { decodeAudioData: async () => {throw Error('invalid audio');} } as unknown as AudioContext;
globalThis.fetch = async path => String(path).includes('jet')
    ? new Response(new Uint8Array([0,1])) : new Response(null,{status:404});
try {
    await sound.load();
    assert(sound.ready);
    assert.deepEqual(unavailable.sort(), ['city','forest','jet','propeller','rain','waves','wind']);
} finally {
    globalThis.fetch = previousFetch;
}
