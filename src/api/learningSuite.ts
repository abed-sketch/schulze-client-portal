import { PortalError } from './portal.ts';
export const LS_ORIGIN = 'https://schulze.learningsuite.io';
/** A fresh, correlated request for each refresh; tokens never enter persistent storage. */
export function requestLearningSuiteToken(signal?: AbortSignal): Promise<string> {
  if (window.parent === window) return Promise.reject(new PortalError('ls-required'));
  return new Promise((resolve,reject) => {
    const requestId = crypto.randomUUID();
    let timer:ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message',receive); signal?.removeEventListener('abort',abort); };
    const abort = () => { cleanup(); reject(signal?.reason || new DOMException('Aborted','AbortError')); };
    const receive = (event:MessageEvent) => {
      if (event.origin !== LS_ORIGIN || event.source !== window.parent) return;
      const data=event.data;
      if (!data || data.version!==1 || data.requestId!==requestId) return;
      if (data.type==='LS_TOKEN' && typeof data.token==='string' && /^[^\s]{1,16384}$/.test(data.token)) { cleanup(); resolve(data.token); }
      else if (data.type==='LS_TOKEN_ERROR') { cleanup(); reject(new PortalError('ls-required')); }
    };
    timer=setTimeout(() => { cleanup(); reject(new PortalError('ls-required')); },10000);
    window.addEventListener('message',receive);
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) { abort(); return; }
    window.parent.postMessage({type:'LS_GET_TOKEN',version:1,requestId},LS_ORIGIN);
  });
}
