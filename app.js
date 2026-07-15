const OWNERS=["Allgemein","Marc","Nici","Nils","Lou","Laila"];
const state={items:[],trips:[],events:[],owner:"Allgemein",filter:"all",query:"",familyId:null,tripId:null,userName:localStorage.getItem("pack-user")||"",channel:null,pending:JSON.parse(localStorage.getItem("pack-pending-v2")||"[]").filter(x=>x?.table&&x?.row)};
const $=selector=>document.querySelector(selector);
const cfg=window.APP_CONFIG||{};
const configured=cfg.supabaseUrl&&!cfg.supabaseUrl.startsWith("REPLACE_");
const db=configured&&window.supabase?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
const els={tabs:$("#ownerTabs"),list:$("#list"),search:$("#searchInput"),filter:$("#statusFilter"),sync:$("#syncBanner"),overallBar:$("#overallBar"),overallPercent:$("#overallPercent"),overallLabel:$("#overallLabel"),userButton:$("#userButton"),login:$("#loginDialog"),loginForm:$("#loginForm"),loginError:$("#loginError"),add:$("#addDialog"),addForm:$("#addForm"),confirm:$("#confirmDialog"),tripSelect:$("#tripSelect"),activity:$("#activityDialog"),activityList:$("#activityList"),data:$("#dataDialog"),tripForm:$("#tripForm"),dataMessage:$("#dataMessage")};

function escapeHtml(value){const d=document.createElement("div");d.textContent=value??"";return d.innerHTML}
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
  const rows=active.filter(i=>i.owner===state.owner&&(state.filter==="all"||(state.filter==="done"?i.done:!i.done))&&(!q||`${i.label} ${i.category}`.toLocaleLowerCase("de").includes(q)));
  const groups=rows.reduce((result,item)=>((result[item.category]??=[]).push(item),result),{});
  els.list.innerHTML=Object.keys(groups).length?Object.entries(groups).sort(([a],[b])=>a.localeCompare(b,"de")).map(([category,items])=>{
    const n=items.filter(i=>i.done).length;
    return `<details class="category" open><summary><span>${escapeHtml(category)}</span><span class="meta">${n}/${items.length}</span></summary><div class="items">${items.sort((a,b)=>(a.position??0)-(b.position??0)||a.label.localeCompare(b.label,"de")).map(item=>`<div class="item ${item.done?"done":""}" data-id="${item.id}"><input type="checkbox" ${item.done?"checked":""} aria-label="${escapeHtml(item.label)} abhaken"><div><div class="item__label">${escapeHtml(item.label)}</div>${item.checked_by?`<div class="item__by">${item.done?"Eingepackt":"Wieder geöffnet"} von ${escapeHtml(item.checked_by)} · ${formatStamp(item.checked_at||item.updated_at)}</div>`:""}</div><button class="delete" aria-label="${escapeHtml(item.label)} löschen">×</button></div>`).join("")}</div></details>`}).join(""):$("#emptyTemplate").innerHTML;
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
  try{await ensureSession();state.familyId=localStorage.getItem("pack-family");if(!state.familyId||!state.userName||!localStorage.getItem("pack-code-ok")){els.login.showModal();return}await loadTrips();loadCache();render();await loadRemoteTrip();subscribe();await flushPending();els.userButton.querySelector("span").textContent=state.userName}catch(error){console.error(error);loadCache();render();setSync("offline","Offline – lokaler Stand wird angezeigt")}
}

els.tabs.addEventListener("click",event=>{const button=event.target.closest("[data-owner]");if(!button)return;state.owner=button.dataset.owner;render()});
els.search.addEventListener("input",event=>{state.query=event.target.value;render()});els.filter.addEventListener("change",event=>{state.filter=event.target.value;render()});
els.tripSelect.addEventListener("change",event=>switchTrip(event.target.value));
els.list.addEventListener("change",event=>{if(!event.target.matches('input[type="checkbox"]'))return;const id=event.target.closest(".item").dataset.id,old=state.items.find(i=>i.id===id),now=new Date().toISOString();mutateItem({...old,done:event.target.checked,checked_by:state.userName,checked_at:now,updated_at:now})});
let deleteId=null;els.list.addEventListener("click",event=>{if(!event.target.closest(".delete"))return;deleteId=event.target.closest(".item").dataset.id;$("#confirmText").textContent=`„${state.items.find(i=>i.id===deleteId)?.label}“ wird für alle entfernt.`;els.confirm.showModal()});
$("#confirmDelete").addEventListener("click",()=>{const old=state.items.find(i=>i.id===deleteId),now=new Date().toISOString();if(old)mutateItem({...old,checked_by:state.userName,checked_at:now,deleted_at:now,updated_at:now})});
$("#addButton").addEventListener("click",()=>{$("#addOwner").value=state.owner;const cats=[...new Set(state.items.filter(i=>i.owner===state.owner).map(i=>i.category))];$("#categorySuggestions").innerHTML=cats.map(c=>`<option value="${escapeHtml(c)}">`).join("");els.add.showModal()});
document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>button.closest("dialog").close()));
els.addForm.addEventListener("submit",event=>{event.preventDefault();if(!state.tripId)return;const now=new Date().toISOString();mutateItem({id:crypto.randomUUID(),family_id:state.familyId,trip_id:state.tripId,owner:$("#addOwner").value,category:$("#addCategory").value.trim(),label:$("#addLabel").value.trim(),done:false,checked_by:null,checked_at:null,created_by:state.userName,position:Date.now(),created_at:now,updated_at:now,deleted_at:null});els.addForm.reset();els.add.close()});
els.loginForm.addEventListener("submit",async event=>{event.preventDefault();els.loginError.hidden=true;const button=event.submitter;button.disabled=true;button.textContent="Wird verbunden …";try{await joinFamily($("#familyCode").value,$("#loginName").value);await loadTrips();await loadRemoteTrip();subscribe();els.login.close();els.userButton.querySelector("span").textContent=state.userName}catch(error){els.loginError.textContent=error.message.includes("Ungültiger")?error.message:"Verbindung fehlgeschlagen. Bitte Code und Internet prüfen.";els.loginError.hidden=false}finally{button.disabled=false;button.textContent="Gemeinsame Liste öffnen"}});
els.userButton.addEventListener("click",()=>{localStorage.removeItem("pack-code-ok");els.login.showModal()});
$("#activityButton").addEventListener("click",()=>{renderEvents();els.activity.showModal()});$("#dataButton").addEventListener("click",()=>{els.dataMessage.hidden=true;els.data.showModal()});
els.tripForm.addEventListener("submit",async event=>{event.preventDefault();const button=event.submitter,source=$("#copyCurrent").checked?activeItems().map(i=>({...i,done:false,checked_by:null,checked_at:null})):[];if(button)button.disabled=true;try{const trip=await createTrip({name:$("#tripName").value.trim(),startDate:$("#tripStart").value,endDate:$("#tripEnd").value,copyItems:source});els.tripForm.reset();$("#copyCurrent").checked=true;els.data.close();setSync("online",`„${trip.name}“ wurde erstellt`)}catch(error){showDataMessage(error.message,true)}finally{if(button)button.disabled=false}});
$("#exportButton").addEventListener("click",()=>exportTrip().catch(error=>showDataMessage(error.message,true)));$("#importButton").addEventListener("click",()=>$("#importFile").click());$("#importFile").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{await importTrip(file)}catch(error){showDataMessage(error.message,true)}finally{event.target.value=""}});
window.addEventListener("online",flushPending);window.addEventListener("offline",()=>setSync("offline","Offline – Änderungen werden vorgemerkt"));if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));boot();
