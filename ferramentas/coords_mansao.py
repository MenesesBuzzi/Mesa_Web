# Calcula as coordenadas (px em mansao_completa.jpg 4096x2452) dos cômodos e círculos FICHA, com a mesma geometria de mapa/tabuleiro.py.
# Rodar a partir de P/work (lê ../digital/screentop_leve/tabuleiro/mansao_completa.jpg); gera coords.json e check.png (conferência visual).
import json
DPI=300; MM=DPI/25.4
A4W,A4H=round(297*MM),round(210*MM); MG=round(10*MM); CW,CH=A4W-2*MG,A4H-2*MG
def geo(cols,rows,nx,ny,cw,ch):
    U=min(nx*cw/cols,ny*ch/rows); Wp,Hp=nx*cw,ny*ch; U=min(U,(Hp-24*MM)/rows)
    return U,(Wp-cols*U)/2,Hp-rows*U-4*MM,Wp,Hp
Us=min(2*CW/14,2*CH/9,(2*CH-24*MM)/9)
T=geo(14,9,2,2,CW,CH); S=T
pcw=int(5*Us+2*12*MM); pch=int(4*Us+24*MM)+1
Pg=geo(5,4,1,1,pcw,pch)
g=int(Us*0.8); top=int(Us*1.6)
terW,terH=T[3],T[4]
Wm=terW*2+3*g; Hm=top+terH+Pg[4]+3*g
r=8192/max(Wm,Hm); s=r*4096/8192 if max(Wm,Hm)>8192 else 4096/max(Wm,Hm)
s=4096/(round(Wm*r))*r
off={'T':(g,top+g),'S':(2*g+terW,top+g),'P':(g,top+2*g+terH),'O':(2*g+terW,top+2*g+terH)}
G={'T':T,'S':S,'P':Pg,'O':Pg}
def pt(f,x,y):
    U,ox,oy,_,_=G[f]; return [round((off[f][0]+ox+x*U)*s,1), round((off[f][1]+oy+y*U)*s,1)]
rooms=[('T',0,0,3,3,"Cozinha","Sangue"),('T',3,0,5,3,"Camarim",""),('T',5,0,10,3,"Palco","saída"),('T',10,0,14,3,"Capela","Silêncio"),
 ('T',0,3,14,4.5,"Galeria de Espelhos","Espelho"),('T',0,4.5,5,9,"Salão de Baile","Multidão + Espelho"),('T',5,4.5,9,9,"Saguão","Multidão"),('T',9,4.5,14,9,"Biblioteca","Silêncio"),
 ('S',10,0,14,3,"Torre","Altura"),('S',0,3,14,4.5,"Corredor Superior",""),('S',0,4.5,5,9,"Quarto da Criança","Escuro"),('S',5,4.5,9,9,"Mezanino",""),('S',9,4.5,14,9,"Enfermaria","Sangue"),
 ('P',0,0,5,4,"Porão","Escuro"),('O',0,0,5,4,"Sótão","Altura")]
fic={"Cozinha":('T',1.9,1.9),"Camarim":('T',4,1.95),"Capela":('T',12,1.95),"Salão de Baile":('T',2.5,6.9),"Biblioteca":('T',11.5,6.9),"Galeria de Espelhos":('T',10.9,3.75),
 "Torre":('S',12,1.95),"Quarto da Criança":('S',2.5,6.9),"Enfermaria":('S',11.5,6.9),"Porão":('P',2.6,1.9),"Sótão":('O',3.2,2.0)}
out=[]
for f,x0,y0,x1,y1,n,fob in rooms:
    a=pt(f,x0,y0); b=pt(f,x1,y1)
    d={'nome':n,'fobia':fob,'x0':a[0],'y0':a[1],'x1':b[0],'y1':b[1]}
    if n in fic: d['ficha']=pt(*fic[n])
    out.append(d)
fr=round(20*MM*s,1)
res={'largura':4096,'altura':2452,'raioFicha':fr,'salas':out,'inicio':pt('T',7,8.3),'palhacoInicio':pt('P',3.5,2.6),'casa':round(Us*s,1),
 'chavesPalco':[pt('T',6.2+k*0.8,2.2) for k in range(3)]}
print(round(Wm*r),round(Hm*r)); json.dump(res,open('coords.json','w'),ensure_ascii=False,indent=1)
from PIL import Image,ImageDraw
im=Image.open('../digital/screentop_leve/tabuleiro/mansao_completa.jpg').convert('RGB');d=ImageDraw.Draw(im)
for o in out:
    d.rectangle([o['x0'],o['y0'],o['x1'],o['y1']],outline=(255,0,0),width=4)
    if 'ficha' in o: x,y=o['ficha']; d.ellipse([x-fr,y-fr,x+fr,y+fr],outline=(0,0,255),width=5)
x,y=res['inicio'];d.ellipse([x-20,y-20,x+20,y+20],fill=(0,255,0))
x,y=res['palhacoInicio'];d.ellipse([x-20,y-20,x+20,y+20],fill=(0,255,0))
im.resize((2048,1226)).save('check.png')
