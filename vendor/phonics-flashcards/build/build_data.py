import os
HERE=os.path.dirname(os.path.abspath(__file__))
MD_PATH=os.path.join(HERE,'..','source','OPW自然拼读词形总表.md')
OUT_PATH=os.path.join(HERE,'units.json')
# -*- coding: utf-8 -*-
import json, re
md=open(MD_PATH,encoding='utf-8').read()

CN={'acorn':'橡子','adult':'成年人','alligator':'短吻鳄','ant':'蚂蚁','apple':'苹果','August':'八月','ax':'斧头',
'baby':'婴儿','bag':'袋子','ball':'球','banana':'香蕉','bank':'银行','bat':'蝙蝠','bath':'洗澡','bay':'海湾','bear':'熊',
'beautiful':'美丽的','bed':'床','bee':'蜜蜂','belt':'腰带','bib':'围嘴','big':'大的','bike':'自行车','bin':'垃圾箱','bird':'鸟',
'black':'黑色','blanket':'毯子','blue':'蓝色','board':'木板','boat':'船','bone':'骨头','book':'书','boot':'靴子','bow':'鞠躬',
'box':'盒子','boy':'男孩','bread':'面包','bride':'新娘','broom':'扫帚','brown':'棕色','brush':'刷子','bud':'花蕾','bug':'虫子',
'bun':'小圆面包','bush':'灌木','cage':'笼子','cake':'蛋糕','camp':'营地','can':'罐头','candy':'糖果','cane':'手杖','cap':'帽子',
'cape':'披风','car':'汽车','castle':'城堡','cat':'猫','catch':'抓住','cave':'山洞','cell phone':'手机','chair':'椅子','cheer':'欢呼',
'cheese':'奶酪','chick':'小鸡','chicken':'鸡','child':'孩子','city':'城市','clear':'清澈的','clock':'时钟','club':'俱乐部','clue':'线索',
'coat':'外套','coin':'硬币','cold':'冷的','comb':'梳子','competition':'比赛','computer':'电脑','cone':'圆锥','cot':'婴儿床','cow':'奶牛',
'crab':'螃蟹','crocodile':'鳄鱼','cry':'哭','cub':'幼兽','cube':'立方体','cup':'杯子','cut':'切','cute':'可爱的','dad':'爸爸','dam':'水坝',
'dangerous':'危险的','day':'白天','deer':'鹿','desk':'书桌','dew':'露水','die':'死','dig':'挖','dive':'跳水','doctor':'医生','dog':'狗',
'doll':'洋娃娃','dolphin':'海豚','dot':'点','draw':'画','dress':'连衣裙','drum':'鼓','duck':'鸭子','ear':'耳朵','eat':'吃','egg':'蛋',
'elbow':'手肘','elephant':'大象','elevator':'电梯','envelope':'信封','excursion':'短途旅行','famous':'著名的','fan':'扇子','farm':'农场',
'fast':'快的','father':'父亲','feet':'脚(复)','fig':'无花果','fin':'鱼鳍','fine':'好的','fish':'鱼','five':'五','flag':'旗帜','fly':'飞',
'food':'食物','foot':'脚','fork':'叉子','fox':'狐狸','Friday':'星期五','frog':'青蛙','fruit':'水果','fun':'乐趣','game':'游戏','gate':'大门','giant':'巨人',
'gift':'礼物','giraffe':'长颈鹿','girl':'女孩','glass':'玻璃杯','globe':'地球仪','glove':'手套','glue':'胶水','goat':'山羊','gorilla':'大猩猩',
'grass':'草','green':'绿色','gum':'口香糖','hair':'头发','hand':'手','happy':'开心的','hat':'帽子','hay':'干草','he':'他','head':'头',
'helpful':'有帮助的','hen':'母鸡','high':'高的','hike':'徒步','hip':'臀部','hit':'打','home':'家','honey':'蜂蜜','hop':'跳','horse':'马',
'hot':'热的','hot dog':'热狗','hotel':'旅馆','house':'房子','hug':'拥抱','hum':'哼唱','hut':'小屋','ice cream':'冰淇淋','igloo':'冰屋',
'iguana':'鬣蜥','in':'在里面','ink':'墨水','insect':'昆虫','jacket':'夹克','jam':'果酱','jeans':'牛仔裤','jeep':'吉普车','jet':'喷气机',
'jug':'水壶','juice':'果汁','June':'六月','kangaroo':'袋鼠','key':'钥匙','kid':'小孩','king':'国王','kite':'风筝','knee':'膝盖','knife':'刀',
'lady':'女士','lake':'湖','lamb':'小羊','lamp':'台灯','leaf':'叶子','legs':'腿(复)','lemon':'柠檬','lid':'盖子','lie':'躺/说谎','light':'光',
'lime':'青柠','line':'线','lion':'狮子','lip':'嘴唇','live':'居住','log':'原木','long':'长的','love':'爱','lunch':'午餐','mail':'邮件',
'man':'男人','mane':'鬃毛','map':'地图','mat':'垫子','May':'五月','measure':'测量','meat':'肉','milk':'牛奶','mix':'混合','money':'钱',
'monkey':'猴子','moon':'月亮','mop':'拖把','mother':'妈妈','mouse':'老鼠','mud':'泥','mug':'马克杯','mule':'骡子','music':'音乐','mute':'静音',
'my':'我的','nail':'钉子','name':'名字','nap':'小睡','nature':'自然','nest':'鸟巢','net':'网','new':'新的','night':'夜晚','nine':'九',
'nose':'鼻子','nurse':'护士','nut':'坚果','octopus':'章鱼','olive':'橄榄','orange':'橙子','ostrich':'鸵鸟','ox':'公牛','pad':'垫子','paint':'油漆',
'pan':'平底锅','panda':'熊猫','park':'公园','pay':'付钱','peach':'桃子','pear':'梨','pen':'钢笔','pencil':'铅笔','pet':'宠物','phone':'电话',
'picture':'图片','pie':'派','pillow':'枕头','pin':'别针','pine':'松树','pineapple':'菠萝','pink':'粉色','pit':'坑','plate':'盘子','play':'玩',
'pop':'砰/流行','pot':'锅','prawn':'大虾','pull':'拉','pup':'小狗','purple':'紫色','queen':'女王','question':'问题','quilt':'被子','quiz':'测验',
'rabbit':'兔子','rag':'抹布','rain':'雨','ram':'公羊','rat':'老鼠','red':'红色','rhino':'犀牛','rhubarb':'大黄','rib':'肋骨','rice':'米饭',
'right':'右/对','rip':'撕','ripe':'成熟的','road':'路','roar':'吼叫','robot':'机器人','rocket':'火箭','rod':'杆','rope':'绳子','rose':'玫瑰',
'row':'排/划','rug':'小地毯','rule':'规则','run':'跑','sail':'帆','sauce':'酱汁','say':'说','scale':'秤','school':'学校','sea':'海','seal':'海豹',
'seed':'种子','share':'分享','she':'她','shell':'贝壳','ship':'轮船','sip':'小口喝','sister':'姐妹','six':'六','skate':'溜冰','skunk':'臭鼬',
'sky':'天空','sleep':'睡觉','slide':'滑梯','smile':'微笑','smoke':'烟','snake':'蛇','snow':'雪','soap':'肥皂','socks':'袜子','soil':'泥土',
'son':'儿子','splash':'飞溅','splint':'夹板','spoon':'勺子','spot':'斑点','spray':'喷雾','spring':'春天','spy':'间谍','square':'正方形','squid':'鱿鱼',
'stamp':'邮票','star':'星星','station':'车站','stop':'停','string':'细绳','strong':'强壮的','suit':'西装','sun':'太阳','surprise':'惊喜','swim':'游泳',
'swing':'秋千','tail':'尾巴','tall':'高的','tap':'水龙头','tape':'胶带','teacher':'老师','teeth':'牙齿','television':'电视','ten':'十','tent':'帐篷',
'test':'测试','that':'那个','think':'想','this':'这个','three':'三','tie':'领带','tiger':'老虎','time':'时间','tip':'尖端','toad':'蟾蜍','top':'陀螺',
'toy':'玩具','tractor':'拖拉机','treasure':'宝藏','tree':'树','truck':'卡车','tub':'浴盆','tube':'管子','Tuesday':'星期二','tune':'曲调','turtle':'乌龟',
'umbrella':'雨伞','umpire':'裁判','uncle':'叔叔','uniform':'制服','up':'向上','van':'货车','vest':'背心','vet':'兽医','violin':'小提琴','wait':'等待',
'walk':'走','watch':'手表','water':'水','wave':'波浪','wax':'蜡','web':'网','wet':'湿的','whale':'鲸鱼','whistle':'哨子','white':'白色','wig':'假发',
'win':'赢','wind':'风','window':'窗户','wolf':'狼','write':'写','wrong':'错的','yacht':'游艇','yak':'牦牛','yam':'山药','yellow':'黄色','yo-yo':'溜溜球',
'yogurt':'酸奶','zebra':'斑马','zero':'零','zip':'拉链','zipper':'拉链','zoo':'动物园'}

