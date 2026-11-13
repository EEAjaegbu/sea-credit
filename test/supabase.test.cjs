const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const createData = require('../dist/supabase-data.js');
const { createApp } = require('../server/app.cjs');

test('PostgreSQL schema, RLS and customer/reviewer workflow', async t => {
  const db = new PGlite();
  t.after(()=>db.close());
  // Supabase-owned auth tables/roles are simulated; app tables, functions and policies run unchanged.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  const migration = fs.readFileSync(path.join(__dirname,'../supabase/setup.sql'),'utf8');
  await db.exec(migration);
  const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002',reviewer='00000000-0000-4000-8000-000000000003';
  const fields={product:'salary_advance',amount:150000,termMonths:3,phone:'08000000000',address:'10 Fictional Road, Lagos',employmentType:'salaried',employer:'Example Test Ltd',jobTitle:'Analyst',monthlyIncome:350000,purpose:'Fictional expense for workflow testing.',testConsent:true};
  async function asUser(id,fn) {
    return db.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
      return fn(tx);
    });
  }
  const submit=(id,key,data=fields)=>asUser(id,tx=>tx.query('select public.sea_submit_application($1::jsonb,$2::uuid) as id',[JSON.stringify(data),key])).then(r=>r.rows[0].id);
  const change=(id,app,version,action,data={})=>asUser(id,tx=>tx.query('select public.sea_change_application($1,$2,$3,$4::jsonb)',[app,version,action,JSON.stringify(data)]));
  let application;
  await t.test('profile trigger ignores administrator metadata and schema can be rerun',async()=>{
    for(const [id,name] of [[alice,'Alice'],[bob,'Bob'],[reviewer,'Reviewer']]) await db.query('insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())',[id,`${name.toLowerCase()}@example.test`,JSON.stringify({name,role:'admin'})]);
    await db.exec(migration);
    const r=await asUser(alice,tx=>tx.query('select public.sea_current_profile() as profile'));
    assert.equal(r.rows[0].profile.role,'customer');assert.equal(r.rows[0].profile.name,'Alice');
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n,3);
  });
  await t.test('anonymous access is restricted to setup readiness',async()=>{
    await db.transaction(async tx=>{await tx.exec('set local role anon');assert.equal((await tx.query('select public.sea_setup_status() as s')).rows[0].s.schemaVersion,1);});
    await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select * from public.applications');}),/permission denied/i);
    await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select public.sea_current_profile()');}),/permission denied/i);
  });
  await t.test('customers cannot grant themselves reviewer access or bypass RPC writes',async()=>{
    await assert.rejects(asUser(alice,tx=>tx.query('insert into private.reviewers(user_id) values($1)',[alice])),/permission denied/i);
    await assert.rejects(asUser(alice,tx=>tx.query("update public.profiles set name='Forged' where id=$1",[bob])),/permission denied/i);
    await assert.rejects(asUser(alice,tx=>tx.query('delete from public.application_events')),/permission denied/i);
    assert.equal((await asUser(alice,tx=>tx.query('select * from public.profiles'))).rows.length,1);
  });
  await t.test('database validates amounts, terms, income and consent before insertion',async()=>{
    const key='10000000-0000-4000-8000-000000000001';
    for(const patch of [{amount:-1},{amount:50000.5},{termMonths:12},{monthlyIncome:0},{testConsent:false},{purpose:'bad'}]) await assert.rejects(submit(alice,key,{...fields,...patch}));
    assert.equal((await db.query('select count(*)::int as n from public.applications')).rows[0].n,0);
  });
  await t.test('submission is idempotent and customer rows are isolated by RLS',async()=>{
    const key='10000000-0000-4000-8000-000000000002';
    application=await submit(alice,key);
    assert.equal(await submit(alice,key),application);
    assert.equal((await asUser(alice,tx=>tx.query('select * from public.applications'))).rows.length,1);
    assert.equal((await asUser(bob,tx=>tx.query('select * from public.applications'))).rows.length,0);
    assert.equal((await asUser(bob,tx=>tx.query('select * from public.application_events'))).rows.length,0);
    await assert.rejects(change(bob,application,1,'cancel'),/not found/i);
    await assert.rejects(change(alice,application,1,'review',{status:'approved',note:'Unauthorized decision'}),/Only reviewers/i);
  });
  await t.test('only the owner provisioning step grants review access',async()=>{
    await db.query('insert into private.reviewers(user_id) values($1)',[reviewer]);
    assert.equal((await asUser(reviewer,tx=>tx.query('select public.sea_current_profile() as p'))).rows[0].p.role,'admin');
    assert.equal((await asUser(reviewer,tx=>tx.query('select * from public.applications'))).rows.length,1);
    await assert.rejects(submit(reviewer,'10000000-0000-4000-8000-000000000003'),/cannot submit/i);
  });
  await t.test('request for information, customer correction and review history are transactional',async()=>{
    await change(reviewer,application,1,'review',{status:'needs_information',note:'Please clarify your fictional income.'});
    await assert.rejects(change(alice,application,2,'resubmit',{...fields,monthlyIncome:400000,note:'bad'}),/message/i);
    assert.equal((await db.query('select monthly_income from public.applications where id=$1',[application])).rows[0].monthly_income,350000);
    await change(alice,application,2,'resubmit',{...fields,monthlyIncome:400000,note:'Updated the income for this test.'});
    const a=(await asUser(alice,tx=>tx.query('select * from public.applications where id=$1',[application]))).rows[0];
    assert.equal(a.status,'submitted');assert.equal(a.version,3);assert.equal(a.monthly_income,400000);
    const events=(await asUser(alice,tx=>tx.query('select * from public.application_events where application_id=$1 order by created_at',[application]))).rows;
    assert.equal(events.length,3);assert.equal(events[1].actor_role,'admin');
  });
  await t.test('stale decisions are rejected and terminal decisions cannot be overwritten',async()=>{
    await assert.rejects(change(reviewer,application,1,'review',{status:'approved',note:'Stale decision'}),/changed/i);
    await change(reviewer,application,3,'review',{status:'approved',note:'Approved for fictional testing only.'});
    await assert.rejects(change(alice,application,4,'cancel'),/closed/i);
    await assert.rejects(change(reviewer,application,4,'review',{status:'declined',note:'Cannot overwrite the decision'}),/closed/i);
  });
  await t.test('profile updates cannot change login email or role',async()=>{
    const result=await asUser(alice,tx=>tx.query('select public.sea_update_profile($1,$2,$3) as p',['Alice Updated','08000000000','20 Test Street, Lagos']));
    assert.equal(result.rows[0].p.name,'Alice Updated');assert.equal(result.rows[0].p.email,'alice@example.test');assert.equal(result.rows[0].p.role,'customer');
  });
  await t.test('open application limit and withdrawal are enforced by the database',async()=>{
    let first;
    for(let i=10;i<15;i++) { const id=await submit(bob,`10000000-0000-4000-8000-0000000000${i}`);first ||= id; }
    await assert.rejects(submit(bob,'10000000-0000-4000-8000-000000000020'),/five open/i);
    await change(bob,first,1,'cancel');
    const id=await submit(bob,'10000000-0000-4000-8000-000000000020');assert.ok(id);
  });
});

