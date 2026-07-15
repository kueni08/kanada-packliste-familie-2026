const OWNERS=["Allgemein","Marc","Nici","Nils","Lou","Laila"];
const state={items:[],trips:[],templates:[],events:[],owner:"Allgemein",filter:"all",query:"",familyId:null,tripId:null,userName:localStorage.getItem("pack-user")||"",channel:null,pending:JSON.parse(localStorage.getItem("pack-pending-v2")||"[]").filter(x=>x?.table&&x?.row),groupSortable:null,itemSortables:[]};
const $=selector=>document.querySelector(selector);
const cfg=window.APP_CONFIG||{};
const configured=cfg.supabaseUrl&&!cfg.supabaseUrl.startsWith("REPLACE_");
const db=configured&&window.supabase?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
const els={tabs:$("#ownerTabs"),list:$("#list"),search:$("#searchInput"),filter:$("#statusFilter"),sync:$("#syncBanner"),overallBar:$("#overallBar"),overallPercent:$("#overallPercent"),overallLabel:$("#overallLabel"),userButton:$("#userButton"),login:$("#loginDialog"),loginForm:$("#loginForm"),loginError:$("#loginError"),add:$("#addDialog"),addForm:$("#addForm"),confirm:$("#confirmDialog"),tripSelect:$("#tripSelect"),activity:$("#activityDialog"),activityList:$("#activityList"),data:$("#dataDialog"),tripForm:$("#tripForm"),dataMessage:$("#dataMessage")};

