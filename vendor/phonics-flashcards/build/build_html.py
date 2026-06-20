# -*- coding: utf-8 -*-
import base64,json,os
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.dirname(HERE)
UNITS=json.load(open(os.path.join(HERE,'units.json'),encoding='utf-8'))
DATA=json.dumps(UNITS,ensure_ascii=False)
APP=open(os.path.join(HERE,'app.js'),encoding='utf-8').read()

# 媒体注入：
#   audio_map.json -> window.CARD_AUDIO（翻面背景音 MP3，按相对路径引用，文件夹随 HTML 分发）
#   video_map.json -> window.CARD_VIDEO（视频弹窗 MP4，按相对路径引用）
#   words_map.json -> window.WORD_AUDIO（听写单词真人音，体积小，base64 内嵌保持离线）
def _ref_map(map_file, var_name):
    """按相对路径引用（不内嵌；MP3/MP4 太大，须随 HTML 带 audio/ video/ 文件夹）。"""
    path=os.path.join(HERE,map_file)
    if not os.path.exists(path):
        return ''
    m=json.load(open(path,encoding='utf-8'))
    print(f"ref {var_name}: {len(m)} files")
    if not m:
        return ''
    return 'window.'+var_name+'='+json.dumps(m,ensure_ascii=False)+';\n'

def _embed_map(map_file, var_name):
    """base64 内嵌（仅用于小体积的单词音）。"""
    path=os.path.join(HERE,map_file)
    if not os.path.exists(path):
        return ''
    m=json.load(open(path,encoding='utf-8'))
    embed={}
    for key,rel in m.items():
        p=os.path.join(ROOT,rel)
        if os.path.exists(p):
            with open(p,'rb') as f:
                embed[key]='data:audio/mpeg;base64,'+base64.b64encode(f.read()).decode('ascii')
    print(f"embedded {var_name}: {len(embed)} clips")
    if not embed:
        return ''
    return 'window.'+var_name+'='+json.dumps(embed,ensure_ascii=False)+';\n'

AUDIO_JS=( _ref_map('video_map.json','CARD_VIDEO')
         + _ref_map('video_trim_map.json','CARD_VIDEO_TRIM')
         + _embed_map('words_map.json','WORD_AUDIO') )

