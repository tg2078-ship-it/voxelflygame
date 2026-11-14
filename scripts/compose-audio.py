"""Original AIRRUN music and sound layers; deterministic offline synthesis.
All musical events are authored here. No third-party samples or tracks.
"""
import numpy as np, scipy.signal as sg, scipy.io.wavfile as wav, pathlib, subprocess
OUT=pathlib.Path(__file__).resolve().parents[1]/'public'/'audio';OUT.mkdir(parents=True,exist_ok=True)
RATE=32000;BPM=104;BEAT=60/BPM;BARS=48;LENGTH=BEAT*4*BARS;N=int(LENGTH*RATE);RNG=np.random.default_rng(49173)
def freq(note):return 440*2**((note-69)/12)
def add(buf,time,note,length,gain=.1,kind='pluck',pan=0):
 count=min(int(length*RATE),len(buf)-int(time*RATE))
 if count<=0:return
 t=np.arange(count)/RATE;f=freq(note)
 if kind=='pad':sound=np.sin(2*np.pi*f*t)+.23*np.sin(2*np.pi*f*1.002*t)+.13*np.sin(2*np.pi*f*2*t);env=np.minimum(1,t/.25)*np.minimum(1,(length-t)/.3)
 elif kind=='bass':sound=np.sin(2*np.pi*f*t)+.25*np.sin(2*np.pi*f*2*t);env=(1-np.exp(-t*60))*np.exp(-t*2.5)
 elif kind=='bell':sound=np.sin(2*np.pi*f*t)*np.exp(-t*3)+.35*np.sin(2*np.pi*f*2.01*t)*np.exp(-t*7)+.16*np.sin(2*np.pi*f*3.99*t)*np.exp(-t*12);env=1-np.exp(-t*150)
 else:sound=np.sin(2*np.pi*f*t)+.4*np.sin(2*np.pi*f*2*t)+.12*np.sin(2*np.pi*f*3*t);env=(1-np.exp(-t*160))*np.exp(-t*5)
 sound=sound*env*gain;start=int(time*RATE);buf[start:start+count,0]+=sound*np.sqrt((1-pan)/2);buf[start:start+count,1]+=sound*np.sqrt((1+pan)/2)
def drum(buf,time,kind,gain):
 length=.42 if kind=='kick' else .16;count=min(int(length*RATE),len(buf)-int(time*RATE));t=np.arange(count)/RATE
 if kind=='kick':phase=2*np.pi*(42*t+55*(1-np.exp(-t*35))/35);s=np.sin(phase)*np.exp(-t*14)
 elif kind=='snare':n=RNG.normal(0,1,count);n=sg.lfilter([1,-1],[1],n);s=(n*.25+np.sin(2*np.pi*180*t)*.2)*np.exp(-t*26)
 else:n=RNG.normal(0,1,count);s=sg.lfilter([1,-1],[1],n)*np.exp(-t*65)*.17
 buf[int(time*RATE):int(time*RATE)+count]+=s[:,None]*gain
def finish(name,buf,rate=RATE):
 if buf.ndim==1:buf=np.stack([buf,buf],axis=1)
 peak=np.max(np.abs(buf));buf=np.tanh(buf/max(.95,peak/0.85))*.88;fade=min(int(rate*.25),len(buf)//5);buf[:fade]*=np.linspace(0,1,fade)[:,None];buf[-fade:]*=np.linspace(1,0,fade)[:,None]
 path=OUT/(name+'.wav');wav.write(path,rate,(buf*32767).astype(np.int16))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-codec:a','libmp3lame','-b:a','128k',str(OUT/(name+'.mp3'))],check=True);path.unlink()
explore=np.zeros((N,2),np.float32);danger=np.zeros((N,2),np.float32)
chords=[(53,56,60,63),(49,53,56,60),(56,60,63,65),(51,55,58,62),(53,56,60,65),(49,53,58,60),(48,51,55,58),(51,55,58,63)]
melody=[72,75,77,79,77,75,72,70,68,70,72,75,77,75,72,68]
for bar in range(BARS):
 chord=chords[(bar//2)%8];start=bar*4*BEAT
 for k,note in enumerate(chord):add(explore,start,note,BEAT*4.2,.052,'pad',(k-1.5)*.25)
 for step in range(8):
  note=chord[[0,2,1,3,2,1,3,2][step]]+12;add(explore,start+step*.5*BEAT,note,.9,.072,'pluck',(-1 if step%2 else 1)*.4)
 for step in range(4):add(explore,start+step*BEAT,chord[0]-12,.65,.15,'bass');drum(danger,start+step*BEAT,'kick',.34)
 for step in [1,3]:drum(danger,start+step*BEAT,'snare',.32)
 for step in range(8):drum(danger,start+step*BEAT*.5,'hat',.12 if step%2 else .17)
 if bar%4>=2:
  for j in range(4):add(explore,start+j*BEAT,melody[(bar*2+j)%len(melody)],BEAT*1.7,.055,'bell',.15)
 for step in range(8):add(danger,start+step*.5*BEAT,chord[step%4]+12,.5,.065,'pluck',(-1 if step%2 else 1)*.2)
for delay,attenuation in [(int(BEAT*.75*RATE),.20),(int(BEAT*1.5*RATE),.10)]:explore[delay:]+=explore[:-delay]*attenuation
finish('horizon',explore);finish('velocity',danger)
seconds=8;count=int(seconds*RATE);t=np.arange(count)/RATE;noise=RNG.normal(0,1,count)
rain=sg.sosfilt(sg.butter(3,[900,8500],btype='band',fs=RATE,output='sos'),noise)*.28
rain*=.8+.12*np.sin(t*2.7)+.08*np.sin(t*7.1);finish('rain',rain)
wind=sg.sosfilt(sg.butter(3,[110,1900],btype='band',fs=RATE,output='sos'),noise)*.4;wind*=.75+.25*np.sin(t*.9)**2;finish('wind',wind)
prop=(np.sin(2*np.pi*52*t)+.45*np.sin(2*np.pi*104*t)+.18*np.sin(2*np.pi*156*t))*.23+sg.sosfilt(sg.butter(2,1200,fs=RATE,output='sos'),noise)*.16;prop*=.84+.16*np.sin(2*np.pi*26*t);finish('propeller',prop)
jet=sg.sosfilt(sg.butter(3,[180,6800],btype='band',fs=RATE,output='sos'),noise)*.38+np.sin(2*np.pi*620*t)*.045+np.sin(2*np.pi*920*t)*.023;finish('jet',jet)
waves=sg.sosfilt(sg.butter(3,[250,2600],btype='band',fs=RATE,output='sos'),noise)*(.08+.19*np.sin(np.pi*t/4)**4);finish('waves',waves)
city=sg.sosfilt(sg.butter(3,[75,750],btype='band',fs=RATE,output='sos'),noise)*.12+.012*np.sin(2*np.pi*(170*t+4*np.sin(t*2)));finish('city',city)
forest=sg.sosfilt(sg.butter(3,[1800,7500],btype='band',fs=RATE,output='sos'),noise)*.035
for start in [.4,1.8,3.1,5.8,6.3]:
 n=int(.28*RATE);tt=np.arange(n)/RATE;chirp=sg.chirp(tt,2200,.28,4400)*np.sin(np.pi*tt/.28)**2*.1;forest[int(start*RATE):int(start*RATE)+n]+=chirp
finish('forest',forest)
print('Original audio layers:',', '.join(p.name for p in OUT.glob('*.mp3')))
