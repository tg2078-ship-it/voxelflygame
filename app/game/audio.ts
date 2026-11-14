export type SoundEffect="coin"|"ring"|"hit"|"click"|"warning"|"near"|"item"|"repair"|"shield"|"trick"|"thunder";
export class FlightAudio{
 context:AudioContext|null=null;master:GainNode|null=null;fx:GainNode|null=null;musicGain:GainNode|null=null;engine:OscillatorNode|null=null;engineGain:GainNode|null=null;wind:GainNode|null=null;rain:GainNode|null=null;pads:OscillatorNode[]=[];lastChord=-1;
 start(){
  if(this.context){void this.context.resume();return;}
  try{
   const ctx=new AudioContext();this.context=ctx;const master=ctx.createGain();master.gain.value=.24;master.connect(ctx.destination);this.master=master;
   const fx=ctx.createGain();fx.gain.value=.5;fx.connect(master);this.fx=fx;
   const engine=ctx.createOscillator();engine.type="sawtooth";engine.frequency.value=62;const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=340;const gain=ctx.createGain();gain.gain.value=0;engine.connect(filter).connect(gain).connect(fx);engine.start();this.engine=engine;this.engineGain=gain;
   const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.15;
   const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const windF=ctx.createBiquadFilter();windF.type="lowpass";windF.frequency.value=1300;const wg=ctx.createGain();wg.gain.value=0;noise.connect(windF).connect(wg).connect(fx);noise.start();this.wind=wg;
   const rainF=ctx.createBiquadFilter();rainF.type="highpass";rainF.frequency.value=2200;const rg=ctx.createGain();rg.gain.value=0;noise.connect(rainF).connect(rg).connect(fx);this.rain=rg;
   // An original, quiet four-chord ambient score, synthesized without external assets.
   const mg=ctx.createGain();mg.gain.value=0;mg.connect(master);this.musicGain=mg;
   for(const frequency of [130.81,196,329.63]){const osc=ctx.createOscillator(),g=ctx.createGain();osc.type="sine";osc.frequency.value=frequency;g.gain.value=.08;osc.connect(g).connect(mg);osc.start();this.pads.push(osc);}
  }catch{}
 }
 update(speed:number,volume:number,active:boolean,jet=false,music=.3,weather=0,night=0,trick=false){
  if(!this.context||!this.master)return;const t=this.context.currentTime;
  this.fx?.gain.setTargetAtTime(volume,t,.15);this.engine?.frequency.setTargetAtTime((jet?130+speed*2:55+speed*1.2)*(trick?1.28:1),t,.12);
  this.engineGain?.gain.setTargetAtTime(active?.06:0,t,.2);this.wind?.gain.setTargetAtTime(active?Math.min(.15,speed*.0012):0,t,.3);this.rain?.gain.setTargetAtTime(active?Math.max(0,weather-.4)*.4:0,t,.6);
  this.musicGain?.gain.setTargetAtTime(active?music*(.55+night*.15):0,t,1);
  const chord=Math.floor(t/12);if(chord!==this.lastChord){this.lastChord=chord;const notes=[[48,55,64],[45,52,60],[41,48,57],[43,50,59]][chord%4];this.pads.forEach((p,i)=>p.frequency.setTargetAtTime(440*Math.pow(2,(notes[i]-69)/12),t,2));}
 }
 effect(kind:SoundEffect){
  if(!this.context||!this.fx)return;const ctx=this.context,t=ctx.currentTime;
  if(kind==="near"||kind==="thunder"){
   const length=kind==="thunder"?1.4:.22,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*length),ctx.sampleRate),a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/a.length*5);
   const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();source.buffer=buffer;filter.type="lowpass";filter.frequency.value=kind==="thunder"?250:2200;g.gain.value=kind==="thunder"?.22:.12;source.connect(filter).connect(g).connect(this.fx);source.start();source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};return;
  }
  const osc=ctx.createOscillator(),g=ctx.createGain(),base=({coin:950,ring:620,hit:90,click:440,warning:780,item:430,repair:340,shield:260,trick:150} as const)[kind];
  osc.type=kind==="hit"||kind==="trick"?"sawtooth":"sine";osc.frequency.setValueAtTime(base,t);osc.frequency.exponentialRampToValueAtTime(kind==="hit"?35:base*(kind==="trick"?4:1.6),t+(kind==="trick"?.65:.12));
  const length=kind==="trick"?.8:.25;g.gain.setValueAtTime(.09,t);g.gain.exponentialRampToValueAtTime(.001,t+length);osc.connect(g).connect(this.fx);osc.start(t);osc.stop(t+length+.02);osc.onended=()=>{osc.disconnect();g.disconnect();};
 }
 dispose(){void this.context?.close();this.context=null;this.pads=[];this.lastChord=-1;}
}
export const flightAudio=new FlightAudio();
