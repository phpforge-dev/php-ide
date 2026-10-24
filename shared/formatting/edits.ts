/** One minimal edit preserves unchanged text and gives the editor one undo unit. UTF-16 offsets. */
export function formatEdit(before:string,after:string){
 if(before===after)return null;
 let start=0,end=before.length,next=after.length;
 while(start<end&&start<next&&before[start]===after[start])start++;
 while(end>start&&next>start&&before[end-1]===after[next-1]){end--;next--;}
 // Do not split surrogate pairs or CRLF boundaries.
 if(start>0&&(/[\uDC00-\uDFFF]/.test(before[start]??'')||before[start-1]==='\r'&&before[start]==='\n'))start--;
 if(end<before.length&&(/[\uDC00-\uDFFF]/.test(before[end]??'')||before[end-1]==='\r'&&before[end]==='\n')){end++;next++;}
 return {start,end,text:after.slice(start,next)};
}