CSS=r'''
:root{--paper:#F3F5F4;--paper-2:#ECEFEE;--ink:#1B2421;--muted:#6B7B76;--card:#FFFFFF;--line:#E2E7E5;
--shadow:18,36,33;--accent:#15706A;--accent-tint:#E9F2F0;--accent2:#2E6E7E;--surf:#FFFFFF;--maxw:1180px;}
*{box-sizing:border-box} html,body{margin:0}
html{scrollbar-gutter:stable}  /* 预留滚动条宽度，切换内容多少时页面不左右抖动 */
body{background:radial-gradient(120% 80% at 50% -10%,color-mix(in srgb,var(--paper) 55%,#fff) 0%,var(--paper) 55%,var(--paper-2) 100%) fixed;
color:var(--ink);font-family:"Inter","Helvetica Neue",-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
-webkit-font-smoothing:antialiased;line-height:1.5;}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
header{padding:44px 0 16px;text-align:center}
h1{font-size:clamp(30px,4.4vw,46px);margin:0;font-weight:800;letter-spacing:-.02em}
.bar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 82%,transparent);backdrop-filter:saturate(1.4) blur(10px);
border-bottom:1px solid var(--line)}
.bar .wrap{padding:12px 24px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row+.row{margin-top:10px}.spacer{flex:1}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--card)}
.seg button{border:0;background:transparent;color:var(--ink);padding:9px 20px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit}
.seg button.on{background:var(--accent2,#1B2421);color:#fff}
.tog{border:1px solid var(--line);background:var(--card);color:var(--muted);border-radius:999px;padding:8px 15px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.tog.on{background:var(--accent2,#2E6E7E);border-color:var(--accent2,#2E6E7E);color:#fff}
.grp{display:inline-flex;gap:8px}
select#unitSel{flex:0 0 auto;width:300px;max-width:86vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid var(--line);background:var(--card);color:var(--ink);
border-radius:12px;padding:11px 38px 11px 14px;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;
background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7B76' stroke-width='2.5'><path d='M6 9l6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 14px center}
.rbtn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s}
.rbtn[data-v=cr]{--ta:#4E6E66}.rbtn[data-v=rr]{--ta:#6E5A6B}.rbtn[data-v=dr]{--ta:#2E6E7E}
.rbtn:hover{border-color:var(--accent2,var(--ta))}.rbtn.active{background:var(--accent2,var(--ta));border-color:var(--accent2,var(--ta));color:#fff}
.navb{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.navb:hover{border-color:#9fb3ad}
main{padding:38px 0 110px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:18px}
.card{aspect-ratio:3/4;perspective:1100px;cursor:pointer;outline:none}
.card:focus-visible .inner{box-shadow:0 0 0 3px var(--accent2,#2E6E7E)}
.inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.2,.75,.2,1);border-radius:16px}
.card.flipped .inner{transform:rotateY(180deg)}
.face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:16px;overflow:hidden;
display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center}
/* 正面统一白色(不随主题)；背面随主题色，并按 L1–L5 微调深浅；文字保持深色保证可读 */
.front{background:#fff;border:1px solid var(--line);box-shadow:0 1px 2px rgba(18,36,33,.05),0 10px 24px -16px rgba(18,36,33,.4)}
.front .g{font-size:clamp(40px,7vw,60px);font-weight:800;letter-spacing:-.02em;line-height:1.05;color:#1B2421;max-width:100%}
.front .g.sm{font-size:clamp(22px,3.8vw,34px);letter-spacing:0}
.back{transform:rotateY(180deg);background:#fff;border:1px solid var(--accent2,#2E6E7E);justify-content:center;gap:7px;padding:14px 12px}
.card.lv1 .back{background:color-mix(in srgb,var(--accent2,#2E6E7E) 6%,#fff)}
.card.lv2 .back{background:color-mix(in srgb,var(--accent2,#2E6E7E) 9%,#fff)}
.card.lv3 .back{background:color-mix(in srgb,var(--accent2,#2E6E7E) 12%,#fff)}
.card.lv4 .back{background:color-mix(in srgb,var(--accent2,#2E6E7E) 15%,#fff)}
.card.lv5 .back{background:color-mix(in srgb,var(--accent2,#2E6E7E) 18%,#fff)}
.back .ipa{font-size:clamp(27px,4.8vw,42px);font-weight:800;letter-spacing:-.01em;color:#1B2421;line-height:1.05;flex:0 0 auto}
.back .ex{font-size:clamp(18px,3vw,25px);color:#1B2421;font-weight:700;line-height:1.4;width:100%}
.back .ex .exline{margin:1px 0;white-space:nowrap}
.back .ex .cn{color:#6B7B76;font-weight:600;font-size:.78em;margin-left:5px}
.front .exfront{margin-top:9px;font-size:clamp(15px,2.6vw,20px);font-weight:700;color:#1B2421;width:100%;line-height:1.38}
.front .exfront .exline{margin:1px 0;white-space:nowrap}
.front .exfront .cn{color:#6B7B76;font-weight:600;font-size:.8em;margin-left:5px}
.front .g.rd{font-size:clamp(20px,3.4vw,30px);opacity:.78}
.corner{position:absolute;top:10px;right:10px;width:31px;height:31px;border-radius:50%;border:1px solid var(--accent2,#2E6E7E);
background:#fff;color:var(--accent2,#2E6E7E);font-size:19px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:3}
.corner:hover,.corner.on{background:var(--accent2,#2E6E7E);color:#fff}
.corner.left{left:10px;right:auto}
.cardwrap{display:flex;flex-direction:column;gap:9px}
.playicon{align-self:center;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--accent2,#2E6E7E);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 2px rgba(24,36,33,.06);transition:all .2s}
.playicon:hover{background:var(--accent2,#2E6E7E);color:#fff;border-color:var(--accent2,#2E6E7E)}
.playicon:disabled{opacity:.4;cursor:not-allowed}
.mediahost{position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}
.vmodal{position:fixed;inset:0;background:rgba(10,18,16,.82);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
.vbox{position:relative;max-width:92vw;max-height:88vh}
.vbox video{max-width:92vw;max-height:88vh;border-radius:12px;display:block;background:#000}
.vclose{position:absolute;top:-15px;right:-15px;width:38px;height:38px;border-radius:50%;border:0;background:#fff;color:#1B2421;font-size:23px;font-weight:700;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.setmodal{position:fixed;inset:0;background:rgba(10,18,16,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px}
.setmodal[hidden]{display:none}
.setbox{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;width:min(380px,92vw);box-shadow:0 20px 60px -20px rgba(0,0,0,.5)}
.settitle{margin:0 0 12px;font-size:18px;font-weight:800;color:var(--ink)}
.setclose{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:0;background:var(--paper-2);color:var(--ink);font-size:20px;line-height:1;cursor:pointer}
.setrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.setrow>span{font-size:15px;font-weight:700;color:var(--ink)}
.setrow.col{flex-direction:column;align-items:stretch}.setrow.col>span{margin-bottom:10px}
.setrow select{border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:14px;background:var(--card);color:var(--ink)}
.themes{display:flex;gap:14px;flex-wrap:wrap;padding:2px 0}
.th{width:40px;height:40px;border-radius:50%;border:2px solid var(--line);cursor:pointer;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.18)}
.th.on{border-color:var(--ink);box-shadow:0 0 0 3px var(--paper-2),0 0 0 5px var(--ink)}
.switch{position:relative;width:48px;height:27px;border-radius:999px;border:1px solid var(--line);background:var(--paper-2);cursor:pointer;padding:0;flex:0 0 auto;transition:background .2s}
.switch i{position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s}
.switch.on{background:var(--accent2,#2E6E7E);border-color:var(--accent2,#2E6E7E)}.switch.on i{left:23px}
.setabout{margin-top:18px;padding-top:14px;border-top:1px solid var(--line);font-size:12.5px;line-height:1.65;color:var(--muted);text-align:center}
.setabout a{color:var(--accent2,#2E6E7E);text-decoration:none;font-weight:700}
.th-by{background:linear-gradient(135deg,#1E6FD9,#5BC0FF)}.th-bo{background:linear-gradient(135deg,#274060,#13b6ad)}
.th-gy{background:linear-gradient(135deg,#D14A82,#E89B86)}.th-go{background:linear-gradient(135deg,#A98BE8,#9BE8D2)}
.th-cl{background:linear-gradient(135deg,#15706A,#E9F2F0)}
:root[data-theme="boy-young"]{--paper:#EAF3FF;--paper-2:#D7E9FF;--ink:#13314E;--muted:#5B7794;--card:#FFFFFF;--line:#CFE0F5;--accent2:#1E6FD9;--surf:#F1F7FF}
:root[data-theme="boy-old"]{--paper:#EAEEF4;--paper-2:#DAE2EC;--ink:#1E2A3A;--muted:#5E6E84;--card:#FFFFFF;--line:#CDD7E4;--accent2:#0E8C8C;--surf:#F2F6FA}
:root[data-theme="girl-young"]{--paper:#F6DBE6;--paper-2:#EDC6D7;--ink:#54283F;--muted:#946079;--card:#FFFFFF;--line:#E6BACE;--accent2:#CF477F;--surf:#FBEEF3}
:root[data-theme="girl-old"]{--paper:#F4EFFF;--paper-2:#E8DEFB;--ink:#3A2E58;--muted:#7E6FA3;--card:#FFFFFF;--line:#DED2F4;--accent2:#7E5CD0;--surf:#F8F3FF}
.speed{font-size:13px;color:var(--muted);font-weight:700;display:flex;align-items:center;gap:6px}
.speed select{border:1px solid var(--line);border-radius:8px;padding:7px 8px;font-family:inherit;font-size:13px;background:var(--card)}
.empty{grid-column:1/-1;color:var(--muted);font-size:15px;padding:30px 4px}
.dbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.play{border:1px solid var(--accent2,#2E6E7E);background:var(--accent2,#2E6E7E);color:#fff;border-radius:999px;padding:10px 20px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
.dbtn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:10px 15px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
.dbtn.on{background:var(--accent2,#2E6E7E);border-color:var(--accent2,#2E6E7E);color:#fff}
.dspacer{flex:1}
.dprog{font-size:14px;font-weight:700;color:var(--muted);min-width:54px}
.psel{font-size:13px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px}
.psel select{border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-family:inherit;font-size:13px;background:var(--card)}
.wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:14px;margin-bottom:56px}
.wcard{position:relative;aspect-ratio:4/3;background:var(--surf,#fff);border:1px solid var(--line);border-radius:16px;display:flex;flex-direction:column;
align-items:center;justify-content:center;padding:14px;text-align:center;cursor:pointer;box-shadow:0 1px 2px rgba(24,36,33,.05),0 10px 24px -16px rgba(24,36,33,.4);transition:box-shadow .2s,border-color .2s}
.wcard:hover{border-color:var(--accent2,#9fb3ad)}.wcard.active{border-color:var(--accent2,#2E6E7E);box-shadow:0 0 0 2px var(--accent2,#2E6E7E)}
.wmain{font-size:clamp(23px,3.8vw,32px);font-weight:800;color:var(--ink);line-height:1.1}
.wmain.ph{color:#CBD3D0;font-size:34px}
.eye{border:0;background:transparent;color:#9fb3ad;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center}
.eye:hover{color:var(--accent2,#2E6E7E)}
.wcn{margin-top:8px;font-size:15px;color:var(--muted);font-weight:600}
@media (prefers-reduced-motion:reduce){.inner{transition:none}}
@media (max-width:520px){header{padding:32px 0 12px}.grid,.wgrid{grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:12px}}
'''

