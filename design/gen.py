# -*- coding: utf-8 -*-
import io

CHK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5cd38a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"></path></svg>'
def bchips(*ts):
    return ''.join('<div class="bchip">%s%s</div>' % (CHK, t) for t in ts)

SPARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"></path></svg>'
EXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M14 4h6v6"></path><path d="M20 4 10 14"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path></svg>'
BTN_TAILOR = '<button class="btn btn-p">%sTailor &amp; Apply</button>' % SPARK
BTN_OPEN = '<button class="btn btn-g">%sOpen posting</button>' % EXT

ICONS = {
 'loc': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle>',
 'type': '<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M9 7V5h6v2"></path>',
 'sal': '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4" stroke-linecap="round"></path>',
 'model': '<path d="M4 20V9l8-5 8 5v11"></path><path d="M9 20v-6h6v6"></path>',
 'sen': '<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4 6.7 19.2l1.1-5.9L3.5 9.2l5.9-.8z" stroke-linejoin="round"></path>',
 'yrs': '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2" stroke-linecap="round"></path>',
}
def mi(kind, txt):
    return ('<div class="mi"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" '
            'stroke="currentColor" stroke-width="1.8">%s</svg>%s</div>') % (ICONS[kind], txt)

def card(logobg, logotxt, ago, title, company, industry, loc, jtype, sal, model, sen, yrs,
         why, applicants, fit, rank, ringcol, exp, skl, ind, chips, action,
         ats='', sel='', cardst='', extratag=''):
    dash = round(188.5 * (1 - fit / 100.0), 1)
    return '''<div class="card" style="%(cardst)s">%(sel)s
  <div class="cbody">
    <div class="chead">
      <div class="logo" style="background:%(logobg)s">%(logotxt)s</div>
      <div style="min-width:0;flex:1">
        <div class="mrow">%(ago)s <span class="tag new">Early applicant</span>%(extratag)s</div>
        <h3 class="jt">%(title)s</h3>
        <div class="co"><b>%(company)s</b> &middot; %(industry)s</div>
      </div>
    </div>
    <div class="meta">%(meta)s</div>
    <div class="why">
      <div class="lbl">Why this is a match</div>
      <p>%(why)s</p>
    </div>
    <div class="cfoot">
      <span class="app-cnt">%(applicants)s</span>%(ats)s
      <div class="grow"></div>
      <div class="ibtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"></circle><path d="m6 6 12 12"></path></svg></div>
      <div class="ibtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7c0 4.9-7 9.3-7 9.3z"></path></svg></div>
      %(action)s
    </div>
  </div>
  <div class="score">
    <div class="ring">
      <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" fill="none" stroke="#2e343b" stroke-width="7"></circle><circle cx="36" cy="36" r="30" fill="none" stroke="%(ringcol)s" stroke-width="7" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="%(dash)s"></circle></svg>
      <div class="rv">%(fit)s%%</div>
    </div>
    <div class="rank" style="color:%(ringcol)s">%(rank)s</div>
    <div class="brk">
      <div class="brow"><span>Experience</span><i class="bar"><i style="width:%(exp)s%%;background:#5cd38a"></i></i><em>%(exp)s%%</em></div>
      <div class="brow"><span>Skills</span><i class="bar"><i style="width:%(skl)s%%;background:#5cd38a"></i></i><em>%(skl)s%%</em></div>
      <div class="brow"><span>Industry</span><i class="bar"><i style="width:%(ind)s%%;background:%(indcol)s"></i></i><em>%(ind)s%%</em></div>
    </div>
    <div class="bchips">%(chips)s</div>
  </div>
</div>''' % dict(
        cardst=cardst, sel=sel, logobg=logobg, logotxt=logotxt, ago=ago, extratag=extratag,
        title=title, company=company, industry=industry,
        meta=mi('loc', loc) + mi('type', jtype) + mi('sal', sal) + mi('model', model) + mi('sen', sen) + mi('yrs', yrs),
        why=why, applicants=applicants, ats=ats, action=action, ringcol=ringcol, dash=dash, rank=rank,
        fit=fit, exp=exp, skl=skl, ind=ind, indcol='#f0b23c' if ind < 60 else '#5cd38a', chips=chips)

