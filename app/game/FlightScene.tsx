"use client";
import {Canvas,useFrame,useThree} from "@react-three/fiber";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "three/examples/jsm/postprocessing/OutputPass.js";
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js";
import {FlightEngine,physicsReady} from "./engine";
import {useGame} from "./store";
function Scene(){
 const {scene,camera,gl,size}=useThree();const engine=useRef<FlightEngine|null>(null),composer=useRef<EffectComposer|null>(null);
 const quality=useGame(s=>s.save.settings.quality),targetFPS=useGame(s=>s.save.settings.targetFPS),adaptive=useGame(s=>s.save.settings.adaptiveResolution);
 const renderTime=useRef(0),qualityClock=useRef({seconds:0,frames:0,stable:0}),dprRef=useRef(1.5);
 useEffect(()=>{
  const generator=new THREE.PMREMGenerator(gl),room=new RoomEnvironment(),environment=generator.fromScene(room,.04);
  scene.environment=environment.texture;scene.environmentIntensity=.32;generator.dispose();room.dispose();
  return ()=>{scene.environment=null;environment.dispose();};
 },[scene,gl]);
 useEffect(()=>{
  if(quality==="balanced")return;
  const c=new EffectComposer(gl),bloom=new UnrealBloomPass(new THREE.Vector2(size.width,size.height),.19,.42,1.18),render=new RenderPass(scene,camera),output=new OutputPass();
  c.addPass(render);c.addPass(bloom);c.addPass(output);composer.current=c;
  return ()=>{composer.current=null;bloom.dispose();output.dispose();c.dispose();};
 },[gl,scene,camera,quality]);
 useEffect(()=>{composer.current?.setPixelRatio(gl.getPixelRatio());composer.current?.setSize(size.width,size.height);},[gl,size.width,size.height,quality]);
 useEffect(()=>{
  let cancelled=false;
  void(async()=>{
   try{
    useGame.setState({progress:15});await Promise.all([physicsReady(),useGame.getState().load()]);if(cancelled)return;
    useGame.setState({progress:46});const created=new FlightEngine(scene,camera as THREE.PerspectiveCamera,gl);engine.current=created;
    useGame.setState({progress:80});await gl.compileAsync(scene,camera);if(cancelled)return;
    useGame.setState({progress:100,phase:useGame.getState().save.nickname?"menu":"profile"});
    if(import.meta.env.DEV)(window as unknown as {flightEngine?:FlightEngine}).flightEngine=created;
   }catch(error){console.error("Flight startup failed",error);useGame.setState({phase:"unsupported",saveError:"3D 화면을 시작하지 못했습니다. 페이지를 다시 열거나 다른 브라우저를 사용해 주세요."});}
  })();
  return ()=>{cancelled=true;engine.current?.dispose();engine.current=null;};
 },[scene,camera,gl]);
 useFrame((_,dt)=>{
  engine.current?.update(dt);renderTime.current+=dt;const q=qualityClock.current;q.seconds+=dt;q.frames++;
  if(q.seconds>=3){
   const fps=q.frames/q.seconds,mobile=window.matchMedia("(pointer: coarse)").matches,maximum=quality==="ultra"?2:quality==="balanced"?1:Math.min(mobile?1.25:1.5,window.devicePixelRatio||1);
   let next=gl.getPixelRatio();if(!adaptive)next=maximum;else if(fps<targetFPS*.8)next=Math.max(.7,next-.15);else if(fps>targetFPS*.94){q.stable+=q.seconds;if(q.stable>12){next=Math.min(maximum,next+.1);q.stable=0;}}else q.stable=0;
   if(Math.abs(next-gl.getPixelRatio())>.01){gl.setPixelRatio(next);composer.current?.setPixelRatio(next);composer.current?.setSize(size.width,size.height);dprRef.current=next;}
   q.seconds=0;q.frames=0;
  }
  if(targetFPS===30&&renderTime.current<1/30-.001)return;
  const elapsed=renderTime.current;renderTime.current=targetFPS===30?Math.max(0,renderTime.current-1/30):0;
  if(composer.current)composer.current.render(elapsed);else gl.render(scene,camera);
 },1);
 return null;
}
function UIOnlyPreview(){
 useEffect(()=>{
  let cancelled=false,frame=0,simulation:FlightEngine|null=null,last=performance.now();
  void Promise.all([useGame.getState().load(),physicsReady()]).then(()=>{
   if(cancelled)return;
   const renderer={shadowMap:{type:0,enabled:false},toneMapping:0,toneMappingExposure:1} as unknown as THREE.WebGLRenderer;
   simulation=new FlightEngine(new THREE.Scene(),new THREE.PerspectiveCamera(58,16/9,.2,5000),renderer);
   useGame.setState({progress:100,phase:useGame.getState().save.nickname?"menu":"profile"});
   const tick=(now:number)=>{if(cancelled)return;simulation?.update((now-last)/1000);last=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  });
  return ()=>{cancelled=true;cancelAnimationFrame(frame);simulation?.dispose();};
 },[]);
 return <div style={{position:"absolute",inset:0,background:"#1e414c"}} aria-label="개발용 UI 검사 화면"/>;
}
export default function FlightScene(){
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 const quality=useGame(s=>s.save.settings.quality);const isMobile=typeof window!=="undefined"&&window.matchMedia("(pointer: coarse)").matches;
 if(!mounted)return null;
 if(import.meta.env.DEV&&typeof window!=="undefined"&&new URLSearchParams(window.location.search).has("ui-test"))return <UIOnlyPreview/>;
 return <Canvas shadows dpr={quality==="ultra"?2:quality==="balanced"?1:Math.min(isMobile?1.25:1.5,typeof devicePixelRatio==="undefined"?1:devicePixelRatio)} camera={{fov:58,near:.2,far:5000,position:[31,14,69]}} gl={{antialias:true,alpha:false,powerPreference:"high-performance",stencil:false}} onCreated={({gl})=>{gl.setClearColor("#9fc4ca");gl.domElement.setAttribute("aria-label","3D 비행 월드");}}><Scene/></Canvas>;
}
