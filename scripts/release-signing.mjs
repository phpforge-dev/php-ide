// Release tooling only. Decides, from the presence of CI secrets/variables, which signing steps a
// build performs and writes the Tauri config overlay for them. It never prints secret values and
// never creates keys or certificates: those belong to the release owner (docs/specs/release-signing.md).
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PLATFORMS=['darwin-aarch64','linux-x86_64','windows-x86_64'];
const set=(env,name)=>typeof env[name]==='string'&&env[name].trim()!=='';

// Each group is all-or-nothing: a partial configuration is a mistake that must not silently
// degrade to an unsigned or half-signed release.
function group(env,label,names,errors){
 const present=names.filter(name=>set(env,name));
 if(present.length&&present.length!==names.length)errors.push(`${label}: missing ${names.filter(name=>!present.includes(name)).join(', ')}`);
 return present.length===names.length;
}

export function signingPlan(env,{updater='auto'}={}){
 if(!['off','auto','required'].includes(updater))throw Error('Invalid updater mode');
 const errors=[];
 const updaterKeys=updater!=='off'&&group(env,'Tauri updater',['PHP_IDE_UPDATER_PUBLIC_KEY','TAURI_SIGNING_PRIVATE_KEY'],errors);
 if(updater==='required'&&!updaterKeys&&!errors.length)errors.push('Tauri updater: configure PHP_IDE_UPDATER_PUBLIC_KEY (variable) and TAURI_SIGNING_PRIVATE_KEY (secret)');
 if(updaterKeys&&!/^[A-Za-z0-9+/=\s]+$/.test(env.PHP_IDE_UPDATER_PUBLIC_KEY))errors.push('Tauri updater: PHP_IDE_UPDATER_PUBLIC_KEY must be the base64 public key printed by `tauri signer generate`');

 const appleCertificate=group(env,'Apple Developer ID',['APPLE_CERTIFICATE','APPLE_CERTIFICATE_PASSWORD','APPLE_SIGNING_IDENTITY'],errors);
 const appleApi=group(env,'Apple notarization (App Store Connect API key)',['APPLE_API_KEY','APPLE_API_ISSUER','APPLE_API_PRIVATE_KEY'],errors);
 const appleId=group(env,'Apple notarization (Apple ID)',['APPLE_ID','APPLE_PASSWORD','APPLE_TEAM_ID'],errors);
 if(appleCertificate&&!appleApi&&!appleId)errors.push('Apple notarization: a Developer ID build must also be notarized; configure the API key or Apple ID secrets');
 if(!appleCertificate&&(appleApi||appleId))errors.push('Apple Developer ID: notarization secrets exist but APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD and APPLE_SIGNING_IDENTITY do not');
 if(appleCertificate&&!/^Developer ID Application: .+\([A-Z0-9]{10}\)$/.test(env.APPLE_SIGNING_IDENTITY.trim()))errors.push('Apple Developer ID: APPLE_SIGNING_IDENTITY must look like "Developer ID Application: Name (TEAMID)"');

 const azure=group(env,'Azure Trusted Signing',['AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','AZURE_TENANT_ID','AZURE_TRUSTED_SIGNING_ENDPOINT','AZURE_TRUSTED_SIGNING_ACCOUNT','AZURE_TRUSTED_SIGNING_PROFILE'],errors);
 const pfx=group(env,'Windows Authenticode certificate',['WINDOWS_CERTIFICATE','WINDOWS_CERTIFICATE_PASSWORD'],errors);
 if(azure&&pfx)errors.push('Windows signing: configure either Azure Trusted Signing or a PFX certificate, not both');
 if(azure&&!/^https:\/\/[a-z0-9.-]+\.codesigning\.azure\.net\/?$/.test(env.AZURE_TRUSTED_SIGNING_ENDPOINT.trim()))errors.push('Azure Trusted Signing: AZURE_TRUSTED_SIGNING_ENDPOINT must be https://<region>.codesigning.azure.net');

 return {
  errors,
  updater:Boolean(updaterKeys),
  macos:appleCertificate?(appleApi?'developer-id-api-key':'developer-id-apple-id'):'ad-hoc',
  windows:azure?'azure-trusted-signing':pfx?'authenticode-pfx':'unsigned',
 };
}

