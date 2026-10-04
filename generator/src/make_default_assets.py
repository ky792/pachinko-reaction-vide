"""既定の素材（キャラ・背景・BGM・SE）を assets/ に書き出す。

既存動画 pachisure_ep2_v7.mp4 と同じデザイン・曲を、差し替え可能なファイルとして出力します。
自前の素材に替えたい場合は、同じファイル名で assets/ 内のファイルを置き換えてください。
既にファイルがある場合は上書きしません（--force で上書き）。

    python src/make_default_assets.py
"""
import sys, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.io import wavfile
from scipy.signal import butter, lfilter

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
FORCE = "--force" in sys.argv
W, H = 1920, 1080

def _need(p):
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and not FORCE:
        print(f"  skip (exists): {p.relative_to(ROOT)}"); return False
    print(f"  write: {p.relative_to(ROOT)}"); return True

def make_bg():
    rng=np.random.default_rng(7)
    im=Image.new("RGB",(W,H),(12,8,24)); d=ImageDraw.Draw(im)
    for row,yb in enumerate([260,700]):
        for k in range(9):
            x=40+k*215; y=yb
            d.rounded_rectangle([x,y,x+180,y+360],20,fill=(30,24,50))
            col=[(255,60,120),(60,200,255),(255,200,40),(140,90,255)][(k+row)%4]
            d.rounded_rectangle([x+25,y+40,x+155,y+150],14,fill=col)
            for _ in range(6):
                cx,cy=x+rng.integers(20,160),y+rng.integers(170,340)
                d.ellipse([cx-9,cy-9,cx+9,cy+9],fill=(200,200,220))
    im=im.filter(ImageFilter.GaussianBlur(18))
    return Image.blend(im,Image.new("RGB",(W,H),(8,6,18)),0.58)

# ---- characters: うさ (rabbit) & ねこ (cat), full body, original ----
INK=(35,30,40)
def face_parts(d,c,cy,r,face):
    ex=r*0.36; ey=cy+r*0.02; er=r*0.16; lw=max(3,int(r*0.07))
    if face=="cry":
        for s_ in (-1,1):
            d.arc([c+s_*ex-er,ey-er*0.6,c+s_*ex+er,ey+er*0.9],200,340,fill=INK,width=lw)
            d.ellipse([c+s_*ex-er*0.45,ey+er*0.7,c+s_*ex+er*0.45,ey+er*2.7],fill=(90,170,255))
        d.arc([c-r*0.2,cy+r*0.42,c+r*0.2,cy+r*0.7],200,340,fill=INK,width=lw)
    elif face=="shock":
        for s_ in (-1,1):
            d.ellipse([c+s_*ex-er,ey-er,c+s_*ex+er,ey+er],fill=(255,255,255),outline=INK,width=max(2,int(r*0.05)))
            d.ellipse([c+s_*ex-er*0.38,ey-er*0.38,c+s_*ex+er*0.38,ey+er*0.38],fill=INK)
        d.ellipse([c-r*0.13,cy+r*0.36,c+r*0.13,cy+r*0.7],fill=(120,30,45))
    elif face=="smug":
        for s_ in (-1,1):
            d.arc([c+s_*ex-er,ey-er*0.3,c+s_*ex+er,ey+er*1.3],200,340,fill=INK,width=lw)
        d.arc([c-r*0.25,cy+r*0.2,c+r*0.3,cy+r*0.6],20,160,fill=INK,width=lw)
    elif face=="angry":
        for s_ in (-1,1):
            d.line([c+s_*(ex+er),ey-er*1.5,c+s_*(ex-er*0.8),ey-er*0.6],fill=INK,width=lw)
            d.ellipse([c+s_*ex-er*0.5,ey-er*0.4,c+s_*ex+er*0.5,ey+er*0.7],fill=INK)
        d.ellipse([c-r*0.2,cy+r*0.33,c+r*0.2,cy+r*0.68],fill=(120,30,45))
        ax,ay=c+r*0.68,cy-r*0.68; k=r*0.24  # anger mark
        for a_,b_ in (((-1,-1),(-0.3,-0.3)),((1,-1),(0.3,-0.3)),((-1,1),(-0.3,0.3)),((1,1),(0.3,0.3))):
            d.line([ax+a_[0]*k,ay+a_[1]*k*0.2,ax+b_[0]*k,ay+b_[1]*k],fill=(230,40,50),width=lw)
    elif face=="jito":
        for s_ in (-1,1):
            d.line([c+s_*ex-er,ey,c+s_*ex+er,ey],fill=INK,width=lw)
            d.chord([c+s_*ex-er*0.6,ey-er*0.1,c+s_*ex+er*0.6,ey+er*0.9],0,180,fill=INK)
        d.line([c-r*0.18,cy+r*0.45,c+r*0.18,cy+r*0.45],fill=INK,width=lw)
    else:
        for s_ in (-1,1):
            d.ellipse([c+s_*ex-er*0.55,ey-er*0.75,c+s_*ex+er*0.55,ey+er*0.75],fill=INK)
            d.ellipse([c+s_*ex-er*0.25,ey-er*0.55,c+s_*ex+er*0.05,ey-er*0.15],fill=(255,255,255))
        d.arc([c-r*0.22,cy+r*0.25,c+r*0.22,cy+r*0.55],20,160,fill=INK,width=lw)
    if face!="jito":
        d.ellipse([c-r*0.78,cy+r*0.18,c-r*0.5,cy+r*0.38],fill=(255,190,205))
        d.ellipse([c+r*0.5,cy+r*0.18,c+r*0.78,cy+r*0.38],fill=(255,190,205))

