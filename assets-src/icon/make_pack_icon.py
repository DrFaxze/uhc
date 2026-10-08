from PIL import Image
import math, random
random.seed(7)
N=64
img=Image.new('RGBA',(N,N))
px=img.load()
cx=cy=31.5
def mix(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
for y in range(N):
  for x in range(N):
    d=math.hypot(x-cx,y-cy)/45
    px[x,y]=mix((48,10,72),(6,2,12),min(1,d))+(255,)
# estrellas
for _ in range(40):
  x,y=random.randrange(N),random.randrange(N)
  if math.hypot(x-cx,y-cy)>24: px[x,y]=(230,200,255,255) if random.random()<0.5 else (160,110,220,255)
# luna carmesí (anillo)
for y in range(N):
  for x in range(N):
    d=math.hypot(x-cx,y-cy)
    if 20.5<=d<=23.5:
      t=(d-20.5)/3
      px[x,y]=mix((255,70,60),(130,8,20),t)+(255,)
    elif 23.5<d<=25.5:
      px[x,y]=mix(px[x,y][:3],(120,0,20),0.5)+(255,)
# ojo: forma de almendra
for y in range(N):
  for x in range(N):
    u=(x-cx)/19; v=(y-cy)/9
    w=1-u*u
    if w>0 and abs(v)<w:
      e=abs(v)/w
      col=mix((255,120,255),(150,30,200),e)
      r=math.hypot((x-cx)/11,(y-cy)/9)
      if r<1: col=mix((255,230,120),(230,80,255),r)  # iris
      if abs(x-cx)<1.6*(1-abs(y-cy)/9.5) and abs(y-cy)<9: col=(15,0,20)  # pupila
      if abs(v)>w-0.18: col=(60,0,80)  # borde
      px[x,y]=col+(255,)
# pupila (encima de todo)
for y in range(23,41):
  hw=2 if abs(y-cy)<5 else 1
  for x in range(32-hw,32+hw):
    px[x,y]=(15,0,20,255)
# brillo
for (x,y) in [(26,28),(27,28),(26,29)]: px[x,y]=(255,255,255,255)
# marco
for i in range(N):
  for (x,y) in [(i,0),(i,N-1),(0,i),(N-1,i)]: px[x,y]=(20,0,30,255)
img.resize((256,256),Image.NEAREST).save('pack_icon.png')
