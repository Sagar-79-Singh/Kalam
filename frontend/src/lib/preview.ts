import type { ArtifactType } from '../types';
import runtime from '../../public/artifact-runtime.js?raw';
const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; form-action 'none'; base-uri 'none'">`;
const style = `<style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#fff;color:#242424;font:15px/1.65 system-ui,sans-serif}#root{min-height:100vh}button,input,textarea,select{font:inherit}button{cursor:pointer}img,svg{max-width:100%}.markdown{max-width:780px;margin:auto;padding:32px}.markdown pre{background:#f4f4f4;padding:16px;overflow:auto;border-radius:8px}.markdown blockquote{border-left:3px solid #ccc;padding-left:16px;color:#666}.markdown table{border-collapse:collapse}.markdown td,.markdown th{border:1px solid #ddd;padding:8px}</style>`;
const scriptSafe = (value: string) => value.replace(/<\/script/gi, '<\\/script');
export async function makePreview(type: ArtifactType, code: string): Promise<string> {
  if (type === 'html') {
    // Put the policy before user content, even when it includes a full HTML document.
    return `<!doctype html><html><head><meta charset="utf-8">${csp}${style}</head><body>${code}</body></html>`;
  }
  if (type === 'svg') return `<!doctype html><html><head>${csp}${style}</head><body style="display:grid;place-items:center;min-height:100vh;padding:24px">${code}</body></html>`;
  if (type === 'mermaid') {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true });
    const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, code);
    return `<!doctype html><html><head>${csp}${style}</head><body style="padding:24px;display:grid;place-items:center;min-height:100vh">${svg}</body></html>`;
  }
  let source = code;
  if (type === 'react') {
    const ts = await import('typescript');
    const result = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, reportDiagnostics: true, fileName: 'artifact.tsx' });
    const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors?.length) throw new Error(errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'));
    source = result.outputText;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${csp}${style}</head><body><div id="root"></div><script>${scriptSafe(runtime)}</script><script>window.renderArtifact(${JSON.stringify(type)},${scriptSafe(JSON.stringify(source))});</script></body></html>`;
}
