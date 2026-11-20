import * as T from 'three';
import { ATMOSPHERE } from './atmosphere';

const glslColor = (values: readonly number[]) => `vec3(${values.map(value => value.toFixed(4)).join(',')})`;

export function createSky() {
    const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0 }, uWarm: { value: 0 }, uDawn: { value: 0 }, uAurora: { value: 0 }, uFlash: { value: 0 }, uSky: { value: new T.Color('#389fc8') }, uSun: { value: new T.Vector3(-.5, .65, -.3).normalize() } };
    const material = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, uniforms,
        vertexShader: `varying vec3 vDirection;
            void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `
            varying vec3 vDirection;
            uniform float uTime,uNight,uCloud,uAurora,uFlash,uWarm,uDawn;
            uniform vec3 uSky,uSun;
            float hash(vec3 p){return fract(sin(dot(p,vec3(13.9898,78.233,45.164)))*43758.5453);}
            void main(){
                vec3 d=normalize(vDirection);float h=max(0.,d.y);
                vec3 golden=mix(${glslColor(ATMOSPHERE.sunset)},${glslColor(ATMOSPHERE.dawn)},uDawn);
                vec3 horizon=mix(${glslColor(ATMOSPHERE.horizon)},golden,uWarm*.84);
                horizon=mix(horizon,${glslColor(ATMOSPHERE.overcast)},uCloud*.48);
                vec3 zenith=mix(vec3(.028,.135,.315),uSky*.59,.38);
                zenith=mix(zenith,vec3(.135,.082,.255),uWarm*.58);
                zenith=mix(zenith,vec3(.105,.165,.255),uCloud*.56);
                vec3 day=mix(horizon,zenith,pow(h,.64));
                vec3 night=mix(${glslColor(ATMOSPHERE.night)},vec3(.005,.012,.035),pow(h,.62));
                vec3 col=mix(day,night,uNight);
                float sunDot=dot(d,normalize(uSun));
                float disk=smoothstep(.99943,.99976,sunDot);
                float aureole=pow(max(0.,sunDot),68.);
                float atmosphere=pow(max(0.,sunDot),12.)*pow(1.-h,2.);
                vec3 solar=mix(vec3(1.35,1.04,.61),vec3(1.55,.53,.18),uWarm);
                col+=solar*(disk*3.8+aureole*.34+atmosphere*.095)*(1.-uNight)*(1.-uCloud*.87);
                vec3 moonDirection=normalize(vec3(-uSun.x,.41,.24));
                float moonDot=dot(d,moonDirection);
                col+=vec3(.43,.63,1.)*(smoothstep(.99965,.99983,moonDot)*.65+pow(max(0.,moonDot),115.)*.045)*uNight*(1.-uCloud*.82);
                float starSeed=hash(floor(d*580.));
                float stars=step(.9984,starSeed)*pow(h,.4);
                col+=mix(vec3(.49,.72,1.),vec3(1.,.75,.48),hash(floor(d*580.)+11.))*stars*uNight*(1.-uCloud*.92)*(.68+.22*sin(uTime*.7+starSeed*413.));
                float curtain=sin(d.x*9.+d.z*4.+uTime*.09)*.12+.38;
                float aurora=exp(-pow((h-curtain)*15.,2.))*max(0.,sin(d.x*21.+sin(d.z*8.)+uTime*.12));
                col+=mix(vec3(.055,.61,.34),vec3(.36,.11,.67),sin(d.x*4.)*.5+.5)*aurora*uAurora*(.2+.8*uNight);
                col+=uFlash*.55;gl_FragColor=vec4(max(col,vec3(0.)),1.);
            }` });
    const mesh = new T.Mesh(new T.SphereGeometry(1600, 32, 16), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    return { mesh, uniforms, material };
}

/** Analytic waves, light path and foam share the floating-origin world distance.
 * No reflection render target, screen-space texture or per-frame geometry upload. */
export function createWater() {
    const uniforms = { uTime: { value: 0 }, uDistance: { value: 0 }, uOrigin: { value: 0 }, uNight: { value: 0 }, uRain: { value: 0 }, uFlash: { value: 0 }, uVolcano: { value: 0 }, uCamera: { value: new T.Vector3() }, uFog: { value: new T.Color().setRGB(...ATMOSPHERE.horizon) }, uFogDensity: { value: .0005 }, uSun: { value: new T.Vector3(-.5, .65, -.3).normalize() }, uWarm: { value: 0 }, uRange: { value: 1600 }, uCoastal: { value: 1 }, uShorePhase: { value: 0 } };
    const material = new T.ShaderMaterial({ uniforms,
        vertexShader: `
            uniform float uTime,uDistance,uOrigin;
            varying vec3 vWorld;
            void main(){
                vec4 world=modelMatrix*vec4(position,1.);
                vec2 p=vec2(world.x,uDistance-(world.z-uOrigin));
                world.y+=sin(p.x*.058+p.y*.034+uTime*1.12)*.13+sin(p.x*.094-p.y*.061-uTime*1.48)*.065;
                vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;
            }`,
        fragmentShader: `
            varying vec3 vWorld;
            uniform float uTime,uDistance,uOrigin,uNight,uRain,uFlash,uVolcano,uRange,uWarm,uCoastal,uShorePhase,uFogDensity;
            uniform vec3 uCamera,uFog,uSun;
            float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
            float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
            void main(){
                vec2 p=vec2(vWorld.x,uDistance-(vWorld.z-uOrigin));
                float broad=noise(p*.012+vec2(uTime*.018,-uTime*.023));
                float detail=noise(p*.071+vec2(uTime*.086,-uTime*.11));
                float shore=57.+sin(p.y*.005+uShorePhase)*13.+sin(p.y*.017+uShorePhase*2.)*5.;
                float nearShore=exp(-abs(p.x-shore)/23.)*uCoastal;
                vec3 deep=vec3(.006,.077,.168),clear=vec3(.014,.315,.355),shoal=vec3(.055,.56,.43);
                vec3 col=mix(deep,clear,.22+broad*.58);
                col=mix(col,shoal,nearShore*(.48+detail*.35));
                float w1=p.x*.058+p.y*.034+uTime*1.12;
                float w2=p.x*.094-p.y*.061-uTime*1.48;
                float w3=p.x*.31+p.y*.21+uTime*2.3;
                float dx=cos(w1)*.13*.058+cos(w2)*.065*.094+cos(w3)*(.012+uRain*.015)*.31;
                float dy=cos(w1)*.13*.034-cos(w2)*.065*.061+cos(w3)*(.012+uRain*.015)*.21;
                vec3 normal=normalize(vec3(-dx*5.5,1.,dy*5.5));
                vec3 eye=normalize(uCamera-vWorld),sun=normalize(uSun);
                float fres=pow(1.-max(0.,eye.y),4.);
                vec3 reflected=mix(vec3(.12,.32,.51),uFog,.52);
                col=mix(col,reflected,fres*.37);
                float reflection=max(0.,dot(reflect(-sun,normal),eye));
                float sparkle=pow(reflection,164.)*(.58+detail*.42);
                float lightPath=pow(reflection,19.)*.10;
                vec3 sunColor=mix(vec3(1.12,.93,.61),vec3(1.48,.42,.12),uWarm);
                col+=sunColor*(sparkle*.95+lightPath)*(1.-uNight)*(1.-uRain*.82);
                float coastWave=sin(p.y*.13-uTime*1.65)*1.55;
                float shoreFoam=exp(-abs(p.x-shore+coastWave)/2.8)*uCoastal;
                // Sweep broken combers towards the beach in world coordinates.
                float reach=shore-p.x;
                float surfZone=smoothstep(1.,5.,reach)*(1.-smoothstep(8.,24.,reach))*uCoastal;
                float crest=sin(reach*.85+uTime*1.48+broad*4.+sin(p.y*.09)*.82);
                float comb=smoothstep(.76,.98,crest)*smoothstep(.27,.69,detail)*surfZone;
                col=mix(col,vec3(.54,.81,.74),comb*.62);
                float openFoam=smoothstep(.78,.96,detail)*smoothstep(.51,.89,broad)*.10;
                col+=vec3(.36,.66,.63)*(shoreFoam*(.28+detail*.27)+openFoam);
                if(uRain>.001){
                    vec2 cell=floor(p*.24),drop=vec2(hash(cell),hash(cell+19.));
                    float age=fract(uTime*.82+hash(cell+7.));
                    float ring=exp(-pow((length(fract(p*.24)-drop)-age*.69)*25.,2.))*(1.-age);
                    col+=vec3(.13,.23,.25)*ring*uRain*.20;
                }
                // Preserve moonlit surface variation instead of crushing the
                // whole flight corridor to near-black when the sun sets.
                col=mix(col,col*.28+vec3(.004,.014,.032),uNight*.93);
                col+=vec3(.16,.30,.48)*pow(max(0.,dot(reflect(-normalize(vec3(-sun.x,.41,.24)),normal),eye)),58.)*uNight*.23;
                col+=uFlash*.22;
                if(uVolcano>.001){
                    float lava=uVolcano*(1.-smoothstep(40.,59.,abs(p.x)));
                    float crust=smoothstep(.38,.68,noise(p*.12+vec2(uTime*.05,-uTime*.09)));
                    vec3 molten=mix(vec3(2.15,.34,.008),vec3(.052,.019,.014),crust);
                    col=mix(col,molten,lava);
                }
                float fogDistance=length(uCamera-vWorld);
                float aerialFog=1.-exp(-uFogDensity*uFogDensity*fogDistance*fogDistance);
                float fog=max(aerialFog,smoothstep(uRange*.80,uRange,fogDistance));
                gl_FragColor=vec4(mix(col,uFog,fog),1.);
            }` });
    const mesh = new T.Mesh(new T.PlaneGeometry(2200, 2600, 100, 100), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = .1;
    mesh.receiveShadow = true;
    return { mesh, uniforms, material };
}

export const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uBoost: { value: 0 }, uDamage: { value: 0 }, uE: { value: 0 }, uReduced: { value: 0 }, uRain: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
        varying vec2 vUv;uniform sampler2D tDiffuse;
        uniform float uTime,uSpeed,uDamage,uE,uReduced,uRain,uBoost;
        void main(){
            vec2 p=vUv-.5;float r=length(p),motion=1.-uReduced;
            float drive=max(uE,uBoost*.72);
            float aberr=drive*.00032*motion;
            vec3 c;c.r=texture2D(tDiffuse,vUv+p*aberr).r;c.g=texture2D(tDiffuse,vUv).g;c.b=texture2D(tDiffuse,vUv-p*aberr).b;
            float vignette=1.-smoothstep(.19,.71,r);
            float luminance=dot(c,vec3(.2126,.7152,.0722));
            c=mix(vec3(luminance),c,1.045);
            c*=mix(.91,1.,vignette);
            c=mix(c,vec3(.75,.065,.03),uDamage*(1.-vignette)*.28*(1.-uReduced*.85));
            c+=vec3(.012,.075,.145)*drive*(1.-vignette);
            float streak=pow(max(0.,sin(atan(p.y,p.x)*56.+uTime*9.)),42.)*smoothstep(.33,.68,r)*uBoost*motion;
            c+=vec3(.023,.10,.21)*streak;
            gl_FragColor=vec4(max(c,vec3(0.)),1.);
        }`,
};
