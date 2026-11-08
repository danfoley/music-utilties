'use strict';
(()=>{
  const $ = s => document.querySelector(s);
  const APP_VERSION='0.7.0', SCHEMA_VERSION=2, generatorStorageKey='jcs-v05-generators', selectedStorageKey='jcs-v05-selected-generator';
  const definitionFallback={"schemaVersion":2,"id":"random-dominant-sevenths","name":"Random Dominant Sevenths","title":"Random Dominant Sevenths — 32 Bars","key":"C","style":"Medium Swing","timeSignature":"4/4","bars":32,"barsPerLine":4,"barsPerSelection":2,"strategy":{"type":"shuffle","chords":["A7","D7","G7","C7","F7","Bb7","Eb7","Ab7","C#7","F#7","B7","E7","Db7"],"repeatDistinctChordCount":3,"maxSelectionsPerChord":2,"requireAllChords":true,"forbidAdjacentSelectionsOfSameChord":true},"playlist":{"titleTemplate":"{name} {number}","minCharts":2,"maxCharts":50},"validation":{"requireAllChords":true,"forbidAdjacentSelectionsOfSameChord":true}};
  let def=definitionFallback,chart=null,batch=[],mode="chart",genuine=null,definitionSource='embedded fallback';
  const storageKey='jazz-chart-studio-v05-batches';
  let registry={},builtinIds=new Set(['random-dominant-sevenths','circle-dominant-sevenths']);
  const PITCH={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
  const isCycle=d=>d.strategy?.type==='cycle';
  const optionValue=x=>typeof x==='string'?x:x.value;
  const controls=d=>d.controls||{};
  const startControl=d=>controls(d).startingRoot;
  const directionControl=d=>controls(d).direction;
  const randomControl=d=>controls(d).randomPlaylistStarts;
  const circleStart=()=>$('#starting-key').value;
  const circleDirection=()=>$('#circle-direction').value;
  const randomStart=d=>{const opts=startControl(d).options.map(optionValue);return opts[Math.floor(Math.random()*opts.length)];};
  function generatorCheck(input){
    const d=JSON.parse(JSON.stringify(input)),errors=[];
    if(d.schemaVersion===undefined)d.schemaVersion=1;
    if(d.schemaVersion===1){
      // Backwards-compatible migration for saved v1 generators.
      if(d.generatorType==='circle-dominant-sevenths'){
        d.strategy={type:'cycle',roots:['C','F','Bb','Eb','Ab','Db','Gb','B','E','A','D','G'],intervals:{fourths:5,fifths:7},chordSuffix:'7',uniqueRoots:true};
        d.controls={startingRoot:{label:'Starting root',type:'select',options:['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],default:d.defaultStart||'Eb'},direction:{label:'Direction',type:'select',options:[{value:'fourths',label:'Circle of fourths'},{value:'fifths',label:'Circle of fifths'}],default:d.defaultDirection||'fourths'},randomPlaylistStarts:{label:'Random starting root for each playlist chart',type:'checkbox',default:true,playlistOnly:true}};
      }else{
        d.strategy={type:'shuffle',chords:d.chords,repeatDistinctChordCount:d.repeatDistinctChordCount,maxSelectionsPerChord:d.maxSelectionsPerChord,requireAllChords:d.requireAllChords,forbidAdjacentSelectionsOfSameChord:d.forbidAdjacentSelectionsOfSameChord};
      }
      d.playlist={titleTemplate:'{name} {number}',minCharts:2,maxCharts:50};d.schemaVersion=2;
    }
    if(d.schemaVersion!==2)errors.push('Unsupported generator schemaVersion '+d.schemaVersion);
    if(typeof d.id!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(d.id))errors.push('Invalid generator ID');
    for(const k of ['name','title','key','style'])if(typeof d[k]!=='string'||!d[k].trim())errors.push('Missing '+k);
    if(d.timeSignature!=='4/4'||d.barsPerLine!==4)errors.push('The current iReal exporter supports 4/4 and four bars per line');
    if(!Number.isSafeInteger(d.bars)||d.bars<4||!Number.isSafeInteger(d.barsPerSelection)||d.barsPerSelection<1||d.bars%d.barsPerSelection)errors.push('Invalid bar count or barsPerSelection');
    const st=d.strategy||{};
    if(st.type==='cycle'){
      if(!Array.isArray(st.roots)||st.roots.length<2||st.roots.some(x=>!Number.isInteger(PITCH[x]))||new Set(st.roots.map(x=>PITCH[x])).size!==st.roots.length)errors.push('Cycle roots must be unique valid pitch classes');
      if(!st.intervals||!Object.keys(st.intervals).length||Object.values(st.intervals).some(x=>!Number.isInteger(x)||x<1||x>11))errors.push('Invalid cycle intervals');
      if(typeof st.chordSuffix!=='string'||!/^[a-zA-Z0-9+#b-]{1,12}$/.test(st.chordSuffix))errors.push('Invalid chord suffix');
      if(d.bars!==st.roots?.length*d.barsPerSelection)errors.push('Cycle length must equal chart bars');
      const ctl=controls(d);
      if(!ctl.startingRoot||!Array.isArray(ctl.startingRoot.options)||ctl.startingRoot.options.some(x=>!Number.isInteger(PITCH[optionValue(x)]))||!ctl.startingRoot.options.some(x=>optionValue(x)===ctl.startingRoot.default))errors.push('Invalid startingRoot control');
      if(!ctl.direction||!Array.isArray(ctl.direction.options)||ctl.direction.options.some(x=>!(optionValue(x) in st.intervals))||!ctl.direction.options.some(x=>optionValue(x)===ctl.direction.default))errors.push('Invalid direction control');
    }else if(st.type==='shuffle'){
      if(!Array.isArray(st.chords)||!st.chords.length||st.chords.some(x=>typeof x!=='string'||!/^[A-G](?:b|#)?7$/.test(x))||new Set(st.chords).size!==st.chords.length)errors.push('Invalid or duplicate chord spellings');
      if(!Number.isSafeInteger(st.repeatDistinctChordCount)||st.repeatDistinctChordCount<0||st.repeatDistinctChordCount>st.chords?.length||st.maxSelectionsPerChord!==2)errors.push('Invalid repetition rules');
      if(d.bars/d.barsPerSelection!==st.chords?.length+st.repeatDistinctChordCount)errors.push('Chord counts do not fit the chart length');
      if(st.requireAllChords!==true||st.forbidAdjacentSelectionsOfSameChord!==true)errors.push('Unsupported shuffle constraints');
    }else errors.push('Unknown strategy type');
    if(!d.playlist||!Number.isInteger(d.playlist.minCharts)||!Number.isInteger(d.playlist.maxCharts)||d.playlist.minCharts<2||d.playlist.maxCharts>50||d.playlist.minCharts>d.playlist.maxCharts||typeof d.playlist.titleTemplate!=='string')errors.push('Invalid playlist settings');
    return {pass:!errors.length,errors,definition:d,legacy:input.schemaVersion!==2};
  }
  function registrySave(){const imported=Object.fromEntries(Object.entries(registry).filter(([id])=>!builtinIds.has(id)));try{localStorage.setItem(generatorStorageKey,JSON.stringify(imported));localStorage.setItem(selectedStorageKey,def.id);}catch(e){status('Could not save generator registry: '+e.message);}}
  function registryUI(){
    const select=$('#generator-select');select.replaceChildren();
    const list=$('#generator-list');list.replaceChildren();
    const definitions=Object.values(registry);
    $('#generator-count').textContent=definitions.length+' installed';
    definitions.forEach(d=>{
      const option=document.createElement('option');option.value=d.id;option.textContent=d.name;select.appendChild(option);
      const row=document.createElement('div');row.className='generator-library-row'+(d.id===def.id?' is-active':'');
      const info=document.createElement('div');info.className='generator-library-info';
      const title=document.createElement('div');title.className='generator-library-name';title.textContent=d.name;
      const detail=document.createElement('div');detail.className='generator-library-detail';
      detail.textContent=d.bars+' bars · '+(d.strategy?.type==='cycle'?'Cycle':'Shuffle')+' · JSON v'+d.schemaVersion;
      const badge=document.createElement('span');badge.className='generator-library-badge';badge.textContent=builtinIds.has(d.id)?'Built-in':'Imported';
      info.append(title,detail,badge);
      const actions=document.createElement('div');actions.className='generator-library-actions';
      const download=document.createElement('button');download.type='button';download.textContent='Download JSON';
      download.onclick=()=>downloadGenerator(d);
      actions.appendChild(download);
      if(!builtinIds.has(d.id)){
        const remove=document.createElement('button');remove.type='button';remove.className='generator-remove';remove.textContent='Delete';
        remove.onclick=()=>{if(!confirm('Delete generator '+d.name+'? Saved chart batches will not be erased.'))return;delete registry[d.id];if(def.id===d.id){def=registry['random-dominant-sevenths'];definitionSource='built-in';loadBatchOrFresh();}registrySave();registryUI();status('Generator deleted.');};
        actions.appendChild(remove);
      }
      row.append(info,actions);list.appendChild(row);
    });
    select.value=def.id;$('#generator-heading').textContent=def.name;
  }
  function batchKey(){return def.id;}
  function loadBatchOrFresh(){let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')[batchKey()];}catch(e){}
    if(saved&&['chart','playlist'].includes(saved.mode)&&Array.isArray(saved.batch)&&saved.batch.length&&saved.batch.every(c=>validate(c,def).pass)){mode=saved.mode;batch=saved.batch;chart=batch[0];}
    else{mode='chart';batch=[build(def)];chart=batch[0];}
    $('#export-mode').value=mode;$('#playlist-count').value=mode==='playlist'?String(batch.length):'12';
    if(isCycle(def)){
      for(const [id,control] of [['starting-key',startControl(def)],['circle-direction',directionControl(def)]]){
        const select=$('#'+id);select.replaceChildren();
        for(const choice of control.options){const opt=document.createElement('option');opt.value=optionValue(choice);opt.textContent=typeof choice==='string'?choice:(choice.label||choice.value);select.appendChild(opt);}
        select.value=control.default;
      }
    }else{$('#starting-key').value='Eb';$('#circle-direction').value='fourths';}if(isCycle(def)){$('#random-starts').checked=randomControl(def)?.default!==false;}refreshControls();render();
  }

  function shuffle(xs){const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function cycleSequence(d,start,direction){
    const st=d.strategy,roots=st.roots,byPitch=new Map(roots.map(x=>[PITCH[x],x]));
    const step=st.intervals[direction],result=[];
    for(let i=0;i<roots.length;i++){
      const pitch=(PITCH[start]+i*step)%12;
      const root=i===0?start:byPitch.get(pitch);
      if(!root)throw Error('Cycle roots do not cover pitch class '+pitch+' for '+direction);
      result.push(root+st.chordSuffix);
    }
    return result;
  }
  function build(d){
    const st=d.strategy;let picks,startKey,direction;
    if(st.type==='cycle'){
      startKey=d._start||startControl(d).default;
      direction=d._direction||directionControl(d).default;
      picks=cycleSequence(d,startKey,direction);
    }else if(st.type==='shuffle'){
      const repeats=shuffle(st.chords).slice(0,st.repeatDistinctChordCount);
      const candidates=st.chords.concat(repeats);
      for(let attempt=0;attempt<10000;attempt++){
        const proposed=shuffle(candidates);
        if(!st.forbidAdjacentSelectionsOfSameChord||proposed.every((x,i)=>!i||x!==proposed[i-1])){picks=proposed;break;}
      }
      if(!picks)throw Error('Could not find an ordering satisfying the JSON constraints');
    }else throw Error('Unsupported strategy');
    return {id:Date.now()+'-'+Math.random().toString(36).slice(2,7),generatorId:d.id,title:d.title,key:startKey||d.key,style:d.style,timeSignature:d.timeSignature,barsPerLine:d.barsPerLine,createdAt:new Date().toISOString(),...(startKey?{startKey,direction}:{}),picks,measures:picks.flatMap(x=>Array(d.barsPerSelection).fill(x))};
  }
  function validate(c,d){
    const errors=[],st=d.strategy;
    if(c.measures.length!==d.bars||c.picks.length!==d.bars/d.barsPerSelection)errors.push('Incorrect chart length');
    if(st.type==='cycle'){
      if(!st.intervals[c.direction])errors.push('Invalid cycle direction');
      if(c.picks[0]!==c.startKey+st.chordSuffix)errors.push('Starting chord mismatch');
      try{const expected=cycleSequence(d,c.startKey,c.direction);if(c.picks.some((x,i)=>x!==expected[i]))errors.push('Cycle progression differs from JSON definition');}catch(e){errors.push(e.message);}
      if(st.uniqueRoots&&new Set(c.picks.map(x=>PITCH[x.slice(0,-st.chordSuffix.length)])).size!==st.roots.length)errors.push('Duplicate cycle roots');
    }else{
      const counts=Object.fromEntries(st.chords.map(x=>[x,0]));
      for(let i=0;i<c.picks.length;i++){
        if(!(c.picks[i] in counts))errors.push('Unknown chord '+c.picks[i]);else counts[c.picks[i]]++;
        if(st.forbidAdjacentSelectionsOfSameChord&&i&&c.picks[i]===c.picks[i-1])errors.push('Adjacent same-chord selections');
      }
      if(st.requireAllChords&&Object.values(counts).some(n=>n===0))errors.push('Missing required chord');
      if(Object.values(counts).filter(n=>n===2).length!==st.repeatDistinctChordCount||Object.values(counts).some(n=>n>st.maxSelectionsPerChord))errors.push('Repetition counts differ from JSON');
    }
    for(let i=0;i<c.picks.length;i++)for(let j=0;j<d.barsPerSelection;j++)if(c.measures[i*d.barsPerSelection+j]!==c.picks[i])errors.push('Chord duration mismatch');
    if(c.key!==(c.startKey||d.key)||c.style!==d.style||c.timeSignature!==d.timeSignature)errors.push('Metadata mismatch');
    const counts=Object.fromEntries([...new Set(c.picks)].map(x=>[x,c.picks.filter(y=>y===x).length]));
    return {pass:!errors.length,errors,counts,repeatedChords:Object.keys(counts).filter(x=>counts[x]>1)};
  }
  function isSameLineRepeat(c,i){return i>0 && i%c.barsPerLine!==0 && c.measures[i]===c.measures[i-1];}
  function displayMeasure(c,i){return isSameLineRepeat(c,i)?'%':c.measures[i];}
  function makeRecord(c){
    // iReal Pro published irealbook protocol uses a 16-cell staff. Each measure here is four cells:
    // chord symbol (one cell) plus three spaces. 32 bars => 8 systems of 4 bars.
    if(c.timeSignature!=='4/4')throw Error('This exporter currently supports 4/4 only');
    if(c.barsPerLine!==4)throw Error('This exporter currently supports 4 bars per line only');
    const bars=c.measures.map((ch,i)=>(i?'|':'')+(isSameLineRepeat(c,i)?' x  ':ch+'   ')).join('');
    const progression='T44[*A'+bars+'Z';
    return [c.title,'Jazz Chart Studio',c.style,c.key,'n',progression].join('=');
  }
  const makeLink=c=>'irealbook://'+encodeURIComponent(makeRecord(c));
  // Append the named playlist after all complete six-field song records.
  // A visible HTML link label alone does not name the imported playlist.
  const makeBatchLink=charts=>'irealbook://'+encodeURIComponent(charts.map(makeRecord).join('=')+'='+playlistTitle());
  const activeLink=()=>mode==='playlist'?makeBatchLink(batch):makeLink(chart);
  const playlistTitle=()=>`${def.name} — ${batch.length} Charts`;
  function playlistValidation(){
    const errors=[];
    if(!batch.length)errors.push('Empty batch');
    const names=new Set();
    batch.forEach((c,i)=>{
      if(c.title!==def.playlist.titleTemplate.replace('{name}',def.name).replace('{number}',String(i+1)))errors.push('Incorrect title at chart '+(i+1));
      if(names.has(c.title))errors.push('Repeated song title '+c.title);names.add(c.title);
      const v=validate(c,def);if(!v.pass)errors.push('Chart '+(i+1)+': '+v.errors.join('; '));
      const rt=consistency(c);if(!rt.pass)errors.push('Round-trip '+(i+1)+': '+rt.errors.join('; '));
    });
    if(mode==='playlist'){
      const encoded=decodeURIComponent(makeBatchLink(batch).slice('irealbook://'.length));
      const fields=encoded.split('=');
      if(fields.length!==6*batch.length+1)errors.push('Expected '+(6*batch.length+1)+' protocol fields including playlist name, got '+fields.length);
      if(fields[fields.length-1]!==playlistTitle())errors.push('Playlist name missing or incorrect');
      batch.forEach((c,i)=>{if(fields[i*6]!==c.title||fields[i*6+2]!==c.style||fields[i*6+3]!==c.key)errors.push('Header mismatch in chart '+(i+1));});
    }
    return {pass:errors.length===0,errors,charts:batch.length,names:[...names]};
  }

  function parseRoundTrip(url){
    const record=decodeURIComponent(url.replace(/^irealbook:\/\//,''));
    const fields=record.split('=');
    if(fields.length!==6)throw Error('Wrong number of iReal header fields');
    const raw=fields[5];
    if(!raw.startsWith('T44[*A')||!raw.endsWith('Z'))throw Error('Missing time, start, or final bar marker');
    const chords=raw.slice('T44[*A'.length,-1).split('|').map((part,i,all)=>{const symbol=part.trim();if(symbol==='x'){if(i===0)throw Error('Repeat cannot start chart');return all[i-1].trim()==='x'?null:all[i-1].trim();}return symbol;});
    for(let i=0;i<chords.length;i++)if(chords[i]===null)chords[i]=chords[i-1];
    return {title:fields[0],style:fields[2],key:fields[3],measures:chords};
  }
  function consistency(c){
    const errors=[];let decoded;
    try{decoded=parseRoundTrip(makeLink(c));}catch(e){errors.push(e.message);}
    if(decoded){if(decoded.measures.length!==c.measures.length)errors.push('Export bar count differs');
      c.measures.forEach((ch,i)=>{if(decoded.measures[i]!==ch)errors.push('Export differs at measure '+(i+1));});
      if(decoded.key!==c.key||decoded.style!==c.style)errors.push('Export metadata differs');}
    return {pass:errors.length===0,errors,decoded};
  }
  function status(msg){$('#status').textContent=msg;}
  function render(){
    const c=chart,score=$('#score');score.replaceChildren();
    $('#meta').replaceChildren();
    for(const s of [isCycle(def)?'Starting root: '+c.startKey:c.key+' major key signature',...(isCycle(def)?['Circle of '+c.direction]:[]),c.style,c.timeSignature,c.measures.length+' measures',c.barsPerLine+' measures per line']){
      const e=document.createElement('span');e.className='tag';e.textContent=s;$('#meta').appendChild(e);
    }
    for(let i=0;i<c.measures.length;i+=c.barsPerLine){
      const line=document.createElement('div');line.className='system';line.dataset.startBar=String(i+1);
      for(let j=i;j<Math.min(i+c.barsPerLine,c.measures.length);j++){
        const cell=document.createElement('div');cell.className='bar';cell.dataset.chord=c.measures[j];cell.dataset.bar=String(j+1);
        const chord=document.createElement('span');chord.textContent=displayMeasure(c,j);if(isSameLineRepeat(c,j))chord.className='same';
        cell.appendChild(chord);const num=document.createElement('span');num.className='bar-number';num.textContent=String(j+1);cell.appendChild(num);line.appendChild(cell);
      }score.appendChild(line);
    }
    const v=validate(c,def),round=consistency(c);
    const rendered=[...score.querySelectorAll('.bar')].map(e=>e.dataset.chord);
    const renderOk=rendered.length===c.measures.length&&rendered.every((ch,i)=>ch===c.measures[i])&&score.querySelectorAll('.system').length===c.measures.length/c.barsPerLine;
    const checks=$('#checks');checks.replaceChildren();
    for(const [ok,text] of [[v.pass,'Generator rules: '+(v.pass?'PASS':v.errors.join('; '))],[renderOk,'On-screen sequence and 4-bar systems: '+(renderOk?'PASS':'FAIL')],[round.pass,'Encoded iReal data round trip: '+(round.pass?'PASS':round.errors.join('; '))]]){
      const e=document.createElement('div');e.className=ok?'pass':'fail';e.textContent=(ok?'✓ ':'✗ ')+text;checks.appendChild(e);
    }
    $('#preview-title').textContent=c.title;$('#open-ireal').href=activeLink();
    const pv=playlistValidation();const line=document.createElement('div');line.className=pv.pass?'pass':'fail';line.textContent=(pv.pass?'✓ ':'✗ ')+'Batch and playlist structure: '+(pv.pass?'PASS':pv.errors.join('; '));checks.appendChild(line);
    resultsJson();
  }
  function resultsObject(){
    const v=validate(chart,def),round=consistency(chart);
    const displayed=[...document.querySelectorAll('#score .bar')].map(e=>e.dataset.chord);
    const results=Object.fromEntries([...document.querySelectorAll('[data-test]')].map(e=>[e.dataset.test,e.value]));
    return {test:'Jazz Chart Studio Guided iReal Pro Import',version:APP_VERSION,appVersion:APP_VERSION,generatorSchemaVersion:def.schemaVersion||1,recordedAt:new Date().toISOString(),url:location.href,definitionSource,browser:navigator.userAgent,exportMode:mode,requestedCount:mode==='playlist'?Number($('#playlist-count').value):1,batchValidation:playlistValidation(),batchCharts:batch,results,notes:$('#notes').value,generator:{id:def.id,type:def.strategy.type,chords:def.strategy.chords||null,key:def.key||null,style:def.style,barsPerLine:def.barsPerLine,defaultStart:startControl(def)?.default||null,defaultDirection:directionControl(def)?.default||null,randomPlaylistStarts:isCycle(def)?$('#random-starts').checked:null},generated:chart,validation:{generator:v,screenMatchesModel:displayed.length===chart.measures.length&&displayed.every((ch,i)=>ch===chart.measures[i]),exportRoundTrip:round.pass,exportErrors:round.errors},links:{official:$('#official').href,fourBar:$('#simple').href,full:$('#open-ireal').href,playlist:mode==='playlist'?activeLink():null,genuine:genuine?.url||null,genuineFilename:genuine?.name||null}};
  }
  function resultsJson(){if(!chart)return '';let raw=JSON.stringify(resultsObject(),null,2);$('#result-json').value=raw;return raw;}
  function download(name,text,mime){const blob=new Blob([text],{type:mime});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),15000);}
  function downloadGenerator(d){download(d.id+'.json',JSON.stringify(d,null,2),'application/json');}
  function save(){try{const all=JSON.parse(localStorage.getItem(storageKey)||'{}');all[batchKey()]={mode,batch};localStorage.setItem(storageKey,JSON.stringify(all));}catch(e){status('Browser storage unavailable; use result download instead.');}}
  function refreshControls(){
    const playlist=mode==='playlist';$('#playlist-count-label').hidden=!playlist;
    $('#circle-options').hidden=!isCycle(def);$('#random-start-label').hidden=!(isCycle(def)&&playlist&&!!randomControl(def));if(isCycle(def)){const sc=startControl(def),dc=directionControl(def);$('#starting-key').parentElement.firstChild.textContent=sc.label+' ';$('#circle-direction').parentElement.firstChild.textContent=dc.label+' ';$('#random-start-label').lastChild.textContent=' '+(randomControl(def)?.label||'Random starting root');}$('#starting-key').disabled=isCycle(def)&&playlist&&$('#random-starts').checked;
    $('#generate').textContent=playlist?'Generate Playlist':'Generate Chart';
    $('#open-ireal').textContent=playlist?'Open Playlist in iReal Pro':'Open Chart in iReal Pro';
    $('#download-ireal').textContent=playlist?'Export Playlist HTML':'Export Chart HTML';
    $('#playlist-navigator').hidden=!playlist;
    const summary=$('#batch-summary');summary.textContent=playlist?`${batch.length} independently generated charts · ${def.bars} bars each · one iReal Pro playlist`:`One generated ${def.bars}-bar chart`;
    const sel=$('#chart-select'),prior=sel.value;sel.replaceChildren();
    batch.forEach((c,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=c.title;sel.appendChild(o);});
    sel.value=String(Math.max(0,batch.indexOf(chart)));if(!batch.includes(chart))chart=batch[0];
  }
  function fresh(){
    const count=mode==='playlist'?Number($('#playlist-count').value):1;
    if(!Number.isSafeInteger(count)||count<1||(mode==='playlist'&&(count<def.playlist.minCharts||count>def.playlist.maxCharts))){
      status('Select a valid playlist size between 2 and 50.');return;
    }
    const next=[];for(let i=0;i<count;i++){
      const opts=isCycle(def)?{...def,_start:mode==='playlist'&&$('#random-starts').checked?randomStart(def):circleStart(),_direction:circleDirection()}:def;
      const c=build(opts);c.title=mode==='playlist'?`${isCycle(def)?def.name:def.name.replace(/Sevenths/i,'Chords')} ${i+1}`:def.title;next.push(c);
    }
    batch=next;chart=batch[0];save();refreshControls();render();status(`${count} chart${count===1?'':'s'} generated, validated, and saved locally.`);
  }

  function htmlExport(){const url=activeLink(),title=mode==='playlist'?playlistTitle():chart.title;
    const safe=x=>x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safe(title)+'</title></head><body><h1>'+safe(title)+'</h1><p><a href="'+safe(url)+'">Open '+(mode==='playlist'?'Playlist':'Chart')+' in iReal Pro</a></p><ol>'+batch.map(c=>'<li>'+safe(c.title)+'</li>').join('')+'</ol></body></html>';
  }
  async function copyResults(){const s=resultsJson();try{await navigator.clipboard.writeText(s);status('Copied results. Return to ChatGPT and paste.');return;}catch(e){}
    const field=$('#result-json');field.focus();field.select();field.setSelectionRange(0,field.value.length);
    try{if(document.execCommand('copy')){status('Copied results using selection fallback. Paste in ChatGPT.');return;}}catch(e){}
    status('Clipboard blocked. JSON selected below: use the iPad Copy menu, or Share Results.');}
  async function loadDef(){try{const r=await fetch('generators/random-dominant-sevenths.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const parsed=await r.json();const checked=generatorCheck(parsed);if(!checked.pass)throw Error(checked.errors.join('; '));def=checked.definition;definitionSource='generators/random-dominant-sevenths.json';}catch(e){status('JSON could not load; using identical embedded fallback ('+e.message+').');}}
  async function init(){await loadDef();def=generatorCheck(def).definition;registry[def.id]=def;
    try{const imported=JSON.parse(localStorage.getItem(generatorStorageKey)||'{}');for(const [id,item] of Object.entries(imported)){const check=generatorCheck(item);if(check.pass&&!builtinIds.has(id)&&id===check.definition.id)registry[id]=check.definition;}}catch(e){}
    const last=localStorage.getItem(selectedStorageKey);if(last&&registry[last])def=registry[last];
    $('#app-version').textContent=APP_VERSION;
    $('#simple').href=makeLink({title:'JCS Four Bar Test',style:'Medium Swing',key:'C',timeSignature:'4/4',barsPerLine:4,measures:['C7','F7','G7','C7']});
    try{const r=await fetch('generators/circle-dominant-sevenths.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const checked=generatorCheck(await r.json());if(!checked.pass)throw Error(checked.errors.join('; '));registry[checked.definition.id]=checked.definition;}catch(e){status('Circle generator failed to load: '+e.message);}
    registryUI();loadBatchOrFresh();
    $('#manage-generators').onclick=()=>{const panel=$('#generator-manager');panel.hidden=!panel.hidden;$('#manage-generators').setAttribute('aria-expanded',String(!panel.hidden));};
    $('#close-generator-manager').onclick=()=>{$('#generator-manager').hidden=true;$('#manage-generators').setAttribute('aria-expanded','false');$('#manage-generators').focus();};
    $('#generator-select').onchange=()=>{def=registry[$('#generator-select').value];definitionSource=builtinIds.has(def.id)?'built-in':'browser-imported';registrySave();registryUI();loadBatchOrFresh();};
    $('#generator-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());const checked=generatorCheck(parsed);if(!checked.pass)throw Error(checked.errors.join('; '));const d=checked.definition;if(builtinIds.has(d.id))throw Error('Cannot overwrite a built-in generator');if(registry[d.id]&&!confirm('Replace imported generator '+d.id+'?'))return;registry[d.id]=d;def=d;definitionSource='browser-imported: '+file.name;registrySave();registryUI();loadBatchOrFresh();$('#generator-message').textContent='Installed '+d.name+(checked.legacy?' (legacy JSON migrated to schema v1)':'')+'.';}catch(err){$('#generator-message').textContent='Import rejected: '+err.message;}finally{e.target.value='';}};
    let schemaText='';
    $('#view-generator-schema').onclick=async()=>{
      const panel=$('#generator-schema-view');panel.hidden=!panel.hidden;
      $('#view-generator-schema').setAttribute('aria-expanded',String(!panel.hidden));
      if(!panel.hidden&&!schemaText){
        try{const response=await fetch('generators/generator-schema-v2.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);schemaText=JSON.stringify(await response.json(),null,2);$('#generator-schema-text').textContent=schemaText;}
        catch(error){$('#generator-schema-text').textContent='Unable to load schema: '+error.message;}
      }
    };
    $('#copy-generator-schema').onclick=async()=>{if(!schemaText)return;try{await navigator.clipboard.writeText(schemaText);$('#generator-message').textContent='Schema copied.';}catch(e){$('#generator-message').textContent='Copy unavailable. Select the schema text to copy it.';}};
    $('#export-mode').onchange=()=>{mode=$('#export-mode').value;fresh();};
    $('#random-starts').onchange=refreshControls;
    $('#starting-key').onchange=()=>status('Press Generate to use the selected starting root.');
    $('#circle-direction').onchange=()=>status('Press Generate to use the selected circle direction.');
    $('#playlist-count').onchange=()=>{if(mode==='playlist')status('Press Generate Playlist to apply the new count.');};
    $('#chart-select').onchange=()=>{chart=batch[Number($('#chart-select').value)];render();};
    $('#generate').onclick=fresh;
    $('#download-ireal').onclick=()=>download(mode==='playlist'?def.id+'-playlist.html':def.id+'-ireal.html',htmlExport(),'text/html');
    $('#copy-results').onclick=copyResults;
    $('#share-results').onclick=async()=>{const s=resultsJson();try{if(navigator.share){await navigator.share({title:'Jazz Chart Studio Test Results',text:s});status('Share sheet opened.');}else status('Share not available; use Copy Results.');}catch(e){status('Share cancelled or unavailable. Use Copy Results.');}};
    $('#download-results').onclick=()=>download('ireal-pro-test-results.json',resultsJson(),'application/json');
    $('#select-results').onclick=()=>{$('#result-json').focus();$('#result-json').select();$('#result-json').setSelectionRange(0,$('#result-json').value.length);status('JSON selected. Choose Copy from the text selection menu.');};
    $('#notes').oninput=resultsJson;document.querySelectorAll('[data-test]').forEach(x=>x.onchange=resultsJson);
    $('#genuine-file').onchange=async(e)=>{const f=e.target.files?.[0];if(!f)return;const text=await f.text();const match=text.match(/irealb:\/\/[^"'\s<>]+|irealbook:\/\/[^"'\s<>]+/i);if(!match){status('No iReal import link found in the file.');return;}genuine={name:f.name,url:match[0].replace(/&amp;/g,'&')};$('#genuine-link').href=genuine.url;$('#genuine-link').hidden=false;resultsJson();status('Genuine chart link loaded. Tap it to test.');};
  }
  init().catch(e=>status('Initialization failed: '+e.message));
})();