test('Supabase adapter handles email confirmation and missing setup clearly',async t=>{
  const rpcCalls=[];
  const fake={rpc:async(name)=>{rpcCalls.push(name);return {data:{schemaVersion:1},error:null};},auth:{signUp:async()=>({data:{user:{id:'pending-user'},session:null},error:null})}};
  const adapter=createData(fake,'https://preview.example/');
  const result=await adapter.request('/auth/register',{method:'POST',body:{email:'person@example.test',name:'Test Person',password:'A unique test password',testConsent:true}});
  assert.equal(result.needsEmailConfirmation,true);assert.equal(result.user,null);
  assert.deepEqual(rpcCalls,['sea_setup_status']);
  const missing=createData({rpc:async()=>({data:null,error:{code:'PGRST202',message:'missing'}})},'https://preview.example/');
  await assert.rejects(missing.request('/auth/me'),/run supabase\/setup.sql/);
  const unconfirmed=createData({...fake,auth:{signInWithPassword:async()=>({error:{code:'email_not_confirmed',message:'Email not confirmed'}})}},'https://preview.example/');
  await assert.rejects(unconfirmed.request('/auth/login',{body:{email:'person@example.test',password:'test'}}),/confirm your email/);
});

test('static preview serves the Supabase UI without local authentication or storage',async t=>{
  const {server}=createApp();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const html=await (await fetch(base)).text();
  for(const src of ['vendor/supabase.js','supabase-config.js','supabase-data.js','portal.js']) assert.ok(html.includes(src));
  assert.equal((await fetch(base+'/vendor/supabase.js')).status,200);
  assert.equal((await fetch(base+'/api/auth/register',{method:'POST'})).status,410);
  assert.equal((await fetch(base+'/.data/database.json')).status,404);
  assert.equal((await fetch(base+'/supabase/setup.sql')).status,404);
});
