"""参考動画とB版合成音声の抑揚を測る（docs/analysis/voice_reference_2026-10-14.md の数値の出どころ）。
  pip install praat-parselmouth numpy
  python voice_ref_metrics.py <作業フォルダ>   # work/A.wav, work/B.wav（参考動画を16kHzモノラルにしたもの）と v/NN.wav（B版の声）を置く
参考動画の音声そのものはリポジトリに入れない。
"""
import sys, json, numpy as np, parselmouth, glob, os
S=sys.argv[1]
def load(path):
    snd=parselmouth.Sound(path).convert_to_mono()
    return snd
def metrics(snd, a, b, floor, ceil):
    seg=snd.extract_part(from_time=a,to_time=b,preserve_times=True)
    p=seg.to_pitch_ac(time_step=0.01,pitch_floor=floor,pitch_ceiling=ceil,voicing_threshold=0.55,octave_jump_cost=0.5)
    t=p.xs(); f=p.selected_array['frequency']
    v=f>0
    if v.sum()<15: return None
    fv=f[v]; tv=t[v]
    med=np.median(fv); st=12*np.log2(fv/med)
    # remove octave errors
    ok=np.abs(st)<14; fv,tv,st=fv[ok],tv[ok],st[ok]
    rng=np.percentile(st,90)-np.percentile(st,10)
    # voiced runs
    runs=[];s=tv[0];prev=tv[0]
    for x in tv[1:]:
        if x-prev>0.06: runs.append((s,prev)); s=x
        prev=x
    runs.append((s,prev))
    span=(runs[0][0],runs[-1][1])
    pauses=[round(runs[i+1][0]-runs[i][1],2) for i in range(len(runs)-1) if runs[i+1][0]-runs[i][1]>=0.15]
    # end contour: last voiced run, last 0.35s
    lr=runs[-1]; m=(tv>=max(lr[0],lr[1]-0.35))&(tv<=lr[1])
    end=float(st[m][-3:].mean()-st[m][:3].mean()) if m.sum()>=6 else float('nan')
    # pitch movement speed (st/s) within runs
    d=np.abs(np.diff(st)); dt=np.diff(tv); mv=float((d[dt<0.015]).mean()*100) if (dt<0.015).sum()>5 else float('nan')
    # syllable rate: intensity peaks in voiced region
    it=seg.to_intensity(time_step=0.01,minimum_pitch=floor); ix=it.xs(); iv=it.values[0]
    peaks=0;lp=-1
    for i in range(3,len(iv)-3):
        if iv[i]==iv[i-3:i+4].max() and iv[i]-min(iv[i-6:i].min() if i>=6 else iv[i], iv[i+1:i+7].min())>=1.5 and ix[i]-lp>=0.08:
            k=np.argmin(np.abs(t-ix[i]))
            if f[k]>0: peaks+=1; lp=ix[i]
    phon=sum(r[1]-r[0]+0.01 for r in runs)
    return dict(f0=round(float(med)), rng=round(float(rng),1), mv=round(mv,1), end=round(end,1),
        lastrun=round(lr[1]-lr[0],2), pauses=pauses, rate=round(peaks/phon,1) if phon>0 else 0, span=round(span[1]-span[0],2))
segs={'A':[('F','実況・状況説明',7.6,12.0),('F','実況・状況',12.0,14.8),('M','解説・感想',15.0,21.3),('F','質問',21.4,24.3),
 ('M','解説・結論',24.4,28.9),('M','解説・付け足し',29.0,31.4),('F','相づち',31.5,34.6),('F','実況・叫び',36.4,41.0),
 ('F','実況',44.4,48.0),('F','試合終了',48.0,50.4),('F','振り返り',50.4,54.0),('M','評価・感嘆',54.0,59.4),('M','言い換え',59.4,63.0),
 ('F','同意を求める質問',63.0,68.0),('M','反論',68.0,72.3),('F','説明',72.4,75.0),('F','確認の質問',75.0,78.3),('M','短い同意',78.4,80.0),('F','まとめ',80.0,85.3)],
 'B':[('M','あいさつ',0.0,2.7),('M','名乗り',2.8,6.3),('M','評価',19.8,25.7),('M','短い感嘆',25.8,27.7)]}
res=[]
for clip,lst in segs.items():
    snd=load(f'{S}/work/{clip}.wav')
    for g,label,a,b in lst:
        fl,ce=(150,650) if g=='F' else (70,350)
        m=metrics(snd,a,b,fl,ce)
        if m: res.append(dict(src=f'{clip}{a:05.1f}',g=g,label=label,**m))
nagi=['01','03','05','06','08','10','12','14','16','18']; baku=['02','04','07','09','11','13','15','17','19','20']
for i in nagi+baku:
    snd=load(f'{S}/v/{i}.wav'); g='F' if i in nagi else 'M'
    fl,ce=(150,650) if g=='F' else (70,350)
    m=metrics(snd,0,snd.duration,fl,ce)
    if m: res.append(dict(src=f'TTS{i}',g=g,label='ナギB' if g=='F' else 'バクB',**m))
json.dump(res,open(f'{S}/work/metrics.json','w'),ensure_ascii=False,indent=0)
for r in res: print(r)
