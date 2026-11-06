# Genera public/anim/catalogo.json (la lista de ejercicios 3D que usa anim/biblioteca.html).
# Lee los ejercicios del visor (EX) abriéndolo en Chromium y toma los valores sugeridos (series, reps, nota…)
# de las bibliotecas *_LIB de Tempo.  Uso: python3 tools/catalogo.py RUTA_A_THREE_R128
import sys,os,re,json,http.server,socketserver,functools,threading,time
from playwright.sync_api import sync_playwright
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public');TH=sys.argv[1]
MAP={'three.min.js':'build/three.min.js','fflate.min.js':'examples/js/libs/fflate.min.js','NURBSUtils.js':'examples/js/curves/NURBSUtils.js','NURBSCurve.js':'examples/js/curves/NURBSCurve.js','FBXLoader.js':'examples/js/loaders/FBXLoader.js'}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
import socket;_s=socket.socket();_s.bind(("127.0.0.1",0));PORT=_s.getsockname()[1];_s.close()
srv=socketserver.TCPServer(("127.0.0.1",PORT),functools.partial(Q,directory=ROOT));threading.Thread(target=srv.serve_forever,daemon=True).start()
def route(r):
    u=r.request.url
    for k,v in MAP.items():
        if u.endswith('/'+k):return r.fulfill(status=200,content_type='text/javascript',body=open(os.path.join(TH,v)).read())
    if 'visor-ejercicios.html' in u:
        b=r.fetch().text().replace("let exId='press-pecho-maquina',ex=EX[exId];","let exId='press-pecho-maquina',ex=EX[exId];window.__EX=EX;window.__MN=MUSC_NAME;")
        return r.fulfill(status=200,content_type='text/html',body=b)
    if '127.0.0.1' in u:return r.continue_()
    return r.abort()
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']);pg=b.new_page();pg.route('**/*',route)
    pg.goto(f'http://127.0.0.1:{PORT}/anim/visor-ejercicios.html?ej=press-pecho-maquina&compact=1')
    pg.wait_for_function("document.documentElement.classList.contains('ready')",timeout=90000)
    ex=pg.evaluate("Object.entries(__EX).filter(([k,e])=>!e.soloEquipo).map(([k,e])=>({id:k,nombre:e.nombre,grupo:e.grupo,musc:Object.entries(e.musc||{}).sort((a,b)=>b[1]-a[1]).map(([m,v])=>({m:__MN[m]||m,p:v>=1?1:0}))}))")
    b.close()
srv.shutdown()
t=open(os.path.join(ROOT,'entrenador/index.html')).read();lib={}
for line in t.split('\n'):
    m=re.match(r'const ([A-Z0-9]+)_LIB=(\{.*\});',line)
    if not m:continue
    raw=m.group(2)
    if not raw.startswith('{"'):raw=re.sub(r'([{,])([a-zA-Z_]+):',r'\1"\2":',raw)   # ANIM_LIB está en formato JS
    try:d=json.loads(raw)
    except Exception as e:print('no pude leer',m.group(1),e);continue
    if 'img' in d:d={'l_elevfrontpolea':d}
    for k,v in d.items():
        if str(v.get('img','')).startswith('anim:'):lib.setdefault(v['img'][5:],{'libId':k,**{x:v.get(x,'') for x in ('name','group','sets','reps','rest','notes','pattern')}})
PAT_DEF={'face-pull-polea':'hombro_post','elevacion-lateral-mancuernas':'hombro_lat','sentadilla-smith':'sentadilla','sentadilla-hack':'sentadilla','prensa-inclinada':'sentadilla',
  'extension-cuadriceps':'ext_rodilla','abductores-maquina':'abd_cadera','curl-femoral-acostado':'curl_fem','peso-muerto-mancuernas':'bisagra','hip-thrust':'ext_cadera',
  'bulgara-mancuernas':'zancada','plancha-lateral-derecha':'core_estab','elevacion-piernas-acostado':'core_flex'}
PATS=json.dumps(re.findall(r'\["([a-z_]+)","([^"]+)","([^"]+)"\]',t[t.index('const PATTERNS=['):t.index('];',t.index('const PATTERNS=['))]))
out=[]
for e in ex:
    if not os.path.exists(os.path.join(ROOT,'anim/fotos',e['id']+'.jpg')):print('sin foto:',e['id'])
    out.append({**e,'lib':lib.get(e['id']) or {'libId':'','name':e['nombre'],'group':e['grupo'],'sets':'3','reps':'10-12','rest':'90','notes':'','pattern':PAT_DEF.get(e['id'],'')}})
open(os.path.join(ROOT,'anim/catalogo.json'),'w').write(json.dumps({'patrones':json.loads(PATS),'ejercicios':out},ensure_ascii=False,separators=(',',':')))
print(len(out),'ejercicios ·',sum(1 for o in out if o['lib']),'con valores sugeridos')
