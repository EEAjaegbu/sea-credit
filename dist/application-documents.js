'use strict';
async function loadDocuments(application) {
  const target=document.querySelector('#application-documents');
  if(!target) return;
  target.innerHTML='<p role="status">Checking attached documents…</p>';
  try {
    const groups=await Promise.all(documentTypes.map(async ([category,label,min])=>{
      const prefix=`${application.userId}/${application.id}/${category}`;
      const {data,error}=await supabaseClient.storage.from('application-documents').list(prefix,{limit:100,sortBy:{column:'created_at',order:'asc'}});
      if(error) throw error;
      return {category,label,min,files:(data||[]).filter(f=>f.id),prefix};
    }));
    if(!target.isConnected || state.selected?.id!==application.id) return;
    const editable=state.user.role==='customer'&&['submitted','needs_information'].includes(application.status);
    const complete=groups.every(g=>g.files.length>=g.min);
    target.innerHTML=`<p class="${complete?'':'review-note'}">${complete?'All document categories have files attached. A reviewer still needs to check their contents.':'Documents are incomplete. Your application is saved; add the missing files below.'}</p><p class="small">Sample files only. PDF, JPEG or PNG, up to 5 MB each. Maximum 10 files in each upload. Documents can be added or removed while Submitted or Information needed.</p>${groups.map(g=>`<section class="document-category"><h4>${g.label}</h4><p class="small">${g.files.length} attached · ${g.min} required</p><ul>${g.files.map((f,i)=>`<li><button class="textbtn" type="button" data-action="open-document" data-path="${esc(g.prefix+'/'+f.name)}">${g.label} ${i+1} (${esc(f.name.split('.').at(-1).toUpperCase())}) ↗</button>${editable?` <button class="textbtn danger-text" type="button" data-action="remove-document" data-path="${esc(g.prefix+'/'+f.name)}">Remove</button>`:''}</li>`).join('')}</ul>${editable?`<form class="document-upload" data-category="${g.category}"><label for="file-${g.category}">Add ${g.label.toLowerCase()}</label><input id="file-${g.category}" type="file" accept="application/pdf,image/jpeg,image/png" multiple required><div data-error class="form-error" role="alert" hidden tabindex="-1"></div><button class="btn light" type="submit">Upload</button><span class="small" data-progress role="status"></span></form>`:''}</section>`).join('')}`;
  } catch(error) {
    if(target.isConnected) target.innerHTML=`<div role="alert" class="form-error">Documents could not load. ${esc(error.message)}. The project owner should check that supabase/migrations/003-private-documents.sql has been applied.</div><button class="btn light" data-action="reload-documents">Retry documents</button>`;
  }
}
async function validateDocument(file){
  if(file.size===0||file.size>5*1024*1024) throw new Error('Each file must be non-empty and no larger than 5 MB.');
  const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
  const pdf=bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  const kind=pdf?['pdf','application/pdf']:jpeg?['jpg','image/jpeg']:png?['png','image/png']:null;
  if(!kind||file.type!==kind[1]) throw new Error('Use valid PDF, JPEG or PNG files. Renaming a file does not convert its format.');
  return kind;
}
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!form.matches('.document-upload')) return;
  event.preventDefault();
  if(form.dataset.busy) return;
  const application=state.selected,button=form.querySelector('button'),errorBox=form.querySelector('[data-error]'),progress=form.querySelector('[data-progress]');
  const files=Array.from(form.querySelector('input').files);
  form.dataset.busy='true';button.disabled=true;errorBox.hidden=true;
  let uploaded=0;
  try{
    if(!files.length||files.length>10) throw new Error('Choose 1–10 files per upload.');
    const kinds=await Promise.all(files.map(validateDocument));
    for(let i=0;i<files.length;i++){
      progress.textContent=`Uploading ${i+1} of ${files.length}…`;
      const path=`${application.userId}/${application.id}/${form.dataset.category}/${crypto.randomUUID()}.${kinds[i][0]}`;
      const {error}=await supabaseClient.storage.from('application-documents').upload(path,files[i],{contentType:kinds[i][1],upsert:false});
      if(error) throw error;
      uploaded++;
    }
    toast('Documents uploaded.');await loadDocuments(application);
  }catch(error){
    progress.textContent='';errorBox.textContent=`${error.message}${uploaded?` ${uploaded} file(s) already uploaded. Refresh the document list before selecting only the remaining files.`:''}`;errorBox.hidden=false;errorBox.focus();
  }finally{delete form.dataset.busy;button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if(!button||!['open-document','remove-document','reload-documents'].includes(button.dataset.action)) return;
  button.disabled=true;
  try{
    if(button.dataset.action==='reload-documents') return await loadDocuments(state.selected);
    const bucket=supabaseClient.storage.from('application-documents');
    if(button.dataset.action==='open-document') {
      const {data,error}=await bucket.createSignedUrl(button.dataset.path,60,{download:true});
      if(error) throw error;
      const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Download file (link expires in 60 seconds)';
      show('<h2>Your document is ready</h2><p>This private download link expires shortly.</p>');modal.appendChild(link);
    }else{
      if(!window.confirm('Remove this attachment? You can upload a replacement while the application is open for changes.')) return;
      const {error}=await bucket.remove([button.dataset.path]);if(error) throw error;
      await loadDocuments(state.selected);
    }
  }catch(error){toast(error.message);}finally{button.disabled=false;}
});