BILT = dict(logobg='#1f3d2b', logotxt='B', ago='4 hours ago', title='Senior Full Stack Engineer',
  company='Bilt', industry='Finance &middot; FinTech &middot; Growth Stage', loc='New York, NY',
  jtype='Full-time', sal='$175K &ndash; $250K', model='Onsite', sen='Senior Level', yrs='6+ years exp',
  why='Owns projects end-to-end and architects scalable web applications serving millions of members. Backend in Node.js (NestJS, Hono, Express), frontend in Next.js, React and React Native, with PostgreSQL schema design and observability practices.',
  applicants='&lt; 25 applicants', fit=87, rank='STRONG MATCH', ringcol='#5cd38a', exp=94, skl=100, ind=39,
  chips=bchips('H1B Sponsor Likely', 'Unicorn, $10.8B val.', 'Top Investors'), action=BTN_TAILOR)

GAMMA = dict(logobg='#0e2f4a', logotxt='G', ago='1 day ago', title='Software Engineer, Full Stack',
  company='Gamma', industry='Artificial Intelligence &middot; Growth Stage', loc='San Francisco, CA',
  jtype='Full-time', sal='$180K &ndash; $310K', model='Hybrid', sen='Mid Level', yrs='3+ years exp',
  why='Design and implement AI features that integrate into the product surface, working directly with product, design and engineering. Emphasis on shipping end-user-facing model interactions rather than infrastructure.',
  applicants='&lt; 25 applicants', fit=88, rank='STRONG MATCH', ringcol='#5cd38a', exp=100, skl=64, ind=81,
  chips=bchips('H1B Sponsor Likely', 'Unicorn, $2.1B val.', 'Top Investors'),
  ats='<span class="ats">ATS 74</span>', action=BTN_OPEN)

NOURISH = dict(logobg='#3a2340', logotxt='N', ago='9 hours ago', title='Senior Full Stack Engineer',
  company='Nourish', industry='Artificial Intelligence &middot; Apps &middot; Growth Stage', loc='United States',
  jtype='Full-time', sal='Not disclosed', model='Remote', sen='Senior Level', yrs='5+ years exp',
  why='Shape the core platform of a fast-growing health product, driving development of critical features and owning the long-term health of the codebase.',
  applicants='&lt; 25 applicants', fit=89, rank='STRONG MATCH', ringcol='#5cd38a', exp=100, skl=100, ind=42,
  chips=bchips('H1B Sponsor Likely', 'Unicorn, $1.8B val.'), action=BTN_TAILOR)

def w(name, body):
    io.open('parts/%s.body.html' % name, 'w', encoding='utf-8').write(body)
    print('gen', name)

w('Main', '''<div class="app">
<!--INCLUDE rail JOBS="on"-->
  <div class="main">
<!--INCLUDE top REC="on"-->
<!--INCLUDE filters-->
    <div class="feed">
%s
%s
%s
    </div>
  </div>
</div>
''' % (card(**BILT), card(**GAMMA), card(**NOURISH)))

# ---------- shared small pieces ----------
def minicard(logobg, logotxt, title, company, loc, sal, fit, ago, ats='', on=False, check=None):
    dash = round(113.1 * (1 - fit / 100.0), 1)  # r=18 -> 113.1
    box = ''
    if check is not None:
        box = ('<div class="cbox%s">%s</div>' %
               (' on' if check else '',
                '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"></path></svg>' if check else ''))
    return '''<div class="mini%(on)s">%(box)s
  <div class="logo" style="background:%(logobg)s;width:36px;height:36px;border-radius:9px;font-size:14px">%(logotxt)s</div>
  <div style="min-width:0;flex:1">
    <div class="mrow" style="margin-bottom:2px">%(ago)s</div>
    <div style="font-size:14px;font-weight:600;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">%(title)s</div>
    <div class="co" style="margin-top:2px">%(company)s &middot; %(loc)s</div>
    <div class="co" style="margin-top:3px;color:#57524b">%(sal)s</div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
    <div style="position:relative;width:44px;height:44px">
      <svg viewBox="0 0 44 44" style="width:100%%;height:100%%;transform:rotate(-90deg)"><circle cx="22" cy="22" r="18" fill="none" stroke="#e6e1da" stroke-width="4"></circle><circle cx="22" cy="22" r="18" fill="none" stroke="#2f8a4f" stroke-width="4" stroke-linecap="round" stroke-dasharray="113.1" stroke-dashoffset="%(dash)s"></circle></svg>
      <div style="position:absolute;inset:0;display:grid;place-items:center;font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:600">%(fit)s</div>
    </div>%(ats)s
  </div>
</div>''' % dict(on=' on' if on else '', box=box, logobg=logobg, logotxt=logotxt, ago=ago,
                 title=title, company=company, loc=loc, sal=sal, fit=fit, dash=dash,
                 ats=('<span class="ats" style="font-size:10px;padding:2px 7px">%s</span>' % ats) if ats else '')