function escapeHtml(value){const d=document.createElement("div");d.textContent=value??"";return d.innerHTML}
function escapeAttr(value){return escapeHtml(value).replaceAll('"','&quot;')}
function cacheKey(){return `pack-items-${state.familyId||"local"}-${state.tripId||"none"}`}
function cacheItems(){if(state.tripId)localStorage.setItem(cacheKey(),JSON.stringify(state.items))}
function loadCache(){state.items=JSON.parse(localStorage.getItem(cacheKey())||"[]")}
function savePending(){localStorage.setItem("pack-pending-v2",JSON.stringify(state.pending))}
function setSync(mode,text){els.sync.className=`sync-banner ${mode}`;els.sync.querySelector("span:last-child").textContent=text}
function formatStamp(value){if(!value)return"";return new Intl.DateTimeFormat("de-CH",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}
function currentTrip(){return state.trips.find(t=>t.id===state.tripId)}
function activeItems(){return state.items.filter(i=>!i.deleted_at)}
function showDataMessage(message,error=false){els.dataMessage.hidden=false;els.dataMessage.textContent=message;els.dataMessage.style.background=error?"#fff0ed":"#edf7f3";els.dataMessage.style.color=error?"#b92f25":"var(--green)"}

function renderTrips(){
  els.tripSelect.innerHTML=state.trips.filter(t=>!t.is_archived).map(t=>`<option value="${t.id}" ${t.id===state.tripId?"selected":""}>${escapeHtml(t.name)}</option>`).join("");
  els.tripSelect.disabled=!state.trips.length;
}
function render(){
  const active=activeItems(),done=active.filter(i=>i.done).length,pct=active.length?Math.round(done/active.length*100):0;
  els.overallBar.style.width=`${pct}%`;els.overallPercent.textContent=`${pct} %`;els.overallLabel.textContent=active.length?`${done} von ${active.length} gepackt`:currentTrip()?"Noch keine Einträge":"Reise wird geladen";
  renderTrips();
  els.tabs.innerHTML=OWNERS.map(owner=>{const rows=active.filter(i=>i.owner===owner),n=rows.filter(i=>i.done).length;return `<button class="tab ${state.owner===owner?"active":""}" data-owner="${owner}">${owner}<small>${n}/${rows.length}</small></button>`}).join("");
  const q=state.query.trim().toLocaleLowerCase("de");
  const canSort=state.filter==="all"&&!q;
  const rows=active.filter(i=>i.owner===state.owner&&(state.filter==="all"||(state.filter==="done"?i.done:!i.done))&&(!q||`${i.label} ${i.category}`.toLocaleLowerCase("de").includes(q)));
  const groups=rows.reduce((result,item)=>((result[item.category]??=[]).push(item),result),{});
  const groupPosition=category=>Math.min(...active.filter(item=>item.owner===state.owner&&item.category===category).map(item=>Number(item.position)||0));
  els.list.innerHTML=Object.keys(groups).length?Object.entries(groups).sort(([a],[b])=>groupPosition(a)-groupPosition(b)).map(([category,items])=>{
    const n=items.filter(i=>i.done).length;
    return `<details class="category" data-category="${escapeAttr(category)}" open><summary><button class="drag-handle group-drag-handle" type="button" aria-label="Gruppe ${escapeAttr(category)} verschieben" ${canSort?"":"disabled"}>⠿</button><span>${escapeHtml(category)}</span><span class="meta">${n}/${items.length}</span></summary><div class="category-tools"><button class="group-add" type="button" data-category="${escapeAttr(category)}">＋ Mehrere ergänzen</button><button class="group-delete" type="button" data-category="${escapeAttr(category)}" aria-label="Gruppe ${escapeAttr(category)} löschen">− Gruppe</button></div><div class="items" data-category="${escapeAttr(category)}">${items.sort((a,b)=>(a.position??0)-(b.position??0)||a.label.localeCompare(b.label,"de")).map(item=>`<div class="item ${item.done?"done":""}" data-id="${item.id}"><button class="drag-handle item-drag-handle" type="button" aria-label="${escapeAttr(item.label)} verschieben" ${canSort?"":"disabled"}>⠿</button><input type="checkbox" ${item.done?"checked":""} aria-label="${escapeAttr(item.label)} abhaken"><div><div class="item__label">${escapeHtml(item.label)}</div>${item.checked_by?`<div class="item__by">${item.done?"Eingepackt":"Wieder geöffnet"} von ${escapeHtml(item.checked_by)} · ${formatStamp(item.checked_at||item.updated_at)}</div>`:""}</div><button class="delete" aria-label="${escapeAttr(item.label)} löschen">×</button></div>`).join("")}</div></details>`}).join(""):$("#emptyTemplate").innerHTML;
  requestAnimationFrame(initDragAndDrop);
}
function initDragAndDrop(){
  state.groupSortable?.destroy();state.groupSortable=null;state.itemSortables.forEach(sortable=>sortable.destroy());state.itemSortables=[];
  if(!window.Sortable||state.filter!=="all"||state.query.trim()||!state.tripId)return;
  const shared={animation:180,delay:160,delayOnTouchOnly:true,touchStartThreshold:4,fallbackOnBody:true,swapThreshold:.65,ghostClass:"drag-ghost",chosenClass:"drag-chosen",dragClass:"drag-moving"};
  state.groupSortable=new window.Sortable(els.list,{...shared,draggable:".category",handle:".group-drag-handle",onEnd:persistDomOrder});
  els.list.querySelectorAll(".items").forEach(container=>state.itemSortables.push(new window.Sortable(container,{...shared,group:"packing-items",draggable:".item",handle:".item-drag-handle",emptyInsertThreshold:18,onEnd:persistDomOrder})));
}
async function persistDomOrder(){
  const now=new Date().toISOString(),updates=[];
  [...els.list.querySelectorAll(":scope > .category")].forEach((group,groupIndex)=>{
    const category=group.dataset.category;
    [...group.querySelectorAll(".item")].forEach((element,itemIndex)=>{
      const old=state.items.find(item=>item.id===element.dataset.id),position=(groupIndex+1)*1000000+(itemIndex+1)*1000;
      if(old&&(old.category!==category||Number(old.position)!==position))updates.push({...old,category,position,updated_at:now});
    });
  });
  if(!updates.length)return;
  state.items=state.items.map(item=>updates.find(update=>update.id===item.id)||item);cacheItems();render();await writeRows("packing_items",updates);setSync(state.pending.length?"offline":"online","Neue Reihenfolge gespeichert");
}
function renderEvents(){
  const icons={created:"＋",packed:"✓",unpacked:"↶",deleted:"×"};
  const verbs={created:"hat ergänzt",packed:"hat eingepackt",unpacked:"hat wieder geöffnet",deleted:"hat gelöscht"};
  els.activityList.innerHTML=state.events.length?state.events.map(event=>`<div class="activity"><span class="activity__icon">${icons[event.action]||"•"}</span><div><strong>${escapeHtml(event.actor||"Unbekannt")} ${verbs[event.action]||"hat geändert"}</strong><span>${escapeHtml(event.item_label)} · ${escapeHtml(event.item_owner)}</span><small>${formatStamp(event.occurred_at)}</small></div></div>`).join(""):`<div class="empty"><span>↻</span><h2>Noch keine Aktivität</h2><p>Änderungen an dieser Reise erscheinen hier.</p></div>`;
}

async function ensureSession(){const {data:{session}}=await db.auth.getSession();if(session)return session;const {data,error}=await db.auth.signInAnonymously();if(error)throw error;return data.session}
async function joinFamily(code,name){
  await ensureSession();const {data,error}=await db.rpc("join_family",{p_code:code,p_display_name:name});if(error)throw error;
  state.familyId=data[0].family_id;state.userName=name;localStorage.setItem("pack-user",name);localStorage.setItem("pack-family",state.familyId);localStorage.setItem("pack-code-ok","1");
}
async function loadTrips(){
  const {data,error}=await db.from("trips").select("*").eq("family_id",state.familyId).eq("is_archived",false).order("start_date",{ascending:false,nullsFirst:false});if(error)throw error;
  state.trips=data;const saved=localStorage.getItem(`pack-trip-${state.familyId}`);state.tripId=data.some(t=>t.id===saved)?saved:data[0]?.id||null;renderTrips();
}
function renderTemplateOptions(){
  const select=$("#tripSource"),selected=select?.value||"current";if(!select)return;
  select.innerHTML=`<option value="current">Aktuelle Liste kopieren</option><option value="empty">Leere Reise</option>${state.templates.map(template=>`<option value="template:${template.id}">Vorlage: ${escapeHtml(template.name)} (${template.items.length})</option>`).join("")}`;
  select.value=[...select.options].some(option=>option.value===selected)?selected:"current";
  $("#templateSummary").textContent=state.templates.length?`${state.templates.length} ${state.templates.length===1?"Vorlage ist":"Vorlagen sind"} für alle verfügbar: ${state.templates.map(template=>`${template.name} (${template.items.length})`).join(", ")}.`:"Noch keine gemeinsame Vorlage gespeichert.";
}
async function loadTemplates(){
  const {data,error}=await db.rpc("get_family_templates",{p_family_id:state.familyId});if(error)throw error;
  state.templates=Array.isArray(data)?data.map(template=>({...template,items:Array.isArray(template.items)?template.items:[]})):[];renderTemplateOptions();
}
async function saveCurrentTemplate(name){
  if(!navigator.onLine)throw new Error("Vorlagen können nur mit Internetverbindung gespeichert werden.");
  const items=activeItems();if(!items.length)throw new Error("Die aktuelle Reise enthält keine Einträge.");
  const now=new Date().toISOString(),template={id:crypto.randomUUID(),family_id:state.familyId,name:name.trim().slice(0,80),created_by:state.userName,created_at:now};
  const {error}=await db.from("packing_templates").insert(template);if(error)throw error;
  const rows=items.map(item=>({id:crypto.randomUUID(),family_id:state.familyId,template_id:template.id,owner:item.owner,category:item.category,label:item.label,position:item.position})),result=await db.from("packing_template_items").insert(rows);
  if(result.error){await db.from("packing_templates").delete().eq("id",template.id);throw result.error}await loadTemplates();return template;
}
async function loadRemoteTrip(){
  if(!state.tripId){state.items=[];state.events=[];render();return}
  const [itemsResult,eventsResult]=await Promise.all([
    db.from("packing_items").select("*").eq("trip_id",state.tripId).order("position"),
    db.from("packing_events").select("*").eq("trip_id",state.tripId).order("occurred_at",{ascending:false}).limit(150)
  ]);
  if(itemsResult.error)throw itemsResult.error;if(eventsResult.error)throw eventsResult.error;
  state.items=itemsResult.data;state.events=eventsResult.data;cacheItems();render();renderEvents();
}
function subscribe(){
  state.channel?.unsubscribe();if(!state.tripId)return;
  state.channel=db.channel(`trip:${state.tripId}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"packing_items",filter:`trip_id=eq.${state.tripId}`},payload=>{
      const row=payload.new?.id?payload.new:payload.old,index=state.items.findIndex(i=>i.id===row.id);
      if(payload.eventType==="DELETE"){if(index>=0)state.items.splice(index,1)}else if(index>=0)state.items[index]=payload.new;else state.items.push(payload.new);
      cacheItems();render();setSync("online",`Live verbunden · ${state.userName}`);
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"packing_events",filter:`trip_id=eq.${state.tripId}`},payload=>{state.events.unshift(payload.new);state.events=state.events.slice(0,150);renderEvents()})
    .subscribe(status=>{if(status==="SUBSCRIBED")setSync("online",`Live verbunden · ${state.userName}`)});
}
async function writeRow(table,row){
  if(!navigator.onLine||!db){state.pending.push({table,row});savePending();setSync("offline",`${state.pending.length} Änderung(en) warten auf Internet`);return false}
  const {error}=await db.from(table).upsert(row,{onConflict:"id"});
  if(error){state.pending.push({table,row});savePending();setSync("offline","Änderung gespeichert – Synchronisierung folgt");return false}
  return true;
}
async function writeRows(table,rows){
  if(!rows.length)return;if(!navigator.onLine||!db){state.pending.push(...rows.map(row=>({table,row})));savePending();setSync("offline",`${state.pending.length} Änderung(en) warten auf Internet`);return}
  for(let index=0;index<rows.length;index+=100){const chunk=rows.slice(index,index+100),{error}=await db.from(table).upsert(chunk,{onConflict:"id"});if(error)state.pending.push(...chunk.map(row=>({table,row})))}
  savePending();if(state.pending.length)setSync("offline",`${state.pending.length} Änderung(en) warten`);
}
async function mutateItem(item){const index=state.items.findIndex(i=>i.id===item.id);if(index>=0)state.items[index]={...state.items[index],...item};else state.items.push(item);cacheItems();render();await writeRow("packing_items",item)}
function parseLabels(value){
  const seen=new Set();
  return String(value||"").split(/[\n,;]+/).map(label=>label.trim()).filter(label=>{const key=label.toLocaleLowerCase("de");if(!label||seen.has(key))return false;seen.add(key);return true})
}
function updateCategorySuggestions(owner){
  const categories=[...new Set(activeItems().filter(i=>i.owner===owner).map(i=>i.category))].sort((a,b)=>a.localeCompare(b,"de"));
  $("#categorySuggestions").innerHTML=categories.map(category=>`<option value="${escapeAttr(category)}">`).join("");
}
function updateAddPreview(){
  const count=parseLabels($("#addLabels").value).length;
  $("#addPreview").textContent=count?`${count} ${count===1?"Gegenstand wird":"Gegenstände werden"} hinzugefügt.`:"Noch keine Gegenstände eingegeben.";
}
function openAddDialog({owner=state.owner,category="",newGroup=false}={}){
  els.addForm.reset();
  $("#addOwner").value=owner;
  $("#addCategory").value=category;
  $("#addTitle").textContent=newGroup?"Neue Gruppe anlegen":category?`Zu „${category}“ ergänzen`:"Mehrere Dinge ergänzen";
  updateCategorySuggestions(owner);updateAddPreview();els.add.showModal();
  setTimeout(()=>$(category?"#addLabels":"#addCategory").focus(),0);
}
async function flushPending(){
  if(!navigator.onLine||!db||!state.pending.length)return;
  const queue=[...state.pending],failed=[];for(const op of queue){const {error}=await db.from(op.table).upsert(op.row,{onConflict:"id"});if(error)failed.push(op)}
  state.pending=failed;savePending();if(!failed.length){await loadTrips();await loadRemoteTrip();setSync("online",`Synchronisiert · ${state.userName}`)}else setSync("offline",`${failed.length} Änderung(en) warten`);
}
async function switchTrip(id){state.tripId=id;localStorage.setItem(`pack-trip-${state.familyId}`,id);loadCache();state.events=[];render();renderEvents();await loadRemoteTrip();subscribe()}

async function createTrip({name,startDate,endDate,copyItems=[]}){
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))?value:null;
  const now=new Date().toISOString(),trip={id:crypto.randomUUID(),family_id:state.familyId,name,start_date:validDate(startDate),end_date:validDate(endDate),is_archived:false,created_by:state.userName,created_at:now};
  state.trips.unshift(trip);await writeRow("trips",trip);
  const items=copyItems.map((source,index)=>{const position=Number(source.position),stamp=Date.parse(source.checked_at)?new Date(source.checked_at).toISOString():now;return {id:crypto.randomUUID(),family_id:state.familyId,trip_id:trip.id,owner:OWNERS.includes(source.owner)?source.owner:"Allgemein",category:String(source.category||"Allgemein").slice(0,80),label:String(source.label||"Eintrag").slice(0,160),done:Boolean(source.done),checked_by:source.done?String(source.checked_by||state.userName).slice(0,50):null,checked_at:source.done?stamp:null,created_by:source._source||"Vorlage",position:Number.isSafeInteger(position)?position:index*10,created_at:now,updated_at:now,deleted_at:null}});
  await writeRows("packing_items",items);state.tripId=trip.id;state.items=items;state.events=[];localStorage.setItem(`pack-trip-${state.familyId}`,trip.id);cacheItems();render();if(navigator.onLine&&db)await loadRemoteTrip();subscribe();return trip;
}
function exportPayload(){
  const includeProgress=$("#includeProgress").checked,trip=currentTrip();return {format:"familien-packliste",version:2,exported_at:new Date().toISOString(),trip:{name:trip.name,start_date:trip.start_date,end_date:trip.end_date},items:activeItems().map(i=>({owner:i.owner,category:i.category,label:i.label,position:i.position,...(includeProgress?{done:i.done,checked_by:i.checked_by,checked_at:i.checked_at}:{done:false})}))};
}
async function exportTrip(){
  const payload=exportPayload(),safeName=currentTrip().name.toLocaleLowerCase("de").replace(/[^a-z0-9äöü]+/gi,"-").replace(/^-|-$/g,"")||"packliste",file=new File([JSON.stringify(payload,null,2)],`${safeName}.json`,{type:"application/json"});
  if(navigator.canShare?.({files:[file]})){try{await navigator.share({title:`Packliste ${currentTrip().name}`,files:[file]});showDataMessage("Export wurde zum Teilen vorbereitet.");return}catch(error){if(error.name==="AbortError")return}}
  const url=URL.createObjectURL(file),link=document.createElement("a");link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showDataMessage("Packliste wurde als JSON-Datei exportiert.");
}
async function importTrip(file){
  const data=JSON.parse(await file.text());if(data?.format!=="familien-packliste"||![1,2].includes(Number(data.version))||!Array.isArray(data.items))throw new Error("Diese Datei ist keine gültige Familien-Packliste.");if(data.items.length>2000)throw new Error("Die Datei enthält zu viele Einträge.");
  const imported=data.items.filter(i=>i&&OWNERS.includes(i.owner)&&i.label&&i.category).map(i=>({...i,_source:"Import"}));if(!imported.length)throw new Error("In der Datei wurden keine gültigen Einträge gefunden.");
  const trip=await createTrip({name:`${String(data.trip?.name||"Importierte Reise").slice(0,70)} (Import)`,startDate:data.trip?.start_date,endDate:data.trip?.end_date,copyItems:imported});await loadRemoteTrip();showDataMessage(`${imported.length} Einträge als „${trip.name}“ importiert.`);
}

async function boot(){
  render();$("#addOwner").innerHTML=OWNERS.map(o=>`<option>${o}</option>`).join("");
  if(!configured){setSync("offline","Demo-Modus: Supabase noch nicht eingerichtet");els.login.showModal();return}
  try{await ensureSession();state.familyId=localStorage.getItem("pack-family");if(!state.familyId||!state.userName||!localStorage.getItem("pack-code-ok")){els.login.showModal();return}await loadTrips();await loadTemplates();loadCache();render();await loadRemoteTrip();subscribe();await flushPending();els.userButton.querySelector("span").textContent=state.userName}catch(error){console.error(error);loadCache();render();setSync("offline","Offline – lokaler Stand wird angezeigt")}
}

els.tabs.addEventListener("click",event=>{const button=event.target.closest("[data-owner]");if(!button)return;state.owner=button.dataset.owner;render()});
els.search.addEventListener("input",event=>{state.query=event.target.value;render()});els.filter.addEventListener("change",event=>{state.filter=event.target.value;render()});
els.tripSelect.addEventListener("change",event=>switchTrip(event.target.value));
els.list.addEventListener("change",event=>{if(!event.target.matches('input[type="checkbox"]'))return;const id=event.target.closest(".item").dataset.id,old=state.items.find(i=>i.id===id),now=new Date().toISOString();mutateItem({...old,done:event.target.checked,checked_by:state.userName,checked_at:now,updated_at:now})});
let deleteTarget=null;els.list.addEventListener("click",event=>{
  const dragHandle=event.target.closest(".drag-handle"),addGroup=event.target.closest(".group-add"),removeGroup=event.target.closest(".group-delete"),removeItem=event.target.closest(".delete");
  if(dragHandle){event.preventDefault();event.stopPropagation();return}
  if(addGroup){openAddDialog({owner:state.owner,category:addGroup.dataset.category});return}
  if(removeGroup){const category=removeGroup.dataset.category,count=activeItems().filter(i=>i.owner===state.owner&&i.category===category).length;deleteTarget={type:"group",owner:state.owner,category};$("#confirmTitle").textContent="Ganze Gruppe löschen?";$("#confirmText").textContent=`„${category}“ mit ${count} ${count===1?"Eintrag":"Einträgen"} wird für alle entfernt.`;els.confirm.showModal();return}
  if(removeItem){const id=removeItem.closest(".item").dataset.id;deleteTarget={type:"item",id};$("#confirmTitle").textContent="Eintrag löschen?";$("#confirmText").textContent=`„${state.items.find(i=>i.id===id)?.label}“ wird für alle entfernt.`;els.confirm.showModal()}
});
$("#confirmDelete").addEventListener("click",async()=>{
  if(!deleteTarget)return;const now=new Date().toISOString();
  if(deleteTarget.type==="item"){const old=state.items.find(i=>i.id===deleteTarget.id);if(old)await mutateItem({...old,checked_by:state.userName,checked_at:now,deleted_at:now,updated_at:now})}
  else{const rows=activeItems().filter(i=>i.owner===deleteTarget.owner&&i.category===deleteTarget.category).map(item=>({...item,checked_by:state.userName,checked_at:now,deleted_at:now,updated_at:now}));state.items=state.items.map(item=>rows.find(row=>row.id===item.id)||item);cacheItems();render();await writeRows("packing_items",rows);setSync(state.pending.length?"offline":"online",`${rows.length} ${rows.length===1?"Eintrag":"Einträge"} aus „${deleteTarget.category}“ entfernt`)}
  deleteTarget=null;
});
$("#addButton").addEventListener("click",()=>openAddDialog());
$("#addGroupButton").addEventListener("click",()=>openAddDialog({newGroup:true}));
$("#addOwner").addEventListener("change",event=>updateCategorySuggestions(event.target.value));
$("#addLabels").addEventListener("input",updateAddPreview);
document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>button.closest("dialog").close()));
els.addForm.addEventListener("submit",async event=>{
  event.preventDefault();if(!state.tripId)return;
  const labels=parseLabels($("#addLabels").value),owner=$("#addOwner").value,category=$("#addCategory").value.trim(),button=event.submitter;
  if(labels.length>50){$("#addLabels").setCustomValidity("Bitte höchstens 50 Gegenstände auf einmal hinzufügen.");$("#addLabels").reportValidity();return}$("#addLabels").setCustomValidity("");
  if(!labels.length||!category)return;
  const now=new Date().toISOString(),base=Date.now()*100,rows=labels.map((label,index)=>({id:crypto.randomUUID(),family_id:state.familyId,trip_id:state.tripId,owner,category,label:label.slice(0,160),done:false,checked_by:null,checked_at:null,created_by:state.userName,position:base+index,created_at:now,updated_at:now,deleted_at:null})),pendingBefore=state.pending.length;
  if(button)button.disabled=true;state.items.push(...rows);cacheItems();render();await writeRows("packing_items",rows);els.add.close();setSync(state.pending.length>pendingBefore?"offline":"online",`${rows.length} ${rows.length===1?"Gegenstand":"Gegenstände"} zu „${category}“ hinzugefügt`);if(button)button.disabled=false;
});
els.loginForm.addEventListener("submit",async event=>{event.preventDefault();els.loginError.hidden=true;const button=event.submitter;button.disabled=true;button.textContent="Wird verbunden …";try{await joinFamily($("#familyCode").value,$("#loginName").value);await loadTrips();await loadTemplates();await loadRemoteTrip();subscribe();els.login.close();els.userButton.querySelector("span").textContent=state.userName}catch(error){els.loginError.textContent=error.message.includes("Ungültiger")?error.message:"Verbindung fehlgeschlagen. Bitte Code und Internet prüfen.";els.loginError.hidden=false}finally{button.disabled=false;button.textContent="Gemeinsame Liste öffnen"}});
els.userButton.addEventListener("click",()=>{localStorage.removeItem("pack-code-ok");els.login.showModal()});
$("#activityButton").addEventListener("click",()=>{renderEvents();els.activity.showModal()});$("#dataButton").addEventListener("click",()=>{els.dataMessage.hidden=true;renderTemplateOptions();els.data.showModal()});
$("#saveTemplateButton").addEventListener("click",async event=>{const button=event.currentTarget,input=$("#templateName"),name=input.value.trim();if(!name){input.setCustomValidity("Bitte einen Namen für die Vorlage eingeben.");input.reportValidity();input.focus();return}input.setCustomValidity("");button.disabled=true;try{const template=await saveCurrentTemplate(name);input.value="";showDataMessage(`Vorlage „${template.name}“ mit ${activeItems().length} Einträgen gespeichert.`)}catch(error){showDataMessage(error.message,true)}finally{button.disabled=false}});
els.tripForm.addEventListener("submit",async event=>{event.preventDefault();const button=event.submitter,sourceValue=$("#tripSource").value;let source=[];if(sourceValue==="current")source=activeItems().map(i=>({...i,done:false,checked_by:null,checked_at:null}));else if(sourceValue.startsWith("template:")){const template=state.templates.find(entry=>entry.id===sourceValue.slice(9));source=(template?.items||[]).map(item=>({...item,done:false,checked_by:null,checked_at:null,_source:"Vorlage"}))}if(button)button.disabled=true;try{const trip=await createTrip({name:$("#tripName").value.trim(),startDate:$("#tripStart").value,endDate:$("#tripEnd").value,copyItems:source});els.tripForm.reset();renderTemplateOptions();els.data.close();setSync("online",`„${trip.name}“ wurde erstellt`)}catch(error){showDataMessage(error.message,true)}finally{if(button)button.disabled=false}});
$("#exportButton").addEventListener("click",()=>exportTrip().catch(error=>showDataMessage(error.message,true)));$("#importButton").addEventListener("click",()=>$("#importFile").click());$("#importFile").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{await importTrip(file)}catch(error){showDataMessage(error.message,true)}finally{event.target.value=""}});
window.addEventListener("online",flushPending);window.addEventListener("offline",()=>setSync("offline","Offline – Änderungen werden vorgemerkt"));if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));boot();

