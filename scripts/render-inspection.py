"""Mesa geometry inspection, not a screenshot or WebGL / performance certification."""
from pathlib import Path
import json, numpy as np, moderngl
from PIL import Image
root=Path('.sites-runtime/qa/geometry')
ctx=moderngl.create_standalone_context(backend='egl')
VERT='''#version 330
in vec3 in_pos; in vec3 in_normal;
in vec4 m0; in vec4 m1; in vec4 m2; in vec4 m3; in vec3 in_color; in vec3 in_emission; in float in_rough; in float in_alpha; in float in_cast;
uniform mat4 vp; uniform mat4 lightvp;
out vec3 p; out vec3 n; out vec3 color; out vec3 emission; out float rough; out float alpha; out vec4 shadowcoord;
void main(){mat4 model=mat4(m0,m1,m2,m3);p=(model*vec4(in_pos,1)).xyz;n=normalize(transpose(inverse(mat3(model)))*in_normal);color=in_color;emission=in_emission;rough=in_rough;alpha=in_alpha;shadowcoord=lightvp*vec4(p,1);gl_Position=vp*vec4(p,1);}
'''
TRIVERT='''#version 330
in vec3 in_pos; in vec3 in_normal; in vec3 in_color; in vec3 in_emission; in float in_rough; in float in_alpha; in float in_cast;
uniform mat4 vp; uniform mat4 lightvp;
out vec3 p; out vec3 n; out vec3 color; out vec3 emission; out float rough; out float alpha; out vec4 shadowcoord;
void main(){p=in_pos;n=in_normal;color=in_color;emission=in_emission;rough=in_rough;alpha=in_alpha;shadowcoord=lightvp*vec4(p,1);gl_Position=vp*vec4(p,1);}
'''
FRAG='''#version 330
in vec3 p;in vec3 n;in vec3 color;in vec3 emission;in float rough;in float alpha;in vec4 shadowcoord;
uniform vec3 camera;uniform vec3 sundir;uniform vec3 suncolor;uniform vec3 ambient;uniform vec3 groundlight;uniform vec3 fog;uniform float sunintensity;uniform float ambientintensity;uniform float night;uniform sampler2DShadow shadowmap;
out vec4 out_color;
void main(){vec3 normal=normalize(n);vec3 v=normalize(camera-p);float ndl=max(dot(normal,sundir),0);vec3 sp=shadowcoord.xyz/shadowcoord.w*.5+.5;float shadow=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)shadow+=texture(shadowmap,vec3(sp.xy+vec2(x,y)/2048.,sp.z-.0012));shadow/=9.;if(any(lessThan(sp.xy,vec2(0)))||any(greaterThan(sp.xy,vec2(1))))shadow=1.;vec3 hemi=mix(groundlight,ambient,normal.y*.5+.5)*ambientintensity*.5;vec3 c=color*(hemi+suncolor*sunintensity*ndl*shadow*.45);float spec=pow(max(dot(normal,normalize(sundir+v)),0),mix(120.,6.,rough));c+=suncolor*spec*.12*sunintensity*shadow;c+=emission;float f=smoothstep(190.,1450.,distance(camera,p));c=mix(c,fog,f);out_color=vec4(c,alpha);}
'''
DEPTH='''#version 330
in vec3 in_pos;in vec4 m0;in vec4 m1;in vec4 m2;in vec4 m3;in float in_cast;uniform mat4 lightvp;
void main(){gl_Position=in_cast>.5?lightvp*mat4(m0,m1,m2,m3)*vec4(in_pos,1):vec4(1000,1000,1000,1);}
'''
TRIDEPTH='''#version 330
in vec3 in_pos;in float in_cast;uniform mat4 lightvp;void main(){gl_Position=in_cast>.5?lightvp*vec4(in_pos,1):vec4(1000,1000,1000,1);}
'''
EMPTY='''#version 330
void main(){}'''
FULL='''#version 330
in vec2 in_pos;out vec2 uv;void main(){uv=in_pos*.5+.5;gl_Position=vec4(in_pos,0,1);}'''
SKY='''#version 330
in vec2 uv;uniform mat4 invvp;uniform vec3 camera;uniform vec3 sundir;uniform vec3 sky;uniform float night;uniform float cloud;out vec4 out_color;
void main(){vec4 w=invvp*vec4(uv*2-1,1,1);vec3 d=normalize(w.xyz/w.w-camera);float h=max(d.y,0);vec3 day=mix(vec3(.82,.84,.74),sky,pow(h,.38));vec3 noct=mix(vec3(.055,.115,.16),vec3(.014,.04,.085),pow(h,.5));float sd=max(dot(d,sundir),0);day=mix(day,vec3(1,.69,.38),pow(sd,24)*.4);vec3 c=mix(day,noct,night);c+=vec3(1,.84,.55)*(smoothstep(.9993,.99975,sd)*2.2+pow(sd,520)*.55)*(1-night)*(1-cloud*.55);c=mix(c,mix(vec3(.62,.70,.69),vec3(.055,.10,.14),night),cloud*.3);out_color=vec4(c,1);}'''
WATER='''#version 330
in vec3 p;in vec3 n;in vec3 color;in vec3 emission;in float rough;in float alpha;in vec4 shadowcoord;uniform vec3 camera;uniform vec3 sundir;uniform vec3 fog;uniform float night;out vec4 out_color;
void main(){vec2 q=p.xz;float w1=sin(q.x*.12+q.y*.07+1.3),w2=sin(q.x*.24-q.y*.09-.9);vec3 nn=normalize(vec3(w1*.045,1,w2*.04)),v=normalize(camera-p);float fres=pow(1-max(dot(nn,v),0),3);vec3 deep=mix(vec3(.035,.30,.34),vec3(.018,.07,.12),night),reflected=mix(vec3(.50,.72,.73),vec3(.045,.12,.17),night);vec3 c=mix(deep,reflected,fres*.83);float spec=pow(max(dot(nn,normalize(v+sundir)),0),210);float flakes=smoothstep(.94,.997,sin(q.x*1.03+w1)*sin(q.y*.82+w2));c+=vec3(.94,.79,.47)*(spec*.95+flakes*.075)*(1-night);c=mix(c,fog,clamp(1-exp(-distance(camera,p)*.0016),0,.97));out_color=vec4(c,1);}'''
OUTPUT='''#version 330
in vec2 uv;uniform sampler2D screen;out vec4 out_color;void main(){vec3 x=texture(screen,uv).rgb*1.04;vec3 c=clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0,1);c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));out_color=vec4(c,1);}'''
program=ctx.program(vertex_shader=VERT,fragment_shader=FRAG);tri=ctx.program(vertex_shader=TRIVERT,fragment_shader=FRAG)
depth=ctx.program(vertex_shader=DEPTH,fragment_shader=EMPTY);tridepth=ctx.program(vertex_shader=TRIDEPTH,fragment_shader=EMPTY)
skyprog=ctx.program(vertex_shader=FULL,fragment_shader=SKY);waterprog=ctx.program(vertex_shader=TRIVERT,fragment_shader=WATER);outprog=ctx.program(vertex_shader=FULL,fragment_shader=OUTPUT)
quad=ctx.buffer(np.array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1],dtype='f4').tobytes());skyvao=ctx.vertex_array(skyprog,[(quad,'2f','in_pos')]);outvao=ctx.vertex_array(outprog,[(quad,'2f','in_pos')]);
# Unit cube vertices with per-face normals.
v=[]
for axis in range(3):
 for sign in [-1,1]:
  a=(axis+1)%3;b=(axis+2)%3
  corners=[]
  for x,y in [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]:
   p=[0,0,0];p[axis]=sign*.5;p[a]=x;p[b]=y;corners.append(p)
  norm=[0,0,0];norm[axis]=sign
  for i in [0,1,2,0,2,3]:v.extend(corners[i]+norm)