MINIS = [
  dict(logobg='#1f3d2b', logotxt='B', title='Senior Full Stack Engineer', company='Bilt', loc='New York, NY', sal='$175K &ndash; $250K', fit=87, ago='4 hours ago'),
  dict(logobg='#0e2f4a', logotxt='G', title='Software Engineer, Full Stack', company='Gamma', loc='San Francisco, CA', sal='$180K &ndash; $310K', fit=88, ago='1 day ago', ats='ATS 74'),
  dict(logobg='#3a2340', logotxt='N', title='Senior Full Stack Engineer', company='Nourish', loc='United States', sal='Not disclosed', fit=89, ago='9 hours ago'),
  dict(logobg='#2b3550', logotxt='J', title='Software Engineer III &ndash; Full Stack', company='JPMorganChase', loc='Jersey City, NJ', sal='$138K &ndash; $185K', fit=92, ago='5 hours ago'),
  dict(logobg='#123b33', logotxt='C', title='Senior Software Engineer, Air AI', company='Commure', loc='San Francisco, CA', sal='$170K &ndash; $230K', fit=93, ago='21 hours ago'),
  dict(logobg='#4a2b1f', logotxt='K', title='Senior Full Stack Engineer, AI', company='Kiddom', loc='San Francisco, CA', sal='$180K &ndash; $230K', fit=82, ago='9 hours ago'),
]

def bullet(t):
    return '<li>%s</li>' % t

def skilltag(t, have=True):
    return '<span class="sk%s">%s</span>' % ('' if have else ' no', t)

# ---------- 2. Detail ----------
detail_pane = '''<div class="pane">
  <div class="phead">
    <div class="logo" style="background:#1f3d2b;width:40px;height:40px;border-radius:10px;font-size:16px">B</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:16px;font-weight:600;letter-spacing:-.2px">Senior Full Stack Engineer</div>
      <div class="co" style="margin-top:2px"><b>Bilt</b> &middot; New York, NY &middot; Onsite &middot; $175K &ndash; $250K</div>
    </div>
    <button class="btn btn-p">%s Tailor &amp; Apply</button>
    <div class="ibtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"></path></svg></div>
  </div>
  <div class="ptabs"><div class="pt on">Overview</div><div class="pt">Company</div></div>
  <div class="pbody">
    <div class="fitbox">
      <div class="ring" style="width:76px;height:76px">
        <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" fill="none" stroke="#2e343b" stroke-width="7"></circle><circle cx="36" cy="36" r="30" fill="none" stroke="#5cd38a" stroke-width="7" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="24.5"></circle></svg>
        <div class="rv" style="font-size:19px">87%%</div>
      </div>
      <div style="flex:1">
        <div class="rank" style="color:#5cd38a;margin-bottom:9px">STRONG MATCH &middot; JOBRIGHT FIT</div>
        <div class="brk">
          <div class="brow"><span>Experience level</span><i class="bar" style="width:120px"><i style="width:94%%;background:#5cd38a"></i></i><em>94%%</em></div>
          <div class="brow"><span>Skills</span><i class="bar" style="width:120px"><i style="width:100%%;background:#5cd38a"></i></i><em>100%%</em></div>
          <div class="brow"><span>Industry experience</span><i class="bar" style="width:120px"><i style="width:39%%;background:#f0b23c"></i></i><em>39%%</em></div>
        </div>
      </div>
    </div>
    <div class="sec">
      <h4>Responsibilities</h4>
      <ul class="bl">%s</ul>
    </div>
    <div class="sec">
      <h4>Qualification <span class="hint">tags matched against your primary resume</span></h4>
      <div class="sks">%s</div>
      <div class="subh">Required</div>
      <ul class="bl">%s</ul>
      <div class="subh">Preferred</div>
      <ul class="bl">%s</ul>
    </div>
    <div class="sec">
      <h4>Benefits</h4>
      <ul class="bl">%s</ul>
    </div>
  </div>
</div>''' % (
  SPARK,
  ''.join(bullet(t) for t in [
    'Own projects end-to-end &mdash; from technical scoping and architecture through deployment and production support',
    'Architect and build scalable web applications and services that serve millions of members',
    'Develop and maintain backend services using Node.js frameworks (NestJS, Hono, Express)',
    'Build performant frontend experiences using Next.js, React and React Native',
    'Work with PostgreSQL to design schemas, optimize queries and ensure data integrity',
    'Implement observability practices including structured logging, distributed tracing and monitoring',
  ]),
  ''.join([skilltag(t) for t in ['React','TypeScript','JavaScript','Node.js','NestJS','Express','Next.js','React Native','PostgreSQL','RESTful APIs','Git','CI/CD']] +
          [skilltag(t, False) for t in ['Hono','Redux','Design Systems']]),
  ''.join(bullet(t) for t in [
    '6+ years of professional software development experience',
    'Strong proficiency in React, TypeScript and modern JavaScript',
    'Hands-on Node.js backend development with NestJS, Express or Hono',
    'Understanding of observability fundamentals: logging, tracing, metrics, alerting',
  ]),
  ''.join(bullet(t) for t in ['Relational data modeling and query optimization (PostgreSQL preferred)']),
  ''.join(bullet(t) for t in ['Equity and performance bonus program', 'Health insurance from day one', '401k with match', 'Unlimited PTO']),
)

