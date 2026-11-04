import test from 'node:test';
import assert from 'node:assert/strict';
import {signingPlan,signingOverlay} from '../scripts/release-signing.mjs';

const updater={PHP_IDE_UPDATER_PUBLIC_KEY:'dW50cnVzdGVkIGNvbW1lbnQ6IHRlc3Q=',TAURI_SIGNING_PRIVATE_KEY:'private'};
const apple={APPLE_CERTIFICATE:'cert',APPLE_CERTIFICATE_PASSWORD:'pw',APPLE_SIGNING_IDENTITY:'Developer ID Application: Example Ltd (ABCDE12345)'};
const appleApi={APPLE_API_KEY:'KEY',APPLE_API_ISSUER:'issuer',APPLE_API_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----'};
const azure={AZURE_CLIENT_ID:'c',AZURE_CLIENT_SECRET:'s',AZURE_TENANT_ID:'t',AZURE_TRUSTED_SIGNING_ENDPOINT:'https://eus.codesigning.azure.net',AZURE_TRUSTED_SIGNING_ACCOUNT:'acct',AZURE_TRUSTED_SIGNING_PROFILE:'profile'};

test('without secrets every build keeps the current unsigned/ad hoc behaviour',()=>{
 const plan=signingPlan({});
 assert.deepEqual(plan,{errors:[],updater:false,macos:'ad-hoc',windows:'unsigned'});
 for(const platform of ['darwin-aarch64','linux-x86_64','windows-x86_64'])assert.deepEqual(signingOverlay(plan,platform,{}),{bundle:{}});
 // Empty strings are what GitHub passes for missing secrets.
 assert.deepEqual(signingPlan({APPLE_CERTIFICATE:'',WINDOWS_CERTIFICATE:' ',TAURI_SIGNING_PRIVATE_KEY:''}).errors,[]);
});

test('a required updater fails without its key and partial groups never degrade silently',()=>{
 assert.match(signingPlan({},{updater:'required'}).errors.join(),/PHP_IDE_UPDATER_PUBLIC_KEY/);
 assert.match(signingPlan({TAURI_SIGNING_PRIVATE_KEY:'x'}).errors.join(),/missing PHP_IDE_UPDATER_PUBLIC_KEY/);
 assert.match(signingPlan({APPLE_CERTIFICATE:'x'}).errors.join(),/missing APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY/);
 assert.match(signingPlan(apple).errors.join(),/must also be notarized/);
 assert.match(signingPlan(appleApi).errors.join(),/notarization secrets exist/);
 assert.match(signingPlan({...apple,...appleApi,APPLE_SIGNING_IDENTITY:'Apple Development: me'}).errors.join(),/Developer ID Application/);
 assert.match(signingPlan({...azure,WINDOWS_CERTIFICATE:'a',WINDOWS_CERTIFICATE_PASSWORD:'b'}).errors.join(),/not both/);
 assert.match(signingPlan({...azure,AZURE_TRUSTED_SIGNING_ENDPOINT:'https://evil.example'}).errors.join(),/codesigning\.azure\.net/);
 assert.equal(signingPlan(updater,{updater:'off'}).updater,false);
});

test('configured secrets produce the matching Tauri overlay per platform',()=>{
 const env={...updater,...apple,...appleApi,...azure};
 const plan=signingPlan(env,{updater:'required'});
 assert.deepEqual(plan,{errors:[],updater:true,macos:'developer-id-api-key',windows:'azure-trusted-signing'});
 const mac=signingOverlay(plan,'darwin-aarch64',env);
 assert.equal(mac.bundle.macOS.signingIdentity,apple.APPLE_SIGNING_IDENTITY);
 assert.equal(mac.plugins.updater.pubkey,updater.PHP_IDE_UPDATER_PUBLIC_KEY);
 assert.equal(mac.plugins.updater.requireSignedVersion,true);
 assert.equal(mac.bundle.createUpdaterArtifacts,true);
 assert.equal(mac.bundle.windows,undefined);
 const win=signingOverlay(plan,'windows-x86_64',env);
 assert.deepEqual(win.bundle.windows.signCommand.args.slice(-3),['-d','PHP IDE','%1']);
 assert.equal(win.bundle.macOS,undefined);
 assert.equal(signingOverlay(plan,'linux-x86_64',env).bundle.windows,undefined);
 // Nothing secret ends up in an overlay.
 for(const overlay of [mac,win])for(const secret of ['private','cert','pw','-----BEGIN PRIVATE KEY-----'])assert.ok(!JSON.stringify(overlay).includes(JSON.stringify(secret)));
 const pfxEnv={WINDOWS_CERTIFICATE:'a',WINDOWS_CERTIFICATE_PASSWORD:'b'};
 const pfx=signingPlan(pfxEnv);assert.equal(pfx.windows,'authenticode-pfx');
 assert.throws(()=>signingOverlay(pfx,'windows-x86_64',pfxEnv),/Import the Authenticode/);
 assert.equal(signingOverlay(pfx,'windows-x86_64',{...pfxEnv,WINDOWS_CERTIFICATE_THUMBPRINT:'A'.repeat(40)}).bundle.windows.digestAlgorithm,'sha256');
 assert.equal(signingPlan({...apple,APPLE_ID:'a',APPLE_PASSWORD:'b',APPLE_TEAM_ID:'ABCDE12345'}).macos,'developer-id-apple-id');
});
