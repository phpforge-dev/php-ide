import {formatPhp} from '../shared/formatting/php';
self.onmessage=event=>{try{self.postMessage({text:formatPhp(event.data.text,event.data.style,event.data.range)});}catch(error){self.postMessage({error:String(error instanceof Error?error.message:error)});}};