w('Detail', '''<div class="app">
<!--INCLUDE rail JOBS="on"-->
  <div class="main">
<!--INCLUDE top REC="on"-->
<!--INCLUDE filters-->
    <div style="flex:1;display:flex;min-height:0">
      <div class="narrowfeed">
%s
      </div>
%s
    </div>
  </div>
</div>
''' % ('\n'.join(minicard(on=(i == 0), **m) for i, m in enumerate(MINIS)), detail_pane))

# ---------- 3. Bulk select ----------
CHECK_W = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"></path></svg>'
def sel(on):
    return '<div class="selstrip%s"><div class="cbox%s">%s</div></div>' % (
        ' on' if on else '', ' on' if on else '', CHECK_W if on else '')

b1 = dict(BILT); b1['sel'] = sel(True); b1['cardst'] = 'border-color:#0f6d7a;box-shadow:0 0 0 1px #0f6d7a'
b2 = dict(GAMMA); b2['sel'] = sel(True); b2['cardst'] = 'border-color:#0f6d7a;box-shadow:0 0 0 1px #0f6d7a'
b3 = dict(NOURISH); b3['sel'] = sel(False)

bulkbar = '''<div class="bulkbar">
  <div class="cbox on">%s</div>
  <b>12 selected</b>
  <span class="sep"></span>
  <span style="color:#9aa2ab">Tailor with</span>
  <div class="pick">Sri_Ram_master <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"></path></svg></div>
  <button class="btn btn-p">%sTailor 12 jobs</button>
  <span class="sep"></span>
  <div class="bghost">Like</div>
  <div class="bghost">Ignore</div>
  <div class="grow"></div>
  <div class="bghost">Clear <span class="kbd" style="background:#2b3138;border-color:#3a424b;color:#9aa2ab;margin-left:5px">esc</span></div>
</div>''' % (CHECK_W, SPARK)

w('BulkSelect', '''<div class="app">
<!--INCLUDE rail JOBS="on"-->
  <div class="main">
<!--INCLUDE top REC="on"-->
<!--INCLUDE filters-->
    <div class="feed" style="padding-bottom:8px">
%s
%s
%s
    </div>
%s
  </div>
</div>
''' % (card(**b1), card(**b2), card(**b3), bulkbar))

# ---------- 4. Queue drawer ----------
def qrow(company, role, status, tone, note='', bar=None, err=''):
    barhtml = ''
    if bar is not None:
        barhtml = '<div class="qbar"><i style="width:%s%%"></i></div>' % bar
    errhtml = ''
    if err:
        errhtml = ('<div class="qerr">%s<div class="retry">Retry</div></div>' % err)
    return '''<div class="qrow">
  <div class="qdot %(tone)s"></div>
  <div style="flex:1;min-width:0">
    <div style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">%(role)s</div>
    <div class="co" style="margin-top:2px">%(company)s</div>
    %(bar)s%(err)s
  </div>
  <div class="qst %(tone)s">%(status)s</div>
</div>''' % dict(tone=tone, role=role, company=company, status=status, bar=barhtml, err=errhtml)