IPA2CUE={'æ':'aa','e':'eh','ɪ':'ih','ɒ':'ah','ʌ':'uh','ə':'uh','ʊ':'uu','eɪ':'ay','iː':'ee','aɪ':'eye','əʊ':'oh','juː':'you','uː':'ooh',
'aʊ':'ow','ɔɪ':'oy','ɔː':'aw','ɑː':'ah','ɜː':'er','eə':'air','ɪə':'ear','b':'buh','k':'kuh','d':'duh','f':'fff','g':'guh','h':'huh',
'dʒ':'juh','l':'lll','m':'mmm','n':'nnn','p':'puh','kw':'kwuh','r':'ruh','s':'sss','t':'tuh','v':'vvv','w':'wuh','ks':'ks','j':'yuh','z':'zzz',
'ʃ':'shh','tʃ':'ch','θ':'th','ð':'th','ŋ':'ng','bl':'bluh','kl':'kluh','br':'bruh','kr':'kruh','fl':'fluh','gl':'gluh','fr':'fruh','gr':'gruh',
'pl':'pluh','sl':'sluh','dr':'druh','tr':'truh','sm':'smuh','sn':'snuh','sp':'spuh','sw':'swuh','st':'stuh','ŋk':'nk','nd':'nnd','nt':'nt',
'lt':'lt','mp':'mp','sk':'skuh','spr':'spruh','str':'struh','spl':'spluh','skw':'skwuh'}
L1IPA={'a':'æ','b':'b','c':'k','d':'d','e':'e','f':'f','g':'g','h':'h','i':'ɪ','j':'dʒ','k':'k','l':'l','m':'m','n':'n','o':'ɒ',
'p':'p','q':'kw','r':'r','s':'s','t':'t','u':'ʌ','v':'v','w':'w','x':'ks','y':'j','z':'z'}
RIME_IPA={'am':'æm','an':'æn','ad':'æd','ag':'æg','ap':'æp','at':'æt','et':'et','en':'en','ed':'ed','ip':'ɪp','ib':'ɪb','id':'ɪd',
'in':'ɪn','ig':'ɪg','it':'ɪt','ix':'ɪks','ot':'ɒt','op':'ɒp','ug':'ʌg','ud':'ʌd','up':'ʌp','ut':'ʌt','ub':'ʌb','um':'ʌm','un':'ʌn',
'ame':'eɪm','ake':'eɪk','ate':'eɪt','ave':'eɪv','ime':'aɪm','ike':'aɪk','ive':'aɪv','ine':'aɪn'}
GIPA={(2,1,'a'):'æ',(2,3,'e'):'e',(2,4,'i'):'ɪ',(2,6,'o'):'ɒ',(2,7,'u'):'ʌ',
(3,1,'a_e'):'eɪ',(3,2,'i_e'):'aɪ',(3,3,'o_e'):'əʊ',(3,4,'ai'):'eɪ',(3,4,'ay'):'eɪ',
(3,5,'ee'):'iː',(3,5,'ea'):'iː',(3,5,'y'):'iː',(3,5,'ey'):'iː',(3,6,'igh'):'aɪ',(3,6,'ie'):'aɪ',(3,6,'y'):'aɪ',
(3,7,'oa'):'əʊ',(3,7,'ow'):'əʊ',(3,8,'ue'):'uː',(3,8,'ui'):'uː',(3,8,'ew'):'juː',(3,8,'oo'):'uː',
(4,1,'bl'):'bl',(4,1,'cl'):'kl',(4,1,'br'):'br',(4,1,'cr'):'kr',(4,1,'fl'):'fl',(4,1,'gl'):'gl',
(4,2,'fr'):'fr',(4,2,'gr'):'gr',(4,2,'pl'):'pl',(4,2,'sl'):'sl',(4,2,'dr'):'dr',(4,2,'tr'):'tr',
(4,3,'sm'):'sm',(4,3,'sn'):'sn',(4,3,'sp'):'sp',(4,3,'sw'):'sw',(4,3,'st'):'st',
(4,4,'sh'):'ʃ',(4,4,'ch'):'tʃ',(4,4,'tch'):'tʃ',(4,4,'ph'):'f',(4,4,'wh'):'w',
(4,5,'ck'):'k',(4,5,'qu'):'kw',(4,6,'ng'):'ŋ',(4,6,'nk'):'ŋk',(4,6,'nd'):'nd',(4,6,'nt'):'nt',(4,6,'lt'):'lt',(4,6,'mp'):'mp',
(4,7,'sk'):'sk',(4,7,'sc'):'sk',(4,7,'spr'):'spr',(4,7,'str'):'str',(4,7,'spl'):'spl',(4,7,'squ'):'skw',
(5,1,'ar'):'ɑː',(5,1,'ir'):'ɜː',(5,1,'ur'):'ɜː',(5,1,'er'):'ɜː',
(5,2,'ou'):'aʊ',(5,2,'ow'):'aʊ',(5,2,'oi'):'ɔɪ',(5,2,'oy'):'ɔɪ',(5,2,'oo'):'ʊ',(5,2,'u'):'ʊ',
(5,3,'au'):'ɔː',(5,3,'aw'):'ɔː',(5,3,'or'):'ɔː',(5,3,'oar'):'ɔː',
(5,4,'are'):'eə',(5,4,'air'):'eə',(5,4,'ea'):'e',(5,4,'eer'):'ɪə',
(5,5,'a'):'eɪ',(5,5,'e'):'iː',(5,5,'i'):'aɪ',(5,5,'o'):'əʊ',(5,5,'u'):'juː',
(5,6,'a'):'ə',(5,6,'e'):'ə',(5,6,'i'):'ə',(5,6,'o'):'ʌ',(5,6,'u'):'ə',
(5,7,'kn'):'n',(5,7,'wr'):'r',(5,7,'mb'):'m',(5,7,'rh'):'r',(5,7,'st'):'s'}
DESC={'voiced th':('th (浊)','ð','th'),'unvoiced th':('th (清)','θ','th'),'soft c':('c (软)','s','sss'),
'soft g':('g (软)','dʒ','juh'),'voiced s':('s (浊)','z','zz')}
DIRECT={(5,1,'or'):('ə(r)','er'),(5,3,'all'):('ɔːl','awl'),(5,3,'wa'):('wɒ','waw'),(5,7,'ve'):('v','vuh'),
(5,8,'ture'):('tʃə(r)','cher'),(5,8,'sure'):('ʒə(r)','zher'),(5,8,'tion'):('ʃən','shun'),(5,8,'sion'):('ʒən','zhun'),
(5,8,'ous'):('əs','us'),(5,8,'ful'):('fəl','full')}
LACC={1:('#15706A','#E9F2F0'),2:('#4E7C59','#EBF1EC'),3:('#3E6C90','#E9EFF5'),4:('#B07A3C','#F6EEE2'),5:('#835A86','#F1EBF2')}
def slash(x): return '/'+x+'/'
def ipa_cue(level,unit,g_raw,words):
    low=g_raw.strip().lower(); wl=[w.lower() for w in words]; disp=g_raw.strip()
    if low in DESC: d,ipa,cue=DESC[low]; return d,slash(ipa),cue
    if level==1: ipa=L1IPA[low[0]]; return disp,slash(ipa),IPA2CUE[ipa]
    if (level,unit)==(5,4) and low=='ear':
        ipa='eə' if any(w in('bear','pear') for w in wl) else 'ɪə'; return disp,slash(ipa),IPA2CUE[ipa]
    if (level,unit)==(3,3) and low=='u_e':
        ipa='juː' if any(w in('cube','mute','cute','mule') for w in wl) else 'uː'; return disp,slash(ipa),IPA2CUE[ipa]
    if (level,unit,low) in DIRECT:
        ipd,cue=DIRECT[(level,unit,low)]; return disp,('(不发音)' if ipd=='不发音' else slash(ipd)),cue
    if low in RIME_IPA: return disp,slash(RIME_IPA[low]),('icks' if low=='ix' else low)
    if (level,unit,low) in GIPA: ipa=GIPA[(level,unit,low)]; return disp,slash(ipa),IPA2CUE.get(ipa,low.replace('_',' '))
    return disp,'',low.replace('_',' ')

