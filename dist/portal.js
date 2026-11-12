'use strict';

const state = { user: null, csrfToken: null, applications: [], selected: null, statusFilter: '', search: '', afterAuth: 'portal', routeVersion: 0 };
const labels = { submitted: 'Submitted', under_review: 'Under review', needs_information: 'Information needed', approved: 'Approved · test', declined: 'Declined', cancelled: 'Withdrawn' };
const productNames = { salary_advance: 'Salary advance', personal_credit: 'Personal credit' };
const reviewTransitions = { submitted: ['under_review','needs_information','approved','declined'], under_review: ['needs_information','approved','declined'], needs_information: ['under_review','approved','declined'], approved: [], declined: [], cancelled: [] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const when = value => new Intl.DateTimeFormat('en-NG', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Lagos' }).format(new Date(value));
const badge = status => `<span class="badge status-${esc(status)}">${esc(labels[status] || status)}</span>`;

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
  } catch { throw new Error('Cannot reach the server. Check that npm run dev is running, then try again.'); }
  const data = await response.json().catch(() => ({ error: 'The backend is unavailable. Run this project with npm run dev, not a static file preview.' }));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    if (response.status === 401) { state.user = null; state.csrfToken = null; }
    throw error;
  }
  return data;
}
function go(route) {
  if (location.hash === `#${route}`) renderRoute();
  else location.hash = route;
}
function errorMessage(error, form) {
  if (error.status === 401) {
    state.afterAuth = 'portal';
    go('login');
    toast('Your session ended. Please sign in again.');
    return;
  }
  const target = form?.querySelector('[data-error]') || document.querySelector('#page-error');
  if (target) { target.textContent = error.message; target.hidden = false; target.focus(); }
  else toast(error.message);
}
function show(content) {
  modal.innerHTML = '<button class="close" aria-label="Close dialog" data-action="close">×</button>' + content;
  if (!modal.open) modal.showModal();
}
function authPage(mode = 'login') {
  const register = mode === 'register';
  app.innerHTML = `<div class="wrap"><header>${brand}<a class="textbtn" href="#">← Back to website</a></header><main class="auth-layout"><div class="auth-story"><div class="eyebrow">Your next chapter</div><h1>A little support.<br>A clearer way<br><em>forward.</em></h1><p>Apply, follow your progress, and hear from your reviewer. Your Sea Credit journey starts here.</p><div class="auth-benefits"><p>01 &nbsp; Your own account</p><p>02 &nbsp; Applications that stay saved</p><p>03 &nbsp; Clear review updates</p></div></div><section class="auth-card"><div class="eyebrow">${register ? 'Welcome to Sea Credit' : 'Good to see you'}</div><h2>${register ? 'Create a test account' : 'Sign in to your account'}</h2><p class="small">Development testing only. Use fictional details and a unique test password.</p><form id="auth-form" data-mode="${mode}">${register ? '<label for="auth-name">Full name</label><input id="auth-name" name="name" autocomplete="name" minlength="2" maxlength="100" required placeholder="e.g. Ada Test">' : ''}<label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="username" maxlength="254" required placeholder="you@example.test"><label for="auth-password">Password</label><div class="password-field"><input id="auth-password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required aria-describedby="password-hint"><button type="button" data-action="toggle-password" aria-label="Show password">Show</button></div><p class="small" id="password-hint">At least 12 characters. Passwords are stored as salted hashes.</p>${register ? '<label class="checkbox-label"><input name="testConsent" type="checkbox" required> I am creating a test account with fictional details.</label>' : ''}<div class="form-error" data-error hidden role="alert" tabindex="-1"></div><button class="btn full-width" type="submit">${register ? 'Create account' : 'Sign in'} →</button></form><p class="auth-switch">${register ? 'Already have an account? <a href="#login">Sign in</a>' : 'New to Sea Credit? <a href="#register">Create an account</a>'}</p><p class="small">Email verification and password recovery are not connected in this test build. Administrators use the same sign-in form.</p></section></main></div>`;
}
function shell(active, content) {
  const admin = state.user.role === 'admin';
  const links = admin ? [['portal','▦','Overview'],['applications','▧','Review applications'],['profile','◎','Your details']] : [['portal','▦','Overview'],['applications','▧','My applications'],['apply','＋','New application'],['profile','◎','Your details'],['support','♡','Support']];
  const initials = state.user.name.split(/\s+/).slice(0,2).map(s=>s[0]).join('');
  app.innerHTML = `<div class="portal"><aside class="sidebar">${brand}<div class="role-label">${admin ? 'REVIEWER WORKSPACE' : 'CLIENT WORKSPACE'}</div><nav class="side-links" aria-label="Account navigation">${links.map(([route, icon, title])=>`<a class="${active === route ? 'active' : ''}" ${active === route ? 'aria-current="page"' : ''} href="#${route}">${icon} &nbsp; ${title}</a>`).join('')}</nav><div class="side-bottom"><p class="small" style="color:#d6e4ff">A little support.<br>A bigger tomorrow.</p><a href="#" class="btn white">← Back to website</a></div></aside><main class="portal-main"><div class="portal-top"><span>${admin ? 'Reviewer' : 'Client'} portal</span><div class="account-menu"><span class="avatar">${esc(initials)}</span><span>${esc(state.user.name)}</span><button class="textbtn" data-action="logout">Sign out ↗</button></div></div><div class="demo">Test environment · Use fictional information. Approval records a test decision only; no loan is issued or paid out.</div><div id="page-error" class="form-error" hidden role="alert" tabindex="-1"></div>${content}</main></div>`;
}
function applicationRows(entries, compact = false) {
  if (!entries.length) return `<div class="empty"><div class="empty-symbol">▧</div><h3>${state.statusFilter || state.search ? 'No matching applications' : 'Your next step starts here'}</h3><p>${state.statusFilter || state.search ? 'Try a different status or search term.' : state.user.role === 'admin' ? 'Submitted customer applications will appear here for review.' : 'Submit your first test application and follow every update from this workspace.'}</p>${state.user.role === 'customer' && !state.statusFilter && !state.search ? '<a class="btn" href="#apply">Start an application ↗</a>' : ''}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Application</th>${state.user.role === 'admin' ? '<th>Applicant</th>' : ''}<th>Requested</th><th>Status</th>${compact ? '' : '<th>Updated · Lagos</th>'}<th><span class="sr-only">Details</span></th></tr></thead><tbody>${entries.map(a=>`<tr><td><b>${esc(productNames[a.product])}</b><small class="cell-detail">${esc(a.reference)}</small></td>${state.user.role === 'admin' ? `<td>${esc(a.applicantName)}<small class="cell-detail">${esc(a.applicantEmail)}</small></td>` : ''}<td>${money(a.amount)}<small class="cell-detail">${a.termMonths} months requested</small></td><td>${badge(a.status)}</td>${compact ? '' : `<td>${when(a.updatedAt)}</td>`}<td><a class="textbtn" href="#application/${a.id}">${state.user.role === 'admin' ? 'Review' : 'View'} ↗</a></td></tr>`).join('')}</tbody></table></div>`;
}
function overview() {
  const all = state.applications;
  const pending = all.filter(a=>['submitted','under_review'].includes(a.status)).length;
  const awaiting = all.filter(a=>a.status === 'needs_information').length;
  const approved = all.filter(a=>a.status === 'approved').length;
  const admin = state.user.role === 'admin';
  state.statusFilter = ''; state.search = '';
  shell('portal', `<div class="welcome"><div><div class="eyebrow">${admin ? 'The review desk' : 'Your account at a glance'}</div><h1>${admin ? 'Every application, a clear next step.' : `Welcome back, ${esc(state.user.name.split(' ')[0])}.`}</h1><p>${admin ? 'Review customer requests and keep applicants informed.' : 'Keep track of your applications and the next steps to take.'}</p></div>${admin ? '<button class="btn light" data-action="refresh">Refresh ↻</button>' : '<a class="btn" href="#apply">+ New application</a>'}</div><div class="stats"><div class="stat"><small>${admin ? 'Awaiting review' : 'In progress'}</small><strong>${pending}</strong><span>Submitted or under review</span></div><div class="stat"><small>Information needed</small><strong>${awaiting}</strong><span>${admin ? 'Awaiting a customer response' : 'Applications requiring your response'}</span></div><div class="stat"><small>Approved for testing</small><strong>${approved}</strong><span>Not disbursed · no active loan balance</span></div></div><div class="panel"><div class="panel-head"><h3>Recent applications</h3><a class="textbtn" href="#applications">View all →</a></div>${applicationRows(all.slice(0,5),true)}</div><div class="next-step-note"><b>What happens after review?</b><p>For this milestone, the reviewer records a decision and a message. Loan offers, document uploads, disbursements, and repayment collection will be added separately.</p></div>`);
}
function listApplications() {
  shell('applications', `<div class="welcome"><div><h1>${state.user.role === 'admin' ? 'Review applications' : 'My applications'}</h1><p>Follow each request from submission to a review decision.</p></div><button class="btn light" data-action="refresh">Refresh ↻</button></div><div class="filter-bar"><div><label for="status-filter">Status</label><select id="status-filter"><option value="">All statuses</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${state.statusFilter===k?'selected':''}>${v}</option>`).join('')}</select></div><div><label for="application-search">Search applications</label><input id="application-search" type="search" value="${esc(state.search)}" placeholder="Reference${state.user.role==='admin'?', name or email':''}"></div></div><div class="panel" id="application-list"></div>`);
  filterApplications();
}
function filterApplications() {
  const search = state.search.toLowerCase();
  const entries = state.applications.filter(a=>(!state.statusFilter || a.status === state.statusFilter) && `${a.reference} ${a.applicantName} ${a.applicantEmail} ${productNames[a.product]}`.toLowerCase().includes(search));
  document.querySelector('#application-list').innerHTML = applicationRows(entries);
}
function applicationForm(existing) {
  if (state.user.role !== 'customer') return shell('applications','<div class="panel"><h2>Customer applications</h2><p>Reviewer accounts cannot submit applications. Sign in with a customer account to test submission.</p></div>');
  const values = existing || { product:'salary_advance', amount, termMonths:months, phone:state.user.phone, address:state.user.address, employmentType:'salaried' };
  const input = (name,label,type='text',attrs='') => `<div><label for="application-${name}">${label}</label><input id="application-${name}" name="${name}" type="${type}" value="${esc(values[name] || '')}" required ${attrs}></div>`;
  const select = (name,label,options) => `<div><label for="application-${name}">${label}</label><select id="application-${name}" name="${name}">${options.map(([v,l])=>`<option value="${v}" ${String(values[name])===String(v)?'selected':''}>${l}</option>`).join('')}</select></div>`;
  shell('apply', `<a class="textbtn" href="${existing ? '#application/'+existing.id : '#applications'}">← ${existing ? 'Back to application' : 'My applications'}</a><div class="form-heading"><div class="eyebrow">${existing ? 'Keep your request moving' : 'Take the next step'}</div><h1>${existing ? 'Update your application' : 'Tell us what you need.'}</h1><p>Your application will be saved and sent to the test reviewer.</p></div>${existing ? `<div class="review-note"><b>Your reviewer asked:</b><p>${esc(existing.history.at(-1).note)}</p></div>` : ''}<form id="application-form" class="panel application-form" data-id="${existing?.id || ''}" data-version="${existing?.version || ''}" data-request-id="${crypto.randomUUID()}"><h3>01 &nbsp; Your request</h3><div class="form-grid">${select('product','Product',Object.entries(productNames))}${input('amount','Requested amount (₦)','number','min="50000" max="1000000" step="1"')}${select('termMonths','Requested period',[ [1,'1 month'],[3,'3 months'],[6,'6 months'] ])}<div class="field-note">Test limits: ₦50,000–₦1,000,000 and 1, 3, or 6 months. These are not confirmed lending terms. No rate or repayment obligation is agreed here.</div></div><h3>02 &nbsp; Contact details</h3><div class="form-grid">${input('phone','Phone number','tel','minlength="7" maxlength="20" autocomplete="tel"')}${input('address','Residential address','text','minlength="5" maxlength="300" autocomplete="street-address"')}</div><h3>03 &nbsp; Employment and purpose</h3><div class="form-grid">${select('employmentType','Employment status',[['salaried','Salaried employee'],['self_employed','Self-employed'],['other','Other']])}${input('employer','Employer or business name','text','minlength="2" maxlength="120"')}${input('jobTitle','Job title','text','minlength="2" maxlength="100"')}${input('monthlyIncome','Monthly income (₦)','number','min="1" max="100000000" step="1"')}<div class="full"><label for="application-purpose">What will you use this for?</label><textarea id="application-purpose" name="purpose" minlength="10" maxlength="1000" rows="3" required>${esc(values.purpose || '')}</textarea></div>${existing ? '<div class="full"><label for="review-response">Response to the reviewer</label><textarea id="review-response" name="note" minlength="5" maxlength="2000" rows="3" required></textarea></div>' : ''}</div><label class="checkbox-label"><input name="testConsent" type="checkbox" required> I confirm this is fictional test information. I understand this does not create a loan or trigger a payment.</label><div data-error class="form-error" role="alert" tabindex="-1" hidden></div><div class="form-actions"><button type="submit" class="btn">${existing ? 'Resubmit application' : 'Submit test application'} →</button><a class="textbtn" href="#applications">Cancel</a></div><p class="small">Submitted details are visible to the administrator of this test instance. Do not enter BVN, NIN, card details, or real customer records.</p></form>`);
}
function detail(application) {
  state.selected = application;
  const a = application, admin = state.user.role === 'admin';
  const transitions = reviewTransitions[a.status];
  const info = (label,value) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  shell('applications', `<a class="textbtn" href="#applications">← All applications</a><div class="welcome"><div><h1>${esc(productNames[a.product])}</h1><p>${esc(a.reference)} · Submitted ${when(a.createdAt)}</p></div>${badge(a.status)}</div>${a.status==='approved'?'<div class="review-note"><b>Test review approved</b><p>This records the reviewer’s test decision. No loan agreement, repayment schedule, or disbursement has been created.</p></div>':''}<div class="detail-layout"><div><div class="panel"><h3>Application details</h3><dl class="detail-grid">${info('Applicant',a.applicantName)}${info('Email',a.applicantEmail)}${info('Requested amount',money(a.amount))}${info('Requested period',`${a.termMonths} months`)}${info('Phone',a.phone)}${info('Address',a.address)}${info('Employment',a.employmentType.replaceAll('_',' '))}${info('Employer',a.employer)}${info('Job title',a.jobTitle)}${info('Monthly income',money(a.monthlyIncome))}</dl><h4>Purpose</h4><p class="user-text">${esc(a.purpose)}</p></div><div class="panel"><div class="panel-head"><h3>Application history</h3><button class="textbtn" data-action="refresh">Refresh ↻</button></div><ol class="timeline">${[...a.history].reverse().map(h=>`<li><div class="panel-head">${badge(h.status)}<small>${when(h.at)}</small></div><p class="user-text">${esc(h.note)}</p><small>${h.actorRole==='admin'?'Reviewer':'Customer'}</small></li>`).join('')}</ol></div></div><aside><div class="panel decision-panel"><div class="eyebrow">${admin ? 'Review desk' : 'Your next step'}</div><h3>${admin ? 'Record a review update' : labels[a.status]}</h3>${admin && transitions.length ? `<form id="review-form" data-id="${a.id}" data-version="${a.version}"><label for="review-status">New status</label><select id="review-status" name="status" required><option value="" selected disabled>Select an update</option>${transitions.map(s=>`<option value="${s}">${labels[s]}</option>`).join('')}</select><label for="review-note">Message to the customer</label><textarea id="review-note" name="note" rows="5" minlength="5" maxlength="2000" required placeholder="Explain the next step or your test decision."></textarea><p class="small">This message is visible to the customer. Decisions are manual; the system does not assess creditworthiness.</p><div data-error class="form-error" role="alert" tabindex="-1" hidden></div><button class="btn full-width" type="submit">Save review update</button></form>` : admin ? '<p>This application is closed. Its decision and history are retained.</p>' : a.status==='needs_information' ? '<p>Your reviewer needs more information. Update your details and send a response.</p><button class="btn" data-action="edit-application">Update & resubmit →</button>' : `<p>${a.status==='submitted' ? 'Your application is saved and waiting for review.' : a.status==='under_review' ? 'A reviewer is looking at your application. Check back for updates.' : a.status==='approved' ? 'The test review is complete. No money has been disbursed.' : a.status==='declined' ? 'Please read the reviewer’s message in the history for the reason.' : 'You withdrew this application. You can submit a new request when ready.'}</p>`}${!admin && ['submitted','under_review','needs_information'].includes(a.status)?'<button class="textbtn danger-text" data-action="cancel-application">Withdraw application</button>':''}</div><p class="small">Times shown in Africa/Lagos. Updates appear when you refresh or return to this page.</p></aside></div>`);
}
function profilePage() {
  const user = state.user;
  shell('profile', `<h1>Your details</h1><p>Keep your contact information up to date. Submitted applications retain the details supplied at submission.</p><form id="profile-form" class="panel form-grid">${[['name','Full name','text'],['phone','Phone number','tel'],['address','Residential address','text']].map(([key,label,type])=>`<div><label for="profile-${key}">${label}</label><input id="profile-${key}" type="${type}" name="${key}" value="${esc(user[key])}" minlength="${key==='name'?2:key==='phone'?7:5}" maxlength="${key==='name'?100:key==='phone'?20:300}" required></div>`).join('')}<div><label for="profile-email">Email address</label><input id="profile-email" type="email" value="${esc(user.email)}" disabled><p class="small">Email changes require a verification flow, planned for a later milestone.</p></div><div class="full"><div data-error class="form-error" role="alert" tabindex="-1" hidden></div><button class="btn" type="submit">Save changes</button></div></form>`);
}
async function renderRoute() {
  const version = ++state.routeVersion;
  const route = location.hash.slice(1);
  try {
    if (!route || ['solutions','how','about','calculator'].includes(route)) {
      if (!document.querySelector('.hero')) landing();
      if (route) document.getElementById(route)?.scrollIntoView();
      else window.scrollTo(0,0);
      return;
    }
    if (['login','register'].includes(route)) {
      if (state.user) return go('portal');
      authPage(route); window.scrollTo(0,0); return;
    }
    if (!state.user) { state.afterAuth = route==='apply'?'apply':'portal'; return go('login'); }
    if (route==='apply') { applicationForm(); window.scrollTo(0,0); return; }
    if (route==='profile') { profilePage(); window.scrollTo(0,0); return; }
    if (route==='support') {
      shell('support','<h1>A little help, when you need it.</h1><div class="panel"><h3>Following up on an application?</h3><p>Open My applications to read your reviewer’s latest message. If more information is requested, you can update and resubmit from the application detail page.</p><a class="btn" href="#applications">View applications →</a></div><div class="panel"><h3>About this test environment</h3><p>Accounts and applications are saved in the running project. Email, password recovery, document uploads and payments are not connected yet. Restarting the same server preserves its data; resetting or forking the StackBlitz environment may not.</p></div>'); return;
    }
    shell(route.startsWith('application')?'applications':'portal','<div class="panel loading" role="status">Loading your workspace…</div>');
    if (route.startsWith('application/')) {
      const id = route.split('/')[1];
      const data = await api(`/applications/${encodeURIComponent(id)}`);
      if (version!==state.routeVersion) return;
      detail(data.application);
    } else if (['portal','applications'].includes(route)) {
      const data = await api('/applications');
      if (version!==state.routeVersion) return;
      state.applications = data.applications;
      route==='portal' ? overview() : listApplications();
    } else { shell('portal','<div class="empty"><h2>Page not found</h2><a class="btn" href="#portal">Return to overview</a></div>'); }
    window.scrollTo(0,0);
  } catch (error) {
    if (version!==state.routeVersion) return;
    document.querySelector('.loading')?.remove();
    errorMessage(error);
  }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.month) {
    months = Number(button.dataset.month);
    document.querySelectorAll('[data-month]').forEach(el=>el.classList.toggle('active',el===button));
    updateCalc(); return;
  }
  try {
    switch (button.dataset.action) {
      case 'apply': state.afterAuth = 'apply'; go(state.user?'apply':'register'); break;
      case 'refresh': await renderRoute(); break;
      case 'close': modal.close(); break;
      case 'toggle-password': {
        const input = document.querySelector('#auth-password');
        input.type = input.type==='password'?'text':'password';
        button.textContent = input.type==='password'?'Show':'Hide';
        button.setAttribute('aria-label',`${button.textContent} password`); break;
      }
      case 'logout':
        button.disabled = true;
        await api('/auth/logout',{method:'POST',body:{}});
        state.user=null; state.csrfToken=null; state.applications=[]; state.selected=null; state.afterAuth='portal';
        go('login'); break;
      case 'edit-application': applicationForm(state.selected); window.scrollTo(0,0); break;
      case 'cancel-application': show('<h2>Withdraw this application?</h2><p>Your request will be closed and its history retained. You can start another application afterward.</p><div class="form-actions"><button class="btn" data-action="confirm-cancel">Withdraw application</button><button class="btn light" data-action="close">Keep application</button></div>'); break;
      case 'confirm-cancel': {
        button.disabled=true;
        const a=state.selected;
        const data=await api(`/applications/${a.id}/cancel`,{method:'PATCH',body:{version:a.version}});
        modal.close();detail(data.application);toast('Application withdrawn.');break;
      }
    }
  } catch (error) { if(modal.open) modal.close();errorMessage(error); }
  finally { button.disabled=false; }
});
document.addEventListener('input', event => {
  if(event.target.id==='amount'){amount=Number(event.target.value);updateCalc();}
  if(event.target.id==='application-search'){state.search=event.target.value;filterApplications();}
});
document.addEventListener('change', event => {
  if(event.target.id==='status-filter'){state.statusFilter=event.target.value;filterApplications();}
});
document.addEventListener('submit', async event => {
  const form=event.target;
  if(!['auth-form','profile-form','application-form','review-form'].includes(form.id)) return;
  event.preventDefault();
  if(form.dataset.busy==='true') return;
  form.dataset.busy='true';
  const button=form.querySelector('button[type="submit"]');
  const previousLabel=button.textContent;
  button.disabled=true;button.textContent='Saving…';
  const errorBox=form.querySelector('[data-error]');
  errorBox.hidden=true;
  const body=Object.fromEntries(new FormData(form));
  try {
    if(form.id==='auth-form') {
      body.testConsent=body.testConsent==='on';
      const data=await api(`/auth/${form.dataset.mode}`,{method:'POST',body});
      state.user=data.user;state.csrfToken=data.csrfToken;
      const destination=state.user.role==='admin'?'portal':state.afterAuth;
      state.afterAuth='portal';go(destination);toast(form.dataset.mode==='register'?'Your test account is ready.':'Welcome back.');
    } else if(form.id==='profile-form') {
      const data=await api('/profile',{method:'PATCH',body});state.user=data.user;profilePage();toast('Your details have been saved.');
    } else if(form.id==='application-form') {
      for(const key of ['amount','termMonths','monthlyIncome']) body[key]=Number(body[key]);
      body.testConsent=body.testConsent==='on';
      body.version=Number(form.dataset.version);body.requestId=form.dataset.requestId;
      const id=form.dataset.id;
      const data=await api(id?`/applications/${id}/resubmit`:'/applications',{method:id?'PATCH':'POST',body});
      go(`application/${data.application.id}`);toast(id?'Application updated and resubmitted.':'Your application has been saved for review.');
    } else {
      body.version=Number(form.dataset.version);
      const data=await api(`/applications/${form.dataset.id}/review`,{method:'PATCH',body});
      detail(data.application);toast('Review update saved. The customer can now see your message.');
    }
  } catch(error) {
    // Incorrect credentials should remain on the sign-in form instead of causing a route loop.
    if(form.id==='auth-form'){errorBox.textContent=error.message;errorBox.hidden=false;errorBox.focus();}
    else errorMessage(error,form);
  } finally { form.dataset.busy='false';button.disabled=false;button.textContent=previousLabel; }
});
window.addEventListener('hashchange',renderRoute);
async function boot() {
  app.innerHTML='<div class="wrap"><header>'+brand+'</header><div class="panel loading" role="status">Opening Sea Credit…</div></div>';
  try { const data=await api('/auth/me');state.user=data.user;state.csrfToken=data.csrfToken; }
  catch(error) { toast(error.message); }
  renderRoute();
}
boot();