drawer = '''<div class="scrim"></div>
<div class="drawer">
  <div class="dhead">
    <b style="font-size:14px">Queue</b>
    <span class="cnt" style="font-family:'IBM Plex Mono',monospace">7</span>
    <div class="grow"></div>
    <span style="font-size:11px;color:#9c958b">3 at a time</span>
    <div class="ibtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"></path></svg></div>
  </div>
  <div class="dbody">
    <div class="dlbl">Running</div>
%s
    <div class="dlbl">Waiting</div>
%s
    <div class="dlbl">Finished &middot; this session</div>
%s
  </div>
  <div class="dfoot">
    <div class="bghost" style="background:#fff;border:1px solid #e6e1da;color:#1c1a17">Clear finished</div>
    <div class="grow"></div>
    <span style="font-size:11px;color:#9c958b">2 failed &middot; tailored from summary</span>
  </div>
</div>''' % (
  qrow('Commure', 'Senior Software Engineer, Air AI', 'Tailoring', 'run', bar=62) +
  qrow('JPMorganChase', 'Software Engineer III &ndash; Full Stack', 'Scoring', 'run', bar=88) +
  qrow('Kiddom', 'Senior Full Stack Engineer, AI', 'Fetching', 'run', bar=18),
  qrow('Humana', 'Senior Full-Stack Engineer', 'Queued', 'wait') +
  qrow('Blink', 'Full Stack Engineer', 'Queued', 'wait'),
  qrow('Gamma', 'Software Engineer, Full Stack', 'ATS 74', 'done') +
  qrow('Fiserv', 'Full Stack Developer', 'Summary only', 'warn',
       err='Posting page needed JavaScript &mdash; tailored from the JobRight summary.'),
)

w('QueueDrawer', '''<div class="app">
<!--INCLUDE rail JOBS="on"-->
  <div class="main">
<!--INCLUDE top REC="on"-->
<!--INCLUDE filters-->
    <div style="position:relative;flex:1;display:flex;min-height:0;overflow:hidden">
      <div class="feed" style="flex:1">
%s
%s
      </div>
%s
    </div>
  </div>
</div>
''' % (card(**BILT), card(**GAMMA), drawer))

# ---------- 5. Kanban ----------
def kcard(company, role, date, fit, ats=None, dim=False):
    chips = '<span class="kfit">Fit %s</span>' % fit
    if ats is not None:
        chips += '<span class="kats">ATS %s</span>' % ats
    else:
        chips += '<span class="knone">no ATS</span>'
    return '''<div class="kcard%s">
  <div class="kco">%s</div>
  <div class="krole">%s</div>
  <div class="kfoot">%s<span class="kdate">%s</span></div>
</div>''' % (' dim' if dim else '', company, role, chips, date)

def kcol(title, count, cards, accent='#6f6a63'):
    return '''<div class="kcol">
  <div class="khead"><span class="kdot" style="background:%s"></span>%s<span class="kcnt">%s</span></div>
  <div class="kbody">%s</div>
</div>''' % (accent, title, count, cards)

