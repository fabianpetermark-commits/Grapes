/* Grapes Health UI mock interactions: in-memory only. Never reads/writes application data. */
(() => {
 'use strict';
 const root=document.documentElement;
 const mode=root.dataset.healthPage || 'food';
 const one=s=>document.querySelector(s);
 const all=s=>Array.from(document.querySelectorAll(s));
 const toast=txt=>{let e=one('#hi-toast');e.textContent=txt;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2700)};
 const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const modal=(title,body,buttons) => {
  const box=one('#hi-dialog');
  one('#hi-dialog-title').textContent=title;
  one('#hi-dialog-body').innerHTML=body;
  const footer=one('#hi-dialog-footer');footer.replaceChildren();
  (buttons||[]).forEach(b=>{const btn=document.createElement('button');btn.type='button';btn.className='hi-button'+(b.primary?' primary':'');btn.textContent=b.label;btn.addEventListener('click',()=>b.action?.(box));footer.append(btn)});
  box.hidden=false;one('#hi-dialog-close').focus();
 };
 const close=()=>one('#hi-dialog').hidden=true;
 one('#hi-dialog-close')?.addEventListener('click',close);
 one('#hi-dialog')?.addEventListener('click',e=>{if(e.target.id==='hi-dialog')close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!one('#hi-dialog').hidden)close()});
 const demo=(name)=>toast(name+' – ez egy mintaelőnézet, éles adat nem módosul.');
 const openSettings=()=>modal('Health beállítások','<p class="hi-sub">Kalória-, makró- és vízcélok, megjelenítés, Food-import, valamint mentési beállítások. Az éles app meglévő beállításait a dizájnváltás nem írhatja felül.</p>',[{label:'Rendben',primary:true,action:close}]);
 one('[data-settings]')?.addEventListener('click',openSettings);
 one('[data-nav-stats]')?.addEventListener('click',()=>modal('Statisztika','<p class="hi-sub">A jelenlegi Food modul valódi, időszakfüggetlen statisztikai oldala külön implementációban marad. Itt a közös ikonsor és a nézetelérés tervét mutatjuk.</p>',[{label:'Rendben',primary:true,action:close}]));
 const scan=()=>modal('Vonalkódolvasó','<p class="hi-sub">Az Android alkalmazás meglévő natív vonalkódolvasóját kell megnyitni. Ez a HTML nem kér kamerajogosultságot és nem indít szkennert.</p>',[{label:'Rendben',primary:true,action:close}]);
 all('[data-scan]').forEach(b=>b.addEventListener('click',scan));
 all('[data-photo]').forEach(b=>b.addEventListener('click',()=>modal('Fotó hozzáadása','<p class="hi-sub">A meglévő Food fotós bevitelhez kapcsolódó Quick Action. Az előnézet nem nyit kamerát és nem tárol képet.</p>',[{label:'Rendben',primary:true,action:close}])));
 let foodEntries=[{name:'Zabkása banánnal',meal:'Reggeli',kcal:380,amount:'1 adag'}, {name:'Csirkés bulgur',meal:'Ebéd',kcal:560,amount:'320 g'}, {name:'Quarkos palacsinta',meal:'Uzsonna',kcal:190,amount:'2 db'}, {name:'Zöldséges szendvics',meal:'Vacsora',kcal:290,amount:'1 adag'}];
 const foodGoal=2100;
 const renderFood=()=>{
  const total=foodEntries.reduce((n,e)=>n+e.kcal,0);
  const ring=one('#food-ring');if(ring)ring.style.setProperty('--p',Math.min(100,Math.round(total/foodGoal*100)));
  if(one('#food-total'))one('#food-total').textContent=new Intl.NumberFormat('hu-HU').format(total);
  if(one('#food-rest'))one('#food-rest').textContent=Math.max(0,foodGoal-total)+' kcal maradt a napi célból';
  ['Reggeli','Ebéd','Uzsonna','Vacsora'].forEach((key,i)=>{
   const sum=foodEntries.filter(e=>e.meal===key).reduce((n,e)=>n+e.kcal,0);
   const n=one('[data-meal-total="'+key+'"]');if(n)n.textContent=sum+' kcal';
  });
  const list=one('#food-items');if(!list)return;
  list.replaceChildren();
  foodEntries.forEach((e,i)=>{
   const wrap=document.createElement('div');wrap.className='hi-entry';
   wrap.innerHTML='<span class="hi-entry-icon" aria-hidden="true">🍽</span><span class="hi-entry-copy"><strong>'+esc(e.name)+'</strong><small>'+esc(e.meal)+' · '+esc(e.amount)+'</small></span><span class="hi-entry-end">'+e.kcal+' kcal</span>';
   const button=document.createElement('button');button.type='button';button.className='hi-mini danger';button.title='Tétel törlése';button.setAttribute('aria-label',e.name+' törlése');button.textContent='×';
   button.addEventListener('click',()=>{foodEntries.splice(i,1);renderFood();toast('A tételt eltávolítottuk a demóból.')});
   wrap.append(button);list.append(wrap);
  });
 };
 const addMeal=(preselect)=>{
  modal('Étel hozzáadása','<label>Étkezés<select class="hi-field" id="hi-meal-type"><option>Reggeli</option><option>Ebéd</option><option>Uzsonna</option><option>Vacsora</option></select></label><label>Étel neve<input class="hi-field" id="hi-meal-name" placeholder="Étel megnevezése"></label><label>Kalória (kcal)<input class="hi-field" id="hi-meal-kcal" inputmode="numeric" type="number" min="0" max="99999" value="150"></label><p class="hi-sub">Csak demonstráció: az éles Food keresés, USDA/OFF, makrók, adagok és mentés változatlanul külön működnek.</p>',
  [{label:'Mégse',action:close},{label:'Hozzáadás',primary:true,action:()=>{
   const n=one('#hi-meal-name').value.trim(),c=Number(one('#hi-meal-kcal').value);
   if(!n||!Number.isFinite(c)||c<0){toast('Adj meg ételnevet és érvényes kalóriát.');return}
   foodEntries.unshift({name:n,meal:one('#hi-meal-type').value,kcal:c,amount:'1 adag'});close();renderFood();toast('Mintatétel hozzáadva az előnézethez.');
  }}]);
  if(preselect)one('#hi-meal-type').value=preselect;
 };
 if(mode==='food'){
  renderFood();
  all('[data-meal]').forEach(btn=>btn.addEventListener('click',()=>addMeal(btn.dataset.meal)));
  one('#food-date')?.addEventListener('change',e=>{const d=e.target.value;toast(d+' – időszakváltás mintanézetben.');});
 }
 all('[data-add-food]').forEach(b=>b.addEventListener('click',()=>{if(mode==='food')addMeal('');else window.location.href='food.html';}));
 let waterGoal=2200;
 let waterEntries=[{amount:250,time:'08:10'},{amount:500,time:'10:45'},{amount:250,time:'12:40'},{amount:250,time:'14:15'}];
 const renderWater=()=>{
  const total=waterEntries.reduce((sum,v)=>sum+v.amount,0);
  const ring=one('#water-ring');if(ring)ring.style.setProperty('--p',Math.min(100,Math.round(total/waterGoal*100)));
  ['water-total','water-count'].forEach(id=>{if(one('#'+id))one('#'+id).textContent=new Intl.NumberFormat('hu-HU').format(total)});
  if(one('#water-goal-value'))one('#water-goal-value').textContent=new Intl.NumberFormat('hu-HU').format(waterGoal);
  if(one('#water-remaining'))one('#water-remaining').textContent=total>=waterGoal?'A napi cél teljesült.':'Még '+new Intl.NumberFormat('hu-HU').format(waterGoal-total)+' ml hiányzik a célhoz.';
  const list=one('#water-entries');if(!list)return;
  list.replaceChildren();waterEntries.forEach((entry,i)=>{
   const row=document.createElement('div');row.className='hi-entry';
   row.innerHTML='<span class="hi-entry-icon" aria-hidden="true">◉</span><span class="hi-entry-copy"><strong>Víz</strong><small>'+esc(entry.time)+' · rögzített mintatétel</small></span><span class="hi-entry-end">+'+entry.amount+' ml</span>';
   const del=document.createElement('button');del.type='button';del.className='hi-mini danger';del.textContent='×';del.setAttribute('aria-label',entry.amount+' ml tétel törlése');del.addEventListener('click',()=>{waterEntries.splice(i,1);renderWater();toast('Mintatétel törölve.')});row.append(del);list.append(row);
  });
 };
 const addWater=ml=>{waterEntries.unshift({amount:ml,time:new Date().toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'})});renderWater();toast('+'+ml+' ml hozzáadva a demó víznaplóhoz.')};
 if(mode==='water'){
  renderWater();
  all('[data-water-add]').forEach(b=>b.addEventListener('click',()=>addWater(Number(b.dataset.waterAdd))));
  one('#water-goal-edit')?.addEventListener('click',()=>modal('Napi vízcél','<label>Napi cél (ml)<input type="number" class="hi-field" id="hi-new-goal" min="250" step="50" value="'+waterGoal+'"></label>',[{label:'Mégse',action:close},{label:'Mentés',primary:true,action:()=>{const n=Number(one('#hi-new-goal').value);if(n<250||n>10000){toast('250–10 000 ml között adj meg célt.');return}waterGoal=n;close();renderWater();toast('A demo napi cél frissült.')}}]));
 }
 all('[data-quick-water]').forEach(b=>b.addEventListener('click',()=>{if(mode==='water')addWater(250);else window.location.href='water.html';}));
 const recipes=[
  {name:'Quarkos palacsinta',type:'Édes',kcal:190,serves:4,emoji:'🥞',ingredients:'Quark, tojás, liszt, tej',instructions:'Keverd össze az alapanyagokat, majd kisebb adagokban süsd készre.'},
  {name:'Répás sajttorta falatok',type:'Édes',kcal:145,serves:8,emoji:'🥕',ingredients:'Répa, quark, tojás, kukoricakeményítő',instructions:'Készíts krémet, töltsd a tésztába és süsd aranybarnára.'},
  {name:'Csirkés bulgurtál',type:'Sós',kcal:560,serves:2,emoji:'🍲',ingredients:'Csirke, bulgur, paprika, paradicsom',instructions:'Főzd meg a bulgurt, párold a csirkét és tálald együtt.'},
  {name:'Gyors kovászos kenyér',type:'Sós',kcal:210,serves:10,emoji:'🍞',ingredients:'Liszt, víz, kovászpor, só',instructions:'Dagaszd meg a tésztát, hagyd kelni, majd süsd ropogósra.'}
 ];
 let recipeFilter='Mind';
 const displayRecipes=()=>{
  const term=(one('#recipe-search')?.value||'').toLocaleLowerCase('hu-HU');
  const matches=recipes.filter(r=>(recipeFilter==='Mind'||r.type===recipeFilter)&&r.name.toLocaleLowerCase('hu-HU').includes(term));
  const list=one('#recipe-grid');if(!list)return;
  list.replaceChildren();
  matches.forEach(r=>{
   const b=document.createElement('button');b.type='button';b.className='hi-recipe';
   b.innerHTML='<div class="hi-recipe-art" aria-hidden="true">'+esc(r.emoji)+'</div><div class="hi-recipe-copy"><strong>'+esc(r.name)+'</strong><small>'+r.kcal+' kcal / adag · '+r.serves+' adag</small></div>';
   b.addEventListener('click',()=>modal(r.name,'<div class="hi-row"><span class="hi-label">Típus: '+esc(r.type)+'</span><strong>'+r.kcal+' kcal / adag</strong></div><p class="hi-sub"><strong>Összetevők:</strong> '+esc(r.ingredients)+'</p><p class="hi-sub"><strong>Elkészítés:</strong> '+esc(r.instructions)+'</p><p class="hi-sub">Makró- és adagértékek csak minták, az éles számítás megmarad a Food motorjánál.</p>',[{label:'Rendben',primary:true,action:close},{label:'Szerkesztés',action:()=>openRecipeEditor(r)}]));list.append(b);
  });
  const empty=one('#recipe-empty');if(empty)empty.hidden=matches.length>0;
  if(one('#recipe-count'))one('#recipe-count').textContent=matches.length+' recept';
 };
 const openRecipeEditor=(existing)=>{
  const editing=Boolean(existing);
  const body='<div class="hi-tabs" role="tablist" aria-label="Recept szerkesztő fülek">'+
   ['Alapadatok','Összetevők','Elkészítés','Kép','Import'].map((name,i)=>'<button class="hi-tab'+(i===0?' active':'')+'" type="button" data-editor-tab="'+i+'" role="tab" aria-selected="'+(i===0)+'">'+name+'</button>').join('')+'</div>'+
   '<div data-editor-pane="0"><label>Recept neve<input class="hi-field" id="hi-recipe-name" maxlength="80" value="'+esc(existing?.name||'')+'"></label><label>Típus<select class="hi-field" id="hi-recipe-type"><option>Édes</option><option>Sós</option></select></label><label>Adagok száma<input type="number" class="hi-field" id="hi-recipe-serves" min="1" max="100" value="'+(existing?.serves||4)+'"></label></div>'+
   '<div data-editor-pane="1" hidden><label>Összetevők (vesszővel elválasztva)<textarea class="hi-field" id="hi-recipe-ingredients" rows="5">'+esc(existing?.ingredients||'')+'</textarea></label></div>'+
   '<div data-editor-pane="2" hidden><label>Elkészítés<textarea class="hi-field" id="hi-recipe-instructions" rows="7">'+esc(existing?.instructions||'')+'</textarea></label></div>'+
   '<div data-editor-pane="3" hidden><p class="hi-sub">A valódi alkalmazásban itt lehet képet kiválasztani; a HTML demó nem tölt fel semmit.</p><input class="hi-field" type="file" accept="image/*" aria-label="Receptkép kiválasztása"></div>'+
   '<div data-editor-pane="4" hidden><label>Receptlink vagy bemásolt szöveg<textarea class="hi-field" id="hi-recipe-import" placeholder="Link vagy recept szövege" rows="4"></textarea></label><label>Vagy válassz helyi fájlt<input class="hi-field" type="file" accept=".txt,.csv,.pdf,.doc,.docx" aria-label="Receptfájl kiválasztása"></label><p class="hi-sub">Import előnézet: a valódi parser biztonságos megerősítési folyamata későbbi implementáció, itt nincs automatikus feldolgozás.</p></div>';
  modal(editing?'Recept szerkesztése':'Új recept',body,[{label:'Mégse',action:close},{label:'Mentés a mintába',primary:true,action:()=>{
   const name=one('#hi-recipe-name').value.trim(),serves=Number(one('#hi-recipe-serves').value);
   if(!name||!Number.isInteger(serves)||serves<1){toast('Adj meg receptnevet és adagokat.');return}
   const item=existing||{name:'',kcal:0,emoji:'🍴',type:'Sós',serves:4,ingredients:'',instructions:''};
   item.name=name;item.type=one('#hi-recipe-type').value;item.serves=serves;item.ingredients=one('#hi-recipe-ingredients').value;item.instructions=one('#hi-recipe-instructions').value;
   if(!existing)recipes.unshift(item);close();displayRecipes();toast('Recept mentve a helyi demónézetbe.');
  }}]);
  one('#hi-recipe-type').value=existing?.type||'Édes';
  all('[data-editor-tab]').forEach(b=>b.addEventListener('click',()=>{
   all('[data-editor-tab]').forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-selected',String(n===b))});
   all('[data-editor-pane]').forEach(n=>n.hidden=n.dataset.editorPane!==b.dataset.editorTab);
  }));
 };
 if(mode==='recipes'){
  displayRecipes();
  one('#recipe-search')?.addEventListener('input',displayRecipes);
  all('[data-recipe-filter]').forEach(b=>b.addEventListener('click',()=>{
   recipeFilter=b.dataset.recipeFilter;all('[data-recipe-filter]').forEach(n=>n.classList.toggle('active',n===b));displayRecipes();
  }));
  one('#new-recipe')?.addEventListener('click',()=>openRecipeEditor());
  one('#new-recipe-alt')?.addEventListener('click',()=>openRecipeEditor());
 }
})();
