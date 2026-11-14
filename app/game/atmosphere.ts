import * as THREE from "three";
import {hash,seeded,type Theme,type PracticeConfig} from "./data";
import {VoxelBatch,materialBank} from "./voxels";
const SKY_VERTEX=["varying vec3 vDirection;","void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"].join("\n");
const SKY_FRAGMENT=[
 "precision highp float;varying vec3 vDirection;uniform vec3 uSun;uniform float uNight;uniform float uCloud;uniform vec3 uSky;uniform float uTime;",
 "void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.0);vec3 day=mix(vec3(.82,.84,.74),uSky,pow(h,.38));vec3 night=mix(vec3(.055,.115,.16),vec3(.014,.04,.085),pow(h,.5));float sundot=max(dot(d,normalize(uSun)),0.0);float glow=pow(sundot,24.0);day=mix(day,vec3(1.0,.69,.38),glow*.4);vec3 c=mix(day,night,uNight);float disc=smoothstep(.9993,.99975,sundot);float corona=pow(sundot,520.0)*.55;c+=vec3(1.0,.84,.55)*(disc*2.2+corona)*(1.0-uNight)*(1.0-uCloud*.55);c=mix(c,mix(vec3(.62,.70,.69),vec3(.055,.10,.14),uNight),uCloud*.30);gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
].join("\n");
const WATER_VERTEX=["varying vec3 vWorld;varying vec3 vNormal;uniform float uTime;","void main(){vec3 p=position;p.z+=sin(position.x*.053+uTime*.8)*.08+sin(position.y*.075-uTime*.65)*.07;vec4 wp=modelMatrix*vec4(p,1.0);vWorld=wp.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*viewMatrix*wp;}"].join("\n");
const WATER_FRAGMENT=[
 "precision highp float;varying vec3 vWorld;varying vec3 vNormal;uniform float uTime;uniform float uNight;uniform float uWeather;uniform vec3 uSun;uniform vec3 uFog;uniform vec3 uCamera;",
 "void main(){vec2 p=vWorld.xz;float w1=sin(p.x*.12+p.y*.07+uTime*1.3);float w2=sin(p.x*.24-p.y*.09-uTime*.9);vec3 n=normalize(vec3(w1*.045,1.0,w2*.04));vec3 v=normalize(uCamera-vWorld);float fres=pow(1.0-max(dot(n,v),0.0),3.0);vec3 deep=mix(vec3(.035,.30,.34),vec3(.018,.07,.12),uNight);vec3 reflected=mix(vec3(.50,.72,.73),vec3(.045,.12,.17),uNight);vec3 c=mix(deep,reflected,fres*.83);vec3 halfV=normalize(v+normalize(uSun));float spec=pow(max(dot(n,halfV),0.0),210.0);float flakes=smoothstep(.94,.997,sin(p.x*1.03+w1)*sin(p.y*.82+w2));c+=vec3(.94,.79,.47)*(spec*.95+flakes*.075)*(1.0-uNight)*(1.0-uWeather*.45);float fog=1.0-exp(-distance(uCamera,vWorld)*.0016);c=mix(c,uFog,clamp(fog,0.0,.97));gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
].join("\n");
export class Atmosphere{
 root=new THREE.Group();sun=new THREE.DirectionalLight("#ffe0a3",3.0);ambient=new THREE.HemisphereLight("#bcdde0","#596a56",2.0);
 sky:THREE.Mesh;water:THREE.Mesh;clouds:THREE.Group;stars:THREE.Points;rain:THREE.LineSegments;aurora:THREE.Mesh;
 warning:THREE.Mesh;smoke=new THREE.Group();bolt:THREE.Line;flashRemaining=0;skyMat:THREE.ShaderMaterial;waterMat:THREE.ShaderMaterial;night=0;weather=0;weatherName="맑음";private rainArray:Float32Array;private rainSeed:Float32Array;
 private sunDir=new THREE.Vector3(.5,.26,.6);private targetSky=new THREE.Color("#6aa9bd");private fog=new THREE.Color();
 constructor(){
  this.skyMat=new THREE.ShaderMaterial({vertexShader:SKY_VERTEX,fragmentShader:SKY_FRAGMENT,side:THREE.BackSide,depthWrite:false,uniforms:{uSun:{value:this.sunDir},uNight:{value:0},uCloud:{value:0},uSky:{value:new THREE.Color("#78b7ca")},uTime:{value:0}}});
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(4500,32,20),this.skyMat);this.sky.frustumCulled=false;this.sky.renderOrder=-1000;this.root.add(this.sky);
  this.waterMat=new THREE.ShaderMaterial({vertexShader:WATER_VERTEX,fragmentShader:WATER_FRAGMENT,uniforms:{uTime:{value:0},uNight:{value:0},uWeather:{value:0},uSun:{value:this.sunDir},uFog:{value:new THREE.Color("#b7cbc6")},uCamera:{value:new THREE.Vector3()}}});
  this.water=new THREE.Mesh(new THREE.PlaneGeometry(3500,5000,64,64),this.waterMat);this.water.rotation.x=-Math.PI/2;this.water.position.y=-.10;this.root.add(this.water);
  this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-110,right:110,top:100,bottom:-100,near:5,far:500});this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.8;this.root.add(this.sun,this.sun.target,this.ambient);
  const rng=seeded(650491),stars=new Float32Array(1100*3);for(let i=0;i<1100;i++){const a=rng()*Math.PI*2,t=.1+rng()*.9,r=Math.sqrt(1-t*t);stars[i*3]=Math.cos(a)*r*2300;stars[i*3+1]=t*2300;stars[i*3+2]=Math.sin(a)*r*2300;}
  const starG=new THREE.BufferGeometry();starG.setAttribute("position",new THREE.BufferAttribute(stars,3));this.stars=new THREE.Points(starG,new THREE.PointsMaterial({color:"#c8dacf",size:2.7,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false}));this.root.add(this.stars);
  this.clouds=new THREE.Group();const cb=new VoxelBatch();
  for(let i=0;i<38;i++){const x=(rng()-.5)*1900,y=140+rng()*170,z=(rng()-.5)*2500;
   for(let j=0;j<14;j++){const w=13+rng()*27;cb.add(x+(rng()-.5)*95,y+(rng()-.5)*21,z+(rng()-.5)*75,w,8+rng()*17,15+rng()*23,j<5?"#d0ddd4":"#e7e6d6");}
  }
  this.clouds.add(cb.build(materialBank.solid,false));this.root.add(this.clouds);
  const rainCount=1200;this.rainArray=new Float32Array(rainCount*6);this.rainSeed=new Float32Array(rainCount*3);
  for(let i=0;i<rainCount;i++){this.rainSeed[i*3]=(rng()-.5)*110;this.rainSeed[i*3+1]=rng()*80;this.rainSeed[i*3+2]=(rng()-.5)*140;}
  const rainG=new THREE.BufferGeometry();rainG.setAttribute("position",new THREE.BufferAttribute(this.rainArray,3));this.rain=new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({color:"#b3d0d0",transparent:true,opacity:.25,depthWrite:false}));this.rain.frustumCulled=false;this.root.add(this.rain);
  const au=new THREE.PlaneGeometry(1700,250,100,1);const ap=au.getAttribute("position");for(let i=0;i<ap.count;i++){const x=ap.getX(i);ap.setZ(i,Math.sin(x*.008)*100);ap.setY(i,ap.getY(i)+Math.sin(x*.012)*35);}
  this.aurora=new THREE.Mesh(au,new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{uTime:{value:0},uOpacity:{value:0}},vertexShader:["varying vec2 vUv;uniform float uTime;void main(){vUv=uv;vec3 p=position;p.z+=sin(position.x*.006+uTime*.1)*35.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}"].join("\n"),fragmentShader:["varying vec2 vUv;uniform float uTime;uniform float uOpacity;void main(){float strands=.55+.45*sin(vUv.x*330.0+sin(vUv.x*30.0+uTime*.18)*6.0);float edge=sin(vUv.y*3.14159);vec3 c=mix(vec3(.20,.84,.61),vec3(.41,.32,.72),vUv.y);gl_FragColor=vec4(c,strands*edge*edge*uOpacity*.45);}"].join("\n")}));
  this.root.add(this.aurora);
  this.warning=new THREE.Mesh(new THREE.TorusGeometry(5,.14,4,48),new THREE.MeshBasicMaterial({color:"#ffc675",transparent:true,opacity:.85,depthWrite:false}));this.warning.visible=false;this.root.add(this.warning);
  const bg=new THREE.BufferGeometry();bg.setAttribute("position",new THREE.BufferAttribute(new Float32Array(54),3));this.bolt=new THREE.Line(bg,new THREE.LineBasicMaterial({color:"#c9e3ff",transparent:true,opacity:.95}));this.bolt.visible=false;this.bolt.frustumCulled=false;this.root.add(this.bolt);
  const sb=new VoxelBatch();for(let i=0;i<12;i++)sb.add(Math.sin(i*1.4)*.7,i*.35,-i*1.1,.4+i*.16,.4+i*.19,.4+i*.13,i%2?"#6e7974":"#506569");this.smoke.add(sb.build(new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.24,depthWrite:false}),false));this.smoke.visible=false;this.root.add(this.smoke);
 }
 flash(position:THREE.Vector3,danger:boolean){
  this.flashRemaining=.38;this.bolt.position.copy(position);this.bolt.visible=true;
  const points=this.bolt.geometry.getAttribute("position") as THREE.BufferAttribute;
  for(let i=0;i<points.count;i++)points.setXYZ(i,i===0?0:Math.sin(i*6.71)*6,i*18,i===0?0:Math.cos(i*4.31)*4);
  points.needsUpdate=true;(this.bolt.material as THREE.LineBasicMaterial).color.set(danger?"#ffe4ad":"#c9e3ff");
 }
 update(dt:number,time:number,camera:THREE.Camera,position:THREE.Vector3,theme:Theme,quality:string,lobby=false,next?:Theme,practice?:PracticeConfig,reducedMotion=false){
  const t=lobby?38:time,cycle=practice?.light==="day"?45:practice?.light==="night"?145:t%180;let nightTarget=cycle<112?0:cycle<120?(cycle-112)/8:cycle<170?1:(180-cycle)/10;
  nightTarget=THREE.MathUtils.smoothstep(nightTarget,0,1);this.night=THREE.MathUtils.damp(this.night,nightTarget,dt>.03?8:4,dt);
  const weatherSlot=Math.floor(t/90);let weatherTarget=lobby?0:t<180?.06:t<360?.25:t<540?.55:[0,.20,.50,.72,.28,.07][Math.floor(hash(weatherSlot*113+193)*6)];
  if(theme.id==="desert")weatherTarget*=.35;if(theme.id==="ice"||theme.id==="aurora")weatherTarget*=.65;
  if(practice&&practice.weather!=="natural")weatherTarget={clear:.06,cloudy:.28,rain:.56,storm:.78,fog:.36}[practice.weather];
  this.weather=THREE.MathUtils.damp(this.weather,weatherTarget,.12,dt);this.weatherName=this.weather<.17?"맑음":this.weather<.42?"흐림":this.weather<.65?"비":"폭풍";
  if(practice?.weather==="fog")this.weatherName="안개";else if((theme.id==="ice"||theme.id==="aurora")&&this.weather>.42)this.weatherName="눈";
  const angle=cycle<120?.10+(cycle/120)*Math.PI:Math.PI+(cycle-120)/60*Math.PI;
  this.sunDir.set(.46,Math.max(.10,Math.sin(angle)),.7).normalize();
  this.sky.position.copy(camera.position);this.stars.position.copy(camera.position);this.skyMat.uniforms.uNight.value=this.night;this.skyMat.uniforms.uCloud.value=this.weather;this.skyMat.uniforms.uTime.value=t;
  this.targetSky.set(theme.sky);if(next)this.targetSky.lerp(new THREE.Color(next.sky),THREE.MathUtils.smoothstep(cycle,160,180));this.targetSky.multiplyScalar(.88);this.skyMat.uniforms.uSky.value.lerp(this.targetSky,Math.min(1,dt*.4));
  this.sun.intensity=(3.2*(1-this.night)+.28*this.night)*(1-this.weather*.5);this.sun.color.set(this.night>.5?"#8faac8":cycle>90?"#ffd199":"#ffe2b4");
  this.ambient.intensity=1.55*(1-this.night)+.66*this.night;this.ambient.color.set(this.night>.5?"#8aafc4":"#c5dce0");this.ambient.groundColor.set(this.night>.5?"#24414e":"#677b64");
  this.sun.position.copy(position).addScaledVector(this.sunDir,220);this.sun.target.position.copy(position);
  this.fog.copy(this.targetSky).multiplyScalar(1/.88).lerp(new THREE.Color("#233e50"),this.night*.82).lerp(new THREE.Color("#7e999e"),this.weather*.30);
  this.water.visible=!lobby;this.water.position.z=position.z+900;this.waterMat.uniforms.uTime.value=t;this.waterMat.uniforms.uNight.value=this.night;this.waterMat.uniforms.uWeather.value=this.weather;this.waterMat.uniforms.uCamera.value.copy(camera.position);this.waterMat.uniforms.uFog.value.copy(this.fog);
  this.clouds.position.z=position.z+Math.sin(t*.004)*300;this.clouds.position.x=Math.sin(t*.012)*40;this.clouds.position.y=this.weather* -25;
  (this.stars.material as THREE.PointsMaterial).opacity=this.night*(1-this.weather*.9)*.8;
  materialBank.window.emissiveIntensity=.01+this.night*1.10;
  materialBank.solid.roughness=.86-this.weather*.34;materialBank.solid.metalness=.04+this.weather*.045;
  this.flashRemaining=Math.max(0,this.flashRemaining-dt);this.bolt.visible=this.flashRemaining>0;
  if(this.flashRemaining>0){const pulse=reducedMotion?.12:Math.max(0,Math.sin(this.flashRemaining*38));this.ambient.intensity+=pulse*2.5;this.sun.intensity+=pulse*1.8;}
  this.smoke.children[0].rotation.z=Math.sin(t*2.5)*.12;
  this.rain.visible=this.weather>.40;this.rain.position.copy(position);
  if(this.rain.visible){const snow=theme.id==="ice"||theme.id==="aurora",ash=theme.id==="volcano",rainScale=snow||ash?.13:1;const count=quality==="balanced"?600:1200;(this.rain.material as THREE.LineBasicMaterial).color.set(snow?"#e5efeb":ash?"#9aaba7":"#b3d0d0");this.rain.geometry.setDrawRange(0,count*2);for(let i=0;i<count;i++){const x=this.rainSeed[i*3],y=((this.rainSeed[i*3+1]-t*35*rainScale)%80+80)%80-22,z=this.rainSeed[i*3+2];const j=i*6;this.rainArray[j]=x;this.rainArray[j+1]=y;this.rainArray[j+2]=z;this.rainArray[j+3]=x+.4;this.rainArray[j+4]=y+(snow||ash?.7:2.3);this.rainArray[j+5]=z+.5;}(this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;}
  this.aurora.visible=theme.id==="aurora"&&this.night>.1;this.aurora.position.set(position.x,380,position.z+1150);const am=this.aurora.material as THREE.ShaderMaterial;am.uniforms.uTime.value=t;am.uniforms.uOpacity.value=this.night;
  return this.fog;
 }
}