def draw_char(kind,face,hpx,flip=False):
    SS=2; Hh=hpx*SS; u=Hh/100; Wc=int(84*u)
    im=Image.new("RGBA",(Wc,int(Hh)),(0,0,0,0)); d=ImageDraw.Draw(im)
    ol=max(2,int(1.1*u)); c=42*u
    if kind=="usa":
        body=(250,250,252); cloth=(90,150,245); clothd=(60,110,200); inner=(255,170,190); hy=47*u; hr=21*u
    else:
        body=(255,175,80); cloth=(255,175,80); clothd=(215,125,45); inner=(255,190,200); hy=50*u; hr=22*u
    # tail (cat)
    if kind=="neko":
        d.arc([c+6*u,66*u,c+34*u,96*u],200,40,fill=INK,width=int(7.5*u))
        d.arc([c+6*u,66*u,c+34*u,96*u],202,38,fill=body,width=int(5.5*u))
    # legs/feet
    for s_ in (-1,1):
        fx=c+s_*8*u
        d.rounded_rectangle([fx-5*u,84*u,fx+5*u,95*u],int(3*u),fill=body,outline=INK,width=ol)
        d.ellipse([fx-7.5*u,91*u,fx+7.5*u,99*u],fill=body,outline=INK,width=ol)
    # body
    d.rounded_rectangle([c-15*u,66*u,c+15*u,90*u],int(11*u),fill=cloth,outline=INK,width=ol)
    if kind=="usa":
        d.rounded_rectangle([c-6*u,74*u,c+6*u,82*u],int(2*u),fill=clothd)  # pocket
        d.line([c,66*u,c,74*u],fill=clothd,width=int(1.2*u))
    else:
        d.ellipse([c-9*u,70*u,c+9*u,89*u],fill=(255,240,225))
    # arms by pose
    def arm(s_,up):
        sx=c+s_*13*u; sy=70*u
        ex_=c+s_*(24*u if up else 18*u); ey_=(56*u if up else 84*u)
        d.line([sx,sy,ex_,ey_],fill=INK,width=int(7.5*u)); d.line([sx,sy,ex_,ey_],fill=cloth if kind=="usa" else body,width=int(5.5*u))
        d.ellipse([ex_-4*u,ey_-4*u,ex_+4*u,ey_+4*u],fill=body,outline=INK,width=ol)
    pose={"shock":(1,1),"angry":(0,1),"smug":(0,0)}.get(face,(0,0))
    if face=="angry":  # tsukkomi: one arm out sideways
        arm(-1,False); sx=c+13*u; sy=70*u; ex_=c+30*u; ey_=66*u
        d.line([sx,sy,ex_,ey_],fill=INK,width=int(7.5*u)); d.line([sx,sy,ex_,ey_],fill=cloth if kind=="usa" else body,width=int(5.5*u))
        d.ellipse([ex_-4.5*u,ey_-4.5*u,ex_+4.5*u,ey_+4.5*u],fill=body,outline=INK,width=ol)
    else:
        arm(-1,pose[0]); arm(1,pose[1])
    # head
    if kind=="usa":
        for s_ in (-1,1):
            ex=c+s_*9*u
            d.ellipse([ex-5.5*u,2*u,ex+5.5*u,hy-8*u],fill=body,outline=INK,width=ol)
            d.ellipse([ex-2.7*u,6*u,ex+2.7*u,hy-12*u],fill=inner)
        d.ellipse([c-hr,hy-hr,c+hr,hy+hr*0.92],fill=body,outline=INK,width=ol)
        d.ellipse([c-1.7*u,hy+2.5*u,c+1.7*u,hy+5*u],fill=(255,120,150))
    else:
        for s_ in (-1,1):
            ex=c+s_*14*u
            d.polygon([(ex-s_*8*u,hy-14*u),(ex+s_*6*u,hy-30*u),(ex+s_*9*u,hy-7*u)],fill=body,outline=INK)
            d.polygon([(ex-s_*4*u,hy-14*u),(ex+s_*4.5*u,hy-25*u),(ex+s_*6*u,hy-11*u)],fill=inner)
        d.ellipse([c-hr*1.07,hy-hr*0.95,c+hr*1.07,hy+hr*0.9],fill=body,outline=INK,width=ol)
        for k_ in (-1,0,1):
            d.line([c+k_*hr*0.22,hy-hr*0.92,c+k_*hr*0.18,hy-hr*0.62],fill=clothd,width=int(1.6*u))
        d.polygon([(c-1.8*u,hy+2.6*u),(c+1.8*u,hy+2.6*u),(c,hy+4.8*u)],fill=(255,110,140))
        for s_ in (-1,1):
            for k_ in (-1,1):
                d.line([c+s_*hr*0.55,hy+hr*0.25+k_*hr*0.07,c+s_*hr*1.2,hy+hr*0.18+k_*hr*0.16],fill=INK,width=max(2,int(0.6*u)))
    face_parts(d,c,hy,hr,face)
    im=im.resize((Wc//SS,hpx),Image.LANCZOS)
    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im

def make_music():
    global N
    sr=44100; bpm=96; beat=60/bpm; bar=beat*4
    def note(m): return 440*2**((m-69)/12)
    def ep(fq,tt,dec=1.8):
        env=np.exp(-tt*dec)*(1-np.exp(-tt*90)); return env*(np.sin(2*np.pi*fq*tt)+0.3*np.sin(2*np.pi*2*fq*tt)+0.1*np.sin(2*np.pi*3*fq*tt))
    chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,53,59]]
    L=int(bar*4*sr); mix=np.zeros(L); rng=np.random.default_rng(2); tb=np.arange(int(beat*sr))/sr
    for b_,chd in enumerate(chords):
        for k_ in range(4):
            s=int((b_*4+k_)*beat*sr); e=min(len(tb),L-s)
            for m in chd[1:]: mix[s:s+e]+=0.05*ep(note(m+12),tb[:e],4)
            bt=np.arange(int(beat*0.8*sr))/sr; e2=min(len(bt),L-s)
            mix[s:s+e2]+=0.2*np.exp(-bt[:e2]*4)*np.sin(2*np.pi*note(chd[0]-12+(7 if k_%2 else 0))*bt[:e2])
    mel=[(0,72),(0.5,74),(1,76),(2,79),(3,76),(4,74),(4.5,72),(5,69),(6,72),(8,72),(8.5,74),(9,76),(10,81),(11,79),(12,76),(13,74),(14,72),(14.5,74),(15,72)]
    for bt_,m in mel:
        s=int(bt_*beat*sr); tt_=np.arange(int(beat*0.9*sr))/sr; e=min(len(tt_),L-s)
        mix[s:s+e]+=0.04*np.sign(np.sin(2*np.pi*note(m)*tt_[:e]))*np.exp(-tt_[:e]*5)
    for k_ in range(16):
        s=int(k_*beat*sr)
        if k_%2==0: tk=np.arange(int(0.22*sr))/sr; mix[s:s+len(tk)]+=0.35*np.exp(-tk*20)*np.sin(2*np.pi*(55+70*np.exp(-tk*35))*tk)
        else: tn=np.arange(int(0.15*sr))/sr; mix[s:s+len(tn)]+=0.1*np.exp(-tn*25)*rng.standard_normal(len(tn))
        for h in [0,0.5]:
            hs=s+int(h*beat*sr); th=np.arange(int(0.04*sr))/sr; mix[hs:hs+len(th)]+=0.03*np.exp(-th*90)*rng.standard_normal(len(th))
    bb,aa=butter(2,5000/(sr/2)); mix=lfilter(bb,aa,mix)

    bgm_main = mix / np.max(np.abs(mix)) * 0.9
    m1 = 0
    # outro BGM: bouncy, catchy ending theme (original)
    obpm=118; ob=60/obpm; rngo=np.random.default_rng(5)
    prog=[[55,59,62],[50,54,57],[52,55,59],[48,52,55]]  # G D Em C
    OL=int(ob*4*4*sr); om=np.zeros(OL)
    def pl(fq,tt,dec=6):   # pluck (ukulele-ish)
        env=np.exp(-tt*dec)*(1-np.exp(-tt*300))
        return env*(np.sin(2*np.pi*fq*tt)+0.5*np.sin(2*np.pi*2*fq*tt)*np.exp(-tt*8)+0.25*np.sin(2*np.pi*3*fq*tt)*np.exp(-tt*12))
    def bell(fq,tt):       # glockenspiel
        env=np.exp(-tt*4.5)*(1-np.exp(-tt*400))
        return env*(np.sin(2*np.pi*fq*tt)+0.35*np.sin(2*np.pi*2.76*fq*tt)*np.exp(-tt*9)+0.15*np.sin(2*np.pi*5.4*fq*tt)*np.exp(-tt*15))
    strum=[0,0.75,1.5,2,2.75,3.5]
    for bi,chd in enumerate(prog):
        s0=int(bi*4*ob*sr)
        for k_,bt_ in enumerate(strum):
            for j,m in enumerate(chd):
                st_=s0+int((bt_*ob+j*0.012)*sr); tt_=np.arange(int(0.6*sr))/sr; e=min(len(tt_),OL-st_)
                om[st_:st_+e]+=0.05*pl(note(m+12),tt_[:e],7)
        for k_ in range(4):  # bouncy bass: root - fifth
            st_=s0+int(k_*ob*sr); tt_=np.arange(int(0.45*ob*sr))/sr; e=min(len(tt_),OL-st_)
            om[st_:st_+e]+=0.2*np.exp(-tt_[:e]*5)*np.sin(2*np.pi*note(chd[0]-12+(7 if k_%2 else 0))*tt_[:e])
    # hook melody (G major), repeats each 4 bars
    hook=[(0,74),(0.5,74),(1,76),(1.5,74),(2,71),(3,67),(3.5,69),
          (4,71),(4.5,71),(5,73),(5.5,74),(6,69),
          (8,71),(8.5,72),(9,74),(9.5,76),(10,79),(11,76),(11.5,74),
          (12,72),(12.5,71),(13,72),(13.5,74),(14,71),(15,67)]
    for bt_,m in hook:
        st_=int(bt_*ob*sr); tt_=np.arange(int(0.9*sr))/sr; e=min(len(tt_),OL-st_)
        om[st_:st_+e]+=0.11*bell(note(m+12),tt_[:e])
    for k_ in range(16):   # kick, claps on 2&4, shaker 8ths
        st_=int(k_*ob*sr)
        tk=np.arange(int(0.18*sr))/sr; om[st_:st_+len(tk)]+=0.3*np.exp(-tk*22)*np.sin(2*np.pi*(60+80*np.exp(-tk*40))*tk)
        if k_%2==1:
            for d_ in (0,0.008,0.017):
                cs=st_+int(d_*sr); tc=np.arange(int(0.12*sr))/sr; om[cs:cs+len(tc)]+=0.05*np.exp(-tc*35)*rngo.standard_normal(len(tc))
        for h in (0,0.5):
            hs=st_+int(h*ob*sr); th=np.arange(int(0.05*sr))/sr; om[hs:hs+len(th)]+=0.02*np.exp(-th*60)*rngo.standard_normal(len(th))
    bo,ao=butter(2,7000/(sr/2)); om=lfilter(bo,ao,om)

    bo, ao = butter(2, 7000/(sr/2)); om = lfilter(bo, ao, om)
    bgm_outro = om / np.max(np.abs(om)) * 0.9
    return sr, bgm_main, bgm_outro