kanban = '''<div class="ktool">
  <div class="search" style="width:270px">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
    <input value="postgres" placeholder="Search company, role, notes, JD">
    <span class="kbd">&#8984;K</span>
  </div>
  <div class="fchip set">Fit &ge; 85 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"></path></svg></div>
  <div class="fchip">ATS any <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"></path></svg></div>
  <div class="fchip">Source: all <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"></path></svg></div>
  <div class="grow"></div>
  <span style="font-size:11.5px;color:#9c958b">Showing <b style="color:#413c36;font-weight:600">41</b> of 301 &middot; filtered by &ldquo;postgres&rdquo;</span>
</div>
<div class="board">
%s
</div>''' % '\n'.join([
  kcol('Tailored', 85, kcard('Bilt', 'Senior Full Stack Engineer', 'Today', 87, 79) +
       kcard('Nourish', 'Senior Full Stack Engineer', 'Today', 89, 83) +
       kcard('Commure', 'Senior Software Engineer, Air AI', 'Yesterday', 93, 71) +
       kcard('Kiddom', 'Senior Full Stack Engineer, AI', 'Yesterday', 82, 68), '#0f6d7a'),
  kcol('Applied', 204, kcard('Gamma', 'Software Engineer, Full Stack', 'Sep 9', 88, 74) +
       kcard('JPMorganChase', 'Software Engineer III', 'Sep 8', 92, 77) +
       kcard('Humana', 'Senior Full-Stack Engineer', 'Sep 8', 80, None) +
       kcard('Pure (YC S23)', 'Full Stack Software Engineer', 'Nov 6, 2025', 76, None, dim=True), '#2f6f8a'),
  kcol('Interviewing', 1, kcard('Blink', 'Full Stack Engineer', 'Sep 4', 95, 81), '#7a5cc4'),
  kcol('Offer', 0, '<div class="kempty">Nothing here yet</div>', '#2f8a4f'),
  kcol('Rejected', 7, kcard('Oakmont Consulting', 'Full Stack Engineer', 'Aug 21', 68, None, dim=True) +
       kcard('Meridian', 'Founding Backend Engineer', 'Aug 2', 71, None, dim=True), '#b3402f'),
  kcol('Archived', 4, kcard('Micron', 'Full Stack Developer', 'Jul 30', 64, None, dim=True), '#9c958b'),
])

w('Kanban', '''<div class="app">
<!--INCLUDE rail JOBS="on"-->
  <div class="main">
<!--INCLUDE top APP="on"-->
%s
  </div>
</div>
''' % kanban)

# ---------- 6. Resume library ----------
def rrow(name, primary, target, mod, created, analysing=False):
    star = ('<span class="prim"><svg width="10" height="10" viewBox="0 0 24 24" fill="#0f6d7a" stroke="none">'
            '<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4 6.7 19.2l1.1-5.9L3.5 9.2l5.9-.8z"></path></svg>PRIMARY</span>') if primary else ''
    return '''<tr>
  <td><div class="rname">%s%s</div></td>
  <td class="dim">%s</td>
  <td class="dim mono">%s</td>
  <td class="dim mono">%s</td>
  <td style="text-align:right"><div class="ibtn" style="margin-left:auto;width:28px;height:28px"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle></svg></div></td>
</tr>''' % (name, star, target or '<span style="color:#c3bcb2">&mdash;</span>', mod, created)

resume = '''<div class="screen">
  <div class="shead">
    <div>
      <h2>Resume</h2>
      <p class="sub">Tailoring always starts from your primary resume. Jobright scores your fit from the copy it holds.</p>
    </div>
    <div class="grow"></div>
    <button class="btn btn-g"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"></path><path d="M20 4v4h-4"></path><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"></path><path d="M4 20v-4h4"></path></svg>Sync to Jobright</button>
    <button class="btn btn-p"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add resume</button>
  </div>
  <div class="notice">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b8762a" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16.5v.01"></path></svg>
    <div><b>Your primary resume is 4 edits ahead of Jobright.</b> Fit scores in the feed are still computed from the copy synced 5 days ago.</div>
    <div class="grow"></div>
    <div class="lnk">Sync now</div>
  </div>
  <div class="tblwrap">
    <table class="tbl">
      <thead><tr><th>Resume</th><th>Target job title</th><th>Last modified</th><th>Created</th><th></th></tr></thead>
      <tbody>
%s
      </tbody>
    </table>
  </div>
</div>''' % '\n'.join([
  rrow('Sri_Ram_Mohan_Nyshadham_master', True, '', '5 days ago', '5 days ago'),
  rrow('Sriram_Senior_Full_Stack_Engineer', False, 'Senior Full Stack Engineer', '3 months ago', '3 months ago'),
  rrow('Sri_Ram_Nyshadham_Senior_Full_Stack', False, '', '6 months ago', '6 months ago'),
  rrow('Sriram_Full_Stack_AI_ML_Developer', False, 'AI / ML Engineer', '6 months ago', '9 months ago'),
  rrow('Sriram-Resume', False, 'Full Stack Developer', 'a year ago', 'a year ago'),
])

w('ResumeLibrary', '''<div class="app">
<!--INCLUDE rail RESUME="on"-->
  <div class="main">
%s
  </div>
</div>
''' % resume)

