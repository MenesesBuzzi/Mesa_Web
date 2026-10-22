# Gera js/dados.js a partir das pastas de assets e dos CSVs de ordem/selo (digital/screentop/grades_tts).
# Uso: python3 ferramentas/gera_dados.py   (rodar dentro de digital/mesa_web)
import csv, json, os
M = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.dirname(os.path.dirname(M))
GR = f'{P}/digital/screentop/grades_tts'
BARALHOS = ['evento', 'distorcao', 'laco', 'pacto', 'dica', 'sanidade_100', 'sanidade_75', 'sanidade_50', 'sanidade_25', 'sanidade_10']
ROT = {'evento': 'Evento', 'distorcao': 'Distorção', 'laco': 'Laço', 'pacto': 'Pacto', 'dica': 'Dica',
       'sanidade_100': 'Sanidade 100%', 'sanidade_75': 'Sanidade 75%', 'sanidade_50': 'Sanidade 50%',
       'sanidade_25': 'Sanidade 25%', 'sanidade_10': 'Sanidade 10%'}
dados = {'baralhos': {}, 'cartas': {}}
for b in BARALHOS:
    pasta = f'{M}/assets/cartas/{b}'
    arqs = {os.path.splitext(f)[0]: f for f in os.listdir(pasta)}
    ids = []
    with open(f'{GR}/deck_{b}.csv', encoding='utf-8') as fh:
        linhas = [l for l in fh if not l.startswith('#')]
    for r in csv.DictReader(linhas):
        base = os.path.splitext(r['arquivo'])[0]
        if base.startswith('verso'): continue
        cid = f'{b}/{base}'
        c = {'img': f'assets/cartas/{b}/{arqs[base]}', 'nome': r['nome'], 'baralho': b}
        if b == 'dica': c['selo'] = 'branco' if 'branco' in r['detalhe'] else 'preto'
        dados['cartas'][cid] = c; ids.append(cid)
    verso = [f for k, f in arqs.items() if k.startswith('verso')][0]
    dados['baralhos'][b] = {'rotulo': ROT[b], 'verso': f'assets/cartas/{b}/{verso}', 'cartas': ids}
dados['disco'] = {int(f.split('_')[-1][:3]): f'assets/cartas/disco/{f}' for f in sorted(os.listdir(f'{M}/assets/cartas/disco')) if 'disco_' in f}
dados['marcadorNivel'] = {n: f'assets/cartas/marcador_nivel/{f}' for n, f in zip([100, 75, 50, 25, 10], sorted(os.listdir(f'{M}/assets/cartas/marcador_nivel'))[:5])}
fs = sorted(f for f in os.listdir(f'{M}/assets/fichas_sala') if not f.startswith('verso'))
dados['fichas'] = {os.path.splitext(f)[0]: {'img': f'assets/fichas_sala/{f}', 'tipo': {'chave': 'Chave', 'vazia': 'Vazia', 'armadilha': 'Armadilha'}[f.split('_')[1].split('.')[0]]} for f in fs}
dados['versoFicha'] = 'assets/fichas_sala/verso_ficha_sala.webp'
H = [('o_medico', 'O Médico', 'Sangue', 'recupera 15% de outro Hóspede no seu cômodo'),
     ('o_operario', 'O Operário', 'Altura', 'atravessa uma parede para um cômodo vizinho, ou solta do Laço um Hóspede no seu cômodo'),
     ('o_controle_de_pragas', 'O Controle de Pragas', 'Multidão', 'o Palhaço volta para o Porão, e todos no seu cômodo ignoram o próximo Susto'),
     ('o_radialista_amado', 'O Radialista Amado', 'Silêncio', 'obriga uma Voz a revelar a todos se a última Dica dela era verdadeira'),
     ('o_contador_de_historias', 'O Contador de Histórias', 'Escuro', 'antes de um Evento ser lido, olha a carta e escolhe se vale o texto normal ou o invertido'),
     ('a_medium', 'A Médium', 'Espelhos', 'olha a Ficha de qualquer cômodo'),
     ('o_quimico', 'O Químico', 'Altura', 'rola o Dado: olho fechado, ganha 20%; olho aberto, perde 10% e descarta 1 Distorção')]
dados['hospedes'] = []
for i, (slug, nome, fob, hab) in enumerate(H, 1):
    dados['hospedes'].append({'id': slug, 'nome': nome, 'fobia': fob, 'habilidade': hab,
        'peao': f'assets/peoes/{i:02d}_peao_{slug}.webp', 'frente': f'assets/personagens/{i:02d}_{slug}_frente.jpg',
        'verso': f'assets/personagens/{i:02d}_{slug}_verso_usada.jpg'})
dados['palhaco'] = {'nome': 'O Palhaço', 'peao': 'assets/peoes/08_peao_o_palhaco.webp', 'frente': 'assets/personagens/08_o_palhaco_frente.jpg'}
dados['corrente'] = 'assets/peoes/corrente_laco.webp'
dados['dado'] = {i: f'assets/dado_do_olho/{f}' for i, f in enumerate(sorted(os.listdir(f'{M}/assets/dado_do_olho')), 1)}
dados['relogioMarcador'] = 'assets/relogio/relogio_marcador.webp'
dados['mansao'] = json.load(open(f'{M}/ferramentas/coords_mansao.json', encoding='utf-8'))
dados['mansao']['img'] = 'assets/tabuleiro/mansao_completa.jpg'
with open(f'{M}/js/dados.js', 'w', encoding='utf-8') as fh:
    fh.write('// Gerado por ferramentas/gera_dados.py. Não edite à mão.\n')
    fh.write('// Tudo aqui é público (é o mesmo que as imagens da pasta assets). O que é secreto é QUAL carta está com quem: isso só o host sabe.\n')
    fh.write('export const DADOS = ' + json.dumps(dados, ensure_ascii=False, indent=1) + ';\n')
print(len(dados['cartas']), 'cartas;', {b: len(d['cartas']) for b, d in dados['baralhos'].items()})