def make_se(sr=44100):
    rng = np.random.default_rng(3)
    tp=np.arange(int(0.12*sr))/sr; POP=np.sin(2*np.pi*(700+900*np.exp(-tp*40))*tp)*np.exp(-tp*35)
    ts_=np.arange(int(0.18*sr))/sr; STP=np.sin(2*np.pi*(500+700*ts_/ts_[-1])*ts_)*np.exp(-ts_*12)
    tw_=np.arange(int(0.45*sr))/sr; nz=rng.standard_normal(len(tw_)); b2,a2=butter(2,[600/(sr/2),4000/(sr/2)],btype="band")
    WH=lfilter(b2,a2,nz)*np.sin(np.pi*tw_/tw_[-1])
    tc=np.arange(int(0.5*sr))/sr  # キャラ登場: 2音のチャイム
    CH=np.zeros(len(tc))
    for k,f in enumerate((880,1318.5)):
        s=int(k*0.09*sr); t=tc[:len(tc)-s]; CH[s:]+=np.sin(2*np.pi*f*t)*np.exp(-t*7)*(1-np.exp(-t*300))
    tsc=np.arange(int(0.35*sr))/sr; SCR=np.sin(2*np.pi*(900*np.exp(-tsc*6)+120)*tsc)*np.exp(-tsc*7)+0.5*rng.standard_normal(len(tsc))*np.exp(-tsc*10)
    to=np.arange(int(0.9*sr))/sr  # オチ: 間抜けな下降音
    OCHI=np.sign(np.sin(2*np.pi*(520*np.exp(-to*1.6))*to))*np.exp(-to*3.2)*0.6
    ti=np.arange(int(0.25*sr))/sr; TICK=np.sin(2*np.pi*1500*ti)*np.exp(-ti*40)
    out={"res.wav":TICK,"emphasis.wav":STP,"chapter.wav":WH,"character.wav":CH,"bgm_cut.wav":SCR,"ochi.wav":OCHI,"pop.wav":POP}
    return {k:(v/np.max(np.abs(v))*0.9) for k,v in out.items()}

def wav(p, sr, x):
    if _need(p): wavfile.write(p, sr, (np.clip(x,-1,1)*32767).astype(np.int16))

def main():
    from PIL import ImageFont
    print("背景")
    p = A/"backgrounds"/"hall.png"
    if _need(p): make_bg().save(p)
    print("キャラクター")
    for kind, folder in (("usa","rabbit"),("neko","cat")):
        for f in ("normal","cry","shock","smug","angry","jito"):
            p = A/"characters"/folder/f"{f}.png"
            if _need(p): draw_char(kind, f, 760).save(p)
    print("BGM")
    sr, m, o = make_music()
    wav(A/"bgm"/"main.wav", sr, m)
    wav(A/"bgm"/"ending.wav", sr, o)
    print("SE")
    for k, v in make_se(sr).items():
        wav(A/"se"/k, sr, v)

if __name__ == "__main__":
    main()