CHROME='''<header><div class="wrap"><h1>小善自拼闪卡</h1></div></header>
<nav class="bar"><div class="wrap">
 <div class="row">
   <div class="seg"><button data-m="card" class="on" type="button">闪卡</button><button data-m="read" type="button">见词能读</button><button data-m="dict" type="button">听音能写</button></div>
   <span id="revBtns" class="grp">
     <button class="rbtn" data-v="cr" data-mode="card" type="button">闪卡-Review</button>
     <button class="rbtn" data-v="rr" data-mode="read" type="button">见词-Review</button>
     <button class="rbtn" data-v="dr" data-mode="dict" type="button">听音-Review</button>
   </span>
   <div class="spacer"></div>
   <button id="setBtn" class="tog" type="button" title="设置">⚙ 设置</button>
 </div>
 <div class="row">
   <select id="unitSel" aria-label="选择单元"></select>
   <button id="prevBtn" class="navb" type="button">‹ 上一页</button>
   <button id="nextBtn" class="navb" type="button">下一页 ›</button>
 </div>
</div></nav>
<main class="wrap"><div id="content"></div></main>
<div id="setModal" class="setmodal" hidden><div class="setbox">
  <button class="setclose" type="button" aria-label="关闭">×</button>
  <h3 class="settitle">设置</h3>
  <div class="setrow"><span>速度</span>
    <select id="speedSel"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></div>
  <div class="setrow"><span>去视频停顿</span><button id="trimTog" class="switch" type="button" role="switch" title="视频去掉所有停顿，只看有声片段"><i></i></button></div>
  <div class="setrow"><span>中文释义</span><button id="cnTog" class="switch" type="button" role="switch"><i></i></button></div>
  <div class="setrow col"><span>主题</span>
    <div id="themePick" class="themes">
      <button type="button" data-theme="boy-young" class="th th-by" title="活力男孩"></button>
      <button type="button" data-theme="boy-old" class="th th-bo" title="酷玩男生"></button>
      <button type="button" data-theme="girl-young" class="th th-gy" title="甜心女孩"></button>
      <button type="button" data-theme="girl-old" class="th th-go" title="清雅女生"></button>
      <button type="button" data-theme="classic" class="th th-cl" title="经典"></button>
    </div>
  </div>
  <div class="setabout">需求 / BUG 联系微信：<b>friendvip</b></div>
</div></div>'''

HTML=('<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
 '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>小善自拼闪卡</title>\n'
 '<style>'+CSS+'</style>\n</head>\n<body>\n'+CHROME+'\n'
 '<script>\n'+AUDIO_JS+'const UNITS='+DATA+';\n'+APP+'\n</script>\n</body>\n</html>\n')
# 版本化输出：每次生成一个新版本号文件(_v1/_v2/…)，保留旧版做备份。
# 版本号 = 现有 _vN 文件里的最大 N + 1（不带号的旧文件当作起点，不覆盖）。
import re as _re
def _next_version(outdir):
    mx=0
    for f in os.listdir(outdir):
        m=_re.match(r'小善自拼闪卡_v(\d+)\.html$',f)
        if m:
            mx=max(mx,int(m.group(1)))
    return mx+1
_ver=_next_version(ROOT)
_outname='小善自拼闪卡_v%d.html'%_ver
open(os.path.join(ROOT,_outname),'w',encoding='utf-8').write(HTML)
print("wrote %s (%d chars)"%(_outname,len(HTML)))
