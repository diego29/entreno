# Arma la versión "artefacto" de anim/biblioteca.html: un solo archivo con el catálogo, las fotos, los dos personajes (.fbx)
# y el visor 3D adentro, para verla fuera del sitio. Uso: python3 tools/artefacto.py SALIDA.html
import sys,os,json,base64
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','anim')
cat=json.load(open(os.path.join(R,'catalogo.json')))
imgs={e['id']:'data:image/jpeg;base64,'+base64.b64encode(open(os.path.join(R,'fotos',e['id']+'.jpg'),'rb').read()).decode() for e in cat['ejercicios']}
fbx={m:base64.b64encode(open(os.path.join(R,'modelos',m+'.fbx'),'rb').read()).decode() for m in ('hombre','mujer')}
visor=open(os.path.join(R,'visor-ejercicios.html')).read()
n=visor.count('new URLSearchParams(location.search)');assert n==2,n
visor=visor.replace('new URLSearchParams(location.search)','new URLSearchParams(window.__Q||location.search)')
visor=visor.replace('url("posters/\'+e+\'.svg")','none')   # sin póster de fondo (no hay archivos sueltos)
page=open(os.path.join(R,'..','biblioteca','index.html')).read()
body=page[page.index('<title>'):page.index('</head>')]+page[page.index('<body>')+6:page.index('</body>')]
body=body.replace('<script type="module">if(!window.__ART)import("../shared/fb.js")</script>','')
import re;body=re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?|<meta name="(theme-color|apple-mobile-web-app-[a-z]+)"[^>]*>\n?','',body)
data='<script>window.__ART='+json.dumps({'cat':cat,'imgs':imgs,'fbx':fbx,'visor':visor},ensure_ascii=False).replace('</','<\\/')+'</script>\n'
i=body.index('<script>\n/* Funciona en dos lugares')
out=body[:i]+data+body[i:]
open(sys.argv[1],'w').write(out);print(round(len(out.encode())/1e6,2),'MB')