boxvb=ctx.buffer(np.array(v,dtype='f4').tobytes())
def matwrite(p,name,m):
 if name in p:p[name].write(np.asarray(m,dtype='f4').T.tobytes())
def uniform(p,name,value):
 if name in p:p[name].value=tuple(value) if isinstance(value,list) else value
def lookat(eye,target):
 f=(target-eye);f/=np.linalg.norm(f);side=np.cross(f,[0,1,0]);side/=np.linalg.norm(side);up=np.cross(side,f);m=np.eye(4);m[:3,:3]=[side,up,-f];m[:3,3]=[-side@eye,-up@eye,f@eye];return m
def ortho():
 m=np.eye(4);m[0,0]=m[1,1]=1/110;m[2,2]=-2/500;m[2,3]=-1;return m
for path in root.glob('*.json'):
 meta=json.loads(path.read_text());name=meta['name'];w,h=meta['width'],meta['height'];view=np.array(meta['view']).reshape(4,4,order='F');projection=np.array(meta['projection']).reshape(4,4,order='F');vp=projection@view;cam=np.array(meta['camera']);sundir=np.array(meta['sunDir']);target=cam+np.array([0,-6,40]);lightvp=ortho()@lookat(target+sundir*240,target)
 data=np.fromfile(root/(name+'-boxes.bin'),dtype='f4');ib=ctx.buffer(data.tobytes())
 main=ctx.vertex_array(program,[(boxvb,'3f 3f','in_pos','in_normal'),(ib,'4f 4f 4f 4f 3f 3f 1f 1f 4x /i','m0','m1','m2','m3','in_color','in_emission','in_rough','in_alpha')]);dvao=ctx.vertex_array(depth,[(boxvb,'3f 12x','in_pos'),(ib,'4f 4f 4f 4f 32x 1f /i','m0','m1','m2','m3','in_cast')])
 tv=np.fromfile(root/(name+'-triangles.bin'),dtype='f4');tb=ctx.buffer(tv.tobytes());tvao=ctx.vertex_array(tri,[(tb,'3f 3f 3f 3f 1f 1f 4x','in_pos','in_normal','in_color','in_emission','in_rough','in_alpha')]);tdvao=ctx.vertex_array(tridepth,[(tb,'3f 44x 1f','in_pos','in_cast')])
 av=np.fromfile(root/(name+'-alpha.bin'),dtype='f4');ab=ctx.buffer(av.tobytes()) if len(av) else None;avao=ctx.vertex_array(tri,[(ab,'3f 3f 3f 3f 1f 1f 4x','in_pos','in_normal','in_color','in_emission','in_rough','in_alpha')]) if ab else None
 shadow=ctx.depth_texture((2048,2048));shadow.compare_func='<=';shadow.filter=(moderngl.LINEAR,moderngl.LINEAR);shadow.repeat_x=shadow.repeat_y=False;sfbo=ctx.framebuffer(depth_attachment=shadow);sfbo.use();ctx.viewport=(0,0,2048,2048);sfbo.clear(depth=1);ctx.enable(moderngl.DEPTH_TEST);matwrite(depth,'lightvp',lightvp);matwrite(tridepth,'lightvp',lightvp);dvao.render(instances=len(data)//25);tdvao.render()
 hdr=ctx.texture((w,h),4,dtype='f2');db=ctx.depth_renderbuffer((w,h));fbo=ctx.framebuffer([hdr],db);fbo.use();ctx.viewport=(0,0,w,h);fbo.clear();ctx.disable(moderngl.DEPTH_TEST);matwrite(skyprog,'invvp',np.linalg.inv(vp));
 for k,vv in [('camera',meta['camera']),('sundir',meta['sunDir']),('sky',meta['sky']),('night',meta['night']),('cloud',meta['weather'])]:uniform(skyprog,k,vv)
 skyvao.render();ctx.enable(moderngl.DEPTH_TEST);shadow.use(1)
 for p in [program,tri,waterprog]:
  matwrite(p,'vp',vp);matwrite(p,'lightvp',lightvp)
  for k,vv in [('camera',meta['camera']),('sundir',meta['sunDir']),('suncolor',meta['sun']),('ambient',meta['ambient']),('groundlight',meta['groundLight']),('fog',meta['fog']),('sunintensity',meta['sunIntensity']),('ambientintensity',meta['ambientIntensity']),('night',meta['night']),('shadowmap',1)]:uniform(p,k,vv)
 # Actual water plane extent / height, custom shader.
 water=[]
 for x,z in [(-1750,-1600),(1750,-1600),(1750,3400),(-1750,-1600),(1750,3400),(-1750,3400)]:water.extend([x,-.10,z+cam[2],0,1,0,0,0,0,0,0,0,.4,1,0])
 wb=ctx.buffer(np.array(water,dtype='f4').tobytes());wvao=ctx.vertex_array(waterprog,[(wb,'3f 48x','in_pos')]);
 if meta['water']:wvao.render()
 main.render(instances=len(data)//25);tvao.render()
 if avao:ctx.enable(moderngl.BLEND);ctx.blend_func=(moderngl.SRC_ALPHA,moderngl.ONE_MINUS_SRC_ALPHA);avao.render();ctx.disable(moderngl.BLEND)
 result=ctx.simple_framebuffer((w,h),components=4);result.use();ctx.disable(moderngl.DEPTH_TEST);hdr.use(0);outprog['screen'].value=0;outvao.render();Image.frombytes('RGBA',(w,h),result.read(components=4)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB').save(root/(name+'.png'));print(name,meta['instances'],'instances rendered',flush=True)
 for obj in [main,dvao,tvao,tdvao,tb,ib,sfbo,shadow,fbo,hdr,db,result,wvao,wb]:obj.release()
 if avao:avao.release();ab.release()
