import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[1]))
cols = int(sys.argv[3]) if len(sys.argv)>3 else 4
ims = [Image.open(f) for f in files]
w = 420; ims = [im.resize((w, int(im.height*w/im.width))) for im in ims]
h = max(im.height for im in ims); rows = (len(ims)+cols-1)//cols
M = Image.new('RGB', (cols*w, rows*h), 'black')
for i, im in enumerate(ims): M.paste(im, ((i%cols)*w, (i//cols)*h))
M.save(sys.argv[2])