// JSON merge patch passed to `tauri build --config`; values come only from configured CI inputs.
export function signingOverlay(plan,platform,env){
 if(!PLATFORMS.includes(platform))throw Error('Invalid release platform');
 const overlay={bundle:{}};
 if(plan.updater){
  overlay.bundle.createUpdaterArtifacts=true;
  overlay.plugins={updater:{pubkey:env.PHP_IDE_UPDATER_PUBLIC_KEY.trim(),requireSignedVersion:true}};
 }
 if(platform.startsWith('darwin')&&plan.macos!=='ad-hoc')overlay.bundle.macOS={signingIdentity:env.APPLE_SIGNING_IDENTITY.trim(),hardenedRuntime:true};
 if(platform.startsWith('windows')&&plan.windows==='azure-trusted-signing')overlay.bundle.windows={signCommand:{cmd:'trusted-signing-cli',args:['-e',env.AZURE_TRUSTED_SIGNING_ENDPOINT.trim(),'-a',env.AZURE_TRUSTED_SIGNING_ACCOUNT.trim(),'-c',env.AZURE_TRUSTED_SIGNING_PROFILE.trim(),'-d','PHP IDE','%1']}};
 if(platform.startsWith('windows')&&plan.windows==='authenticode-pfx'){
  if(!/^[0-9A-Fa-f]{40}$/.test(env.WINDOWS_CERTIFICATE_THUMBPRINT??''))throw Error('Import the Authenticode certificate before writing the overlay');
  overlay.bundle.windows={certificateThumbprint:env.WINDOWS_CERTIFICATE_THUMBPRINT,digestAlgorithm:'sha256',timestampUrl:'http://timestamp.digicert.com'};
 }
 return overlay;
}

export function describe(plan,platform){
 const lines=[`Updater signatures: ${plan.updater?'on':'off'}`];
 if(!platform||platform.startsWith('darwin'))lines.push(`macOS: ${plan.macos}`);
 if(!platform||platform.startsWith('windows'))lines.push(`Windows: ${plan.windows}`);
 return lines;
}

async function main(){
 const [command,...args]=process.argv.slice(2);
 const plan=signingPlan(process.env,{updater:process.env.UPDATER_MODE||'auto'});
 for(const error of plan.errors)console.error('::error::'+error);
 if(plan.errors.length)process.exit(1);
 const output=process.env.GITHUB_OUTPUT;
 const summary=process.env.GITHUB_STEP_SUMMARY;
 if(command==='plan'){
  if(output)await appendFile(output,`updater=${plan.updater}\nmacos=${plan.macos}\nwindows=${plan.windows}\n`);
  if(summary)await appendFile(summary,'### Release signing\n\n'+describe(plan).map(line=>'- '+line).join('\n')+'\n');
  console.log(describe(plan).join('\n'));
 }else if(command==='overlay'){
  const [platform,file]=args;
  const base=JSON.parse(await readFile(new URL('../src-tauri/tauri.updater.conf.json',import.meta.url),'utf8'));
  const overlay=signingOverlay(plan,platform,process.env);
  if(plan.updater)overlay.bundle={...base.bundle,...overlay.bundle};
  await writeFile(file,JSON.stringify(overlay,null,2)+'\n');
  if(output)await appendFile(output,`updater=${plan.updater}\nmacos=${plan.macos}\nwindows=${plan.windows}\n`);
  console.log(describe(plan,platform).join('\n'));
 }else throw Error('Usage: release-signing.mjs plan | overlay <platform> <file>');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
