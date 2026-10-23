import { Agent } from '../electron/agent';
const agent=new Agent(process.cwd(),()=>{});
try { const result=await agent.connect(); console.log(JSON.stringify(result)); }
finally {agent.dispose();}
