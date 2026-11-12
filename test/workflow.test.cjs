const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../server/app.cjs');
const { hashPassword } = require('../server/store.cjs');

test('customer and reviewer workflow with persisted records and access boundaries', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sea-credit-test-'));
  let instance = createApp({ dataDir });
  let origin;
  async function start() {
    await new Promise(resolve => instance.server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${instance.server.address().port}`;
  }
  async function stop() {
    instance.server.closeAllConnections();
    await new Promise(resolve => instance.server.close(resolve));
  }
  await start();
  t.after(async () => { await stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  function client() {
    return {
      cookie: '', csrf: '',
      async request(route, method='GET', body, override={}) {
        const res = await fetch(origin+route, {
          method,
          headers: { Origin: origin, 'Content-Type':'application/json', Cookie:this.cookie, 'X-CSRF-Token':this.csrf, ...override },
          ...(body === undefined ? {} : {body:JSON.stringify(body)})
        });
        const data = await res.json();
        const cookie = res.headers.get('set-cookie');
        if(cookie) this.cookie=cookie.split(';')[0];
        if(data.csrfToken) this.csrf=data.csrfToken;
        return {status:res.status,data,headers:res.headers};
      }
    };
  }
  const alice=client(),bob=client(),admin=client(),guest=client();
  const secret='Test only password 123!';
  let application;
  const payload = { product:'salary_advance', amount:150000, termMonths:3, phone:'08000000000', address:'10 Fictional Road, Lagos', employer:'Example Test Ltd', jobTitle:'Analyst', employmentType:'salaried', monthlyIncome:350000, purpose:'Fictional expense for workflow testing.', testConsent:true, requestId:crypto.randomUUID() };
  await t.test('anonymous access is denied and cross-origin registration is rejected', async () => {
    assert.equal((await guest.request('/api/applications')).status,401);
    assert.equal((await guest.request('/api/auth/register','POST',{},{Origin:'https://untrusted.invalid'})).status,403);
    assert.equal((await guest.request('/api/auth/me')).data.user,null);
  });
  await t.test('registration hashes passwords, normalizes email and ignores injected admin roles', async () => {
    let result=await alice.request('/api/auth/register','POST',{name:'Alice Test',email:'Alice@Example.test',password:secret,testConsent:true,role:'admin'});
    assert.equal(result.status,201);
    assert.equal(result.data.user.role,'customer');
    assert.equal(result.data.user.email,'alice@example.test');
    assert.ok(!('password' in result.data.user));
    assert.match(result.headers.get('set-cookie'),/HttpOnly/);
    assert.match(result.headers.get('set-cookie'),/SameSite=Lax/);
    const raw=fs.readFileSync(path.join(dataDir,'database.json'),'utf8');
    assert.ok(!raw.includes(secret));
    assert.ok(!raw.includes(alice.cookie.split('=')[1]));
    assert.equal((await guest.request('/api/auth/register','POST',{name:'Duplicate',email:'ALICE@example.test',password:secret,testConsent:true})).status,409);
    result=await bob.request('/api/auth/register','POST',{name:'Bob Test',email:'bob@example.test',password:secret,testConsent:true});
    assert.equal(result.status,201);
  });
  await t.test('authentication rejects wrong passwords and keeps a usable session', async () => {
    assert.equal((await guest.request('/api/auth/login','POST',{email:'alice@example.test',password:'Wrong password 123'})).status,401);
    assert.equal((await alice.request('/api/auth/me')).data.user.name,'Alice Test');
  });
  await t.test('input validation and CSRF prevent invalid submissions', async () => {
    assert.equal((await alice.request('/api/applications','POST',payload,{'X-CSRF-Token':''})).status,403);
    assert.equal((await alice.request('/api/applications','POST',{...payload,amount:-1})).status,400);
    assert.equal((await alice.request('/api/applications','POST',{...payload,termMonths:99})).status,400);
    assert.equal((await alice.request('/api/applications','POST',{...payload,testConsent:false})).status,400);
    assert.equal((await alice.request('/api/applications')).data.applications.length,0);
  });
  await t.test('submission is persisted and duplicate retries do not create additional records', async () => {
    const result=await alice.request('/api/applications','POST',payload);
    assert.equal(result.status,201);
    application=result.data.application;
    assert.equal(application.status,'submitted');
    assert.equal(application.history.length,1);
    const duplicate=await alice.request('/api/applications','POST',payload);
    assert.equal(duplicate.data.application.id,application.id);
    assert.equal((await alice.request('/api/applications')).data.applications.length,1);
    assert.equal(instance.store.read().applications.length,1);
  });
  await t.test('customers cannot inspect or modify other accounts or review their own request', async () => {
    assert.equal((await bob.request('/api/applications')).data.applications.length,0);
    assert.equal((await bob.request(`/api/applications/${application.id}`)).status,404);
    assert.equal((await bob.request(`/api/applications/${application.id}/cancel`,'PATCH',{version:1})).status,404);
    assert.equal((await alice.request(`/api/applications/${application.id}/review`,'PATCH',{version:1,status:'approved',note:'Not authorized'})).status,403);
    const result=await alice.request('/api/profile','PATCH',{name:'Alice Updated',phone:'08000000000',address:'20 Fictional Street, Lagos',role:'admin',email:'stolen@example.test'});
    assert.equal(result.status,200);
    assert.equal(result.data.user.role,'customer');
    assert.equal(result.data.user.email,'alice@example.test');
  });
  await t.test('a provisioned reviewer signs in and requests additional information', async () => {
    const passwordHash=await hashPassword(secret);
    instance.store.mutate(db=>db.users.push({id:crypto.randomUUID(),name:'Reviewer Test',email:'reviewer@example.test',role:'admin',password:passwordHash,createdAt:new Date().toISOString()}));
    const login=await admin.request('/api/auth/login','POST',{email:'reviewer@example.test',password:secret});
    assert.equal(login.status,200);
    assert.equal(login.data.user.role,'admin');
    assert.equal((await admin.request('/api/applications')).data.applications.length,1);
    assert.equal((await admin.request('/api/applications','POST',payload)).status,403);
    const result=await admin.request(`/api/applications/${application.id}/review`,'PATCH',{version:1,status:'needs_information',note:'Please clarify the monthly income for this test.'});
    assert.equal(result.status,200);
    assert.equal(result.data.application.version,2);
    const customerView=await alice.request(`/api/applications/${application.id}`);
    assert.equal(customerView.data.application.history.at(-1).note,'Please clarify the monthly income for this test.');
  });
  await t.test('customer resubmission preserves history and rejects stale updates', async () => {
    assert.equal((await admin.request(`/api/applications/${application.id}/review`,'PATCH',{version:1,status:'approved',note:'Stale request'})).status,409);
    const result=await alice.request(`/api/applications/${application.id}/resubmit`,'PATCH',{...payload,version:2,monthlyIncome:400000,note:'Updated the fictional income as requested.'});
    assert.equal(result.status,200);
    assert.equal(result.data.application.status,'submitted');
    assert.equal(result.data.application.version,3);
    assert.equal(result.data.application.history.length,3);
    assert.equal(result.data.application.monthlyIncome,400000);
  });
  await t.test('review decision closes the application without inventing a loan or disbursement', async () => {
    const result=await admin.request(`/api/applications/${application.id}/review`,'PATCH',{version:3,status:'approved',note:'Approved for this fictional workflow test only.'});
    assert.equal(result.status,200);
    assert.equal(result.data.application.status,'approved');
    assert.equal(result.data.application.version,4);
    assert.ok(!('balance' in result.data.application));
    assert.equal((await alice.request(`/api/applications/${application.id}/cancel`,'PATCH',{version:4})).status,409);
    assert.equal((await admin.request(`/api/applications/${application.id}/review`,'PATCH',{version:4,status:'declined',note:'Cannot overwrite a closed decision.'})).status,409);
  });
  await t.test('withdrawal and decline each close separate applications', async () => {
    const second=(await bob.request('/api/applications','POST',{...payload,requestId:crypto.randomUUID()})).data.application;
    const cancelled=await bob.request(`/api/applications/${second.id}/cancel`,'PATCH',{version:1});
    assert.equal(cancelled.data.application.status,'cancelled');
    const third=(await bob.request('/api/applications','POST',{...payload,requestId:crypto.randomUUID()})).data.application;
    const declined=await admin.request(`/api/applications/${third.id}/review`,'PATCH',{version:1,status:'declined',note:'Declined as part of the fictional workflow test.'});
    assert.equal(declined.data.application.status,'declined');
    assert.equal((await bob.request('/api/applications?status=declined')).data.applications.length,1);
  });
  await t.test('accounts, sessions, applications and profile updates survive a server restart', async () => {
    await stop();instance=createApp({dataDir});await start();
    const result=await alice.request('/api/auth/me');
    assert.equal(result.data.user.name,'Alice Updated');
    assert.equal((await alice.request(`/api/applications/${application.id}`)).data.application.status,'approved');
    assert.equal((await admin.request('/api/applications')).data.applications.length,3);
  });
  await t.test('logout invalidates the session and development database files cannot be downloaded', async () => {
    const oldCookie=alice.cookie;
    assert.equal((await alice.request('/api/auth/logout','POST',{})).status,200);
    assert.equal((await guest.request('/api/applications','GET',undefined,{Cookie:oldCookie})).status,401);
    assert.equal((await guest.request('/.data/database.json')).status,404);
    assert.equal((await guest.request('/server/app.cjs')).status,404);
  });
});