# ---------- 7. Settings ----------
def field(label, control, hint=''):
    h = '<div class="fhint">%s</div>' % hint if hint else ''
    return '<div class="f"><label>%s</label>%s%s</div>' % (label, control, h)

def inp(val, mono=False, w='100%'):
    return '<div class="inp%s" style="width:%s">%s</div>' % (' mono' if mono else '', w, val)

def selectbox(val, w='100%'):
    return ('<div class="inp sel" style="width:%s">%s<svg width="12" height="12" viewBox="0 0 24 24" fill="none" '
            'stroke="#9c958b" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"></path></svg></div>') % (w, val)

def toggle(label, on, hint=''):
    h = '<div class="fhint" style="margin-top:3px">%s</div>' % hint if hint else ''
    return '''<div class="tg">
  <div class="sw%s"><i></i></div>
  <div><div class="tglbl">%s</div>%s</div>
</div>''' % (' on' if on else '', label, h)

def chiplist(items, dashed=False):
    return '<div class="cl">%s%s</div>' % (
        ''.join('<span class="clc">%s<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"></path></svg></span>' % i for i in items),
        '<span class="clc add">+ add</span>')

settings = '''<div class="screen">
  <div class="shead">
    <div>
      <h2>Settings</h2>
      <p class="sub">Connections, job sources, and the filter that decides what reaches your feed.</p>
    </div>
  </div>
  <div class="cols">
    <div class="colL">
      <div class="pnl">
        <div class="pnlh">Connections</div>
        <div class="pnlb">
          <div class="conn">
            <div class="cdot ok"></div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">Jobright</div>
              <div class="fhint">Signed in as nyshadhamramu@gmail.com &middot; session refreshed 2 hours ago</div>
            </div>
            <div class="bghost" style="background:#fff;border:1px solid #e6e1da;color:#1c1a17">Reconnect</div>
          </div>
          <div class="conn">
            <div class="cdot warn"></div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">Dice via Apify</div>
              <div class="fhint">Pay-per-result. Used only from the External tab.</div>
            </div>
          </div>
          %s
        </div>
      </div>
      <div class="pnl">
        <div class="pnlh">Tailoring</div>
        <div class="pnlb">
          %s
          %s
          %s
        </div>
      </div>
    </div>
    <div class="colR">
      <div class="pnl">
        <div class="pnlh">Feed filter <span class="pnlhint">written to Jobright as a saved filter</span></div>
        <div class="pnlb">
          <div class="grid2">
            %s
            %s
          </div>
          <div class="tgs">
            %s
            %s
            %s
            %s
          </div>
          <div class="grid2">
            %s
            %s
          </div>
          %s
          %s
          <div class="split">
            <div class="splbl">Applied locally <span class="fhint">Jobright cannot express these</span></div>
            <div class="grid2" style="margin-top:10px">
              %s
              %s
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>''' % (
  field('Apify API token', inp('apify_api_&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;7Kq2', mono=True)),
  field('Model', selectbox('Claude Opus 5'), 'Runs through your Claude Code subscription. Two calls per job: tailor, then keyword gap.'),
  field('Jobs tailored at once', selectbox('3', w='110px'), 'Higher is faster but queues more CLI calls in parallel.'),
  toggle('Warn before tailoring more than 25 at once', True),
  field('Minimum salary', inp('$150,000', mono=True)),
  field('Posted within', selectbox('7 days')),
  toggle('H1B sponsors only', True),
  toggle('Exclude staffing agencies', True),
  toggle('Exclude roles requiring security clearance', True),
  toggle('Exclude US-citizen-only roles', True),
  field('Seniority', selectbox('Mid, Senior')),
  field('Work model', selectbox('Remote, Hybrid')),
  field('Excluded titles', chiplist(['Java', '.NET', 'DevOps', 'SRE', 'Data Engineer', 'Junior', 'Intern', 'New Grad'])),
  field('Excluded companies', chiplist(['Cognizant', 'Infosys', 'TCS'])),
  field('Minimum Jobright fit', inp('75', mono=True, w='110px')),
  field('Location rule', selectbox('Remote, or GA / TX')),
)

w('Settings', '''<div class="app">
<!--INCLUDE rail SETTINGS="on"-->
  <div class="main">
%s
  </div>
</div>
''' % settings)