def normg(g):
    low=g.strip().lower()
    if low in DESC: return low.split()[-1]
    return low.replace('_','')
def positional(gr,wo):
    n=len(gr);k=len(wo);base=k//n;extra=k%n;idx=0;res=[]
    for i,g in enumerate(gr):
        sz=base+(1 if i<extra else 0);res.append((g,wo[idx:idx+sz]));idx+=sz
    return res
def split_row(level,unit,gr,wo):
    gr=[g.strip() for g in gr if g.strip()];wo=[w.strip() for w in wo if w.strip()]
    if len(gr)==1: return [(gr[0],wo)]
    if all(len(normg(g))==1 for g in gr): return positional(gr,wo)
    assign={g:[] for g in gr};leftover=[]
    for w in wo:
        wl=w.lower();best=None
        for g in gr:
            gn=normg(g)
            if gn and gn in wl and (best is None or len(normg(g))>len(normg(best))): best=g
        if best is not None: assign[best].append(w)
        else: leftover.append(w)
    if leftover: return positional(gr,wo)
    return [(g,assign[g]) for g in gr if assign[g]]

level=unit=None;UNITS=[];cur=None;uid=0
for line in md.splitlines():
    s=line.strip()
    m=re.match(r'##\s*Level\s*(\d+)',s)
    if m: level=int(m.group(1));continue
    m=re.match(r'###\s*Unit\s*(\d+):\s*(.*)',s)
    if m:
        unit=int(m.group(1));ut=m.group(2).strip()
        cur={'key':f'L{level}-U{unit}','label':f'L{level}-U{unit} · {ut}','level':level,'cards':[]};UNITS.append(cur);continue
    if s.startswith('|') and cur is not None:
        cells=[c.strip() for c in s.strip('|').split('|')]
        if len(cells)<2 or cells[0]=='词形' or set(cells[0])<=set('-: '): continue
        for g,ws in split_row(level,unit,cells[0].split(','),cells[1].split(',')):
            disp,ipa,cue=ipa_cue(level,unit,g,ws); acc,tint=LACC[level]
            cur['cards'].append({'id':f'c{uid}','g':disp,'ipa':ipa,'cue':cue,
                'words':[{'w':w.strip(),'cn':CN.get(w.strip(),'')} for w in ws],'accent':acc,'tint':tint})
            uid+=1
miss=sorted({w['w'] for u in UNITS for c in u['cards'] for w in c['words'] if not w['cn']})
json.dump(UNITS,open(OUT_PATH,'w',encoding='utf-8'),ensure_ascii=False)
print("units",len(UNITS),"cards",uid,"missing_cn",len(miss),miss[:20])
