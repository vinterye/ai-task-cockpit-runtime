import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const taskId = process.env.MVP_TASK_ID || 'TASK-MVP-RUN';
const executionId = process.env.MVP_EXECUTION_ID || 'standalone';
const requirement = process.env.MVP_REQUIREMENT || '本地运行链路验证';
const artifactDir = process.env.MVP_ARTIFACT_DIR || path.join('runtime', 'artifacts', taskId);
const root = path.resolve(process.cwd(), artifactDir);
const appDir = path.join(root, 'app');
await mkdir(appDir, { recursive: true });
console.log(`[mvp-runner] started task=${taskId} execution=${executionId}`);
if (process.env.MVP_RUNNER_FAIL === '1') {
  console.error('[mvp-runner] forced failure requested; no success artifact created');
  process.exit(1);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
const stages = [
  ['competitor', '01-research.md', 'raw-input', `# 原始输入记录\n\n${requirement}\n\n研究结论：Unknown。此 runner 没有调用研究 Agent 或访问竞品。`],
  ['requirement', '02-requirement.md', 'formal-requirements', `# 本地运行验收草案\n\n原始需求：${requirement}\n\n本次实现范围：启动真实 Node process、保存 stdout/stderr、写入 HTML、交给 Master Controller 做证据审核。\n\n用户的完整产品需求尚未生成正式 PRD；专家审核：Unknown；Controller 决策来自 Runtime Review Event。`],
  ['interaction', '03-interaction-spec.md', 'page-framework', '# 运行预览交互\n\n入口：真实 HTML preview。区域：任务、创建、产物、Review。\n用户动作：选择区域、刷新真实任务、创建验收任务、启动、批准。\n系统响应：调用本地 API，失败显示 HTTP 原因。\n状态来自后端，不以点击模拟完成。'],
  ['prototype', '04-prototype-spec.md', 'prototype-framework', '# 运行预览结构\n\n顶部：当前任务与状态。左侧：页面导航。主区：Task/Artifact/Review。\n该产物是 mvp-runner 生成的低保真运行预览，未经过 Prototype Agent 审核。'],
  ['ui_design', '05-ui-design.md', 'ui-spec', '# 低保真运行预览\n\n已生成四个可点击区域：任务详情、创建任务、Artifact、Review。\n字体：系统字体；间距：16/24px；反馈：API 状态与错误。\nBlocked/Failed 等产品状态覆盖未验证，不能声明完整覆盖。'],
  ['development', '06-development.md', 'technical-contract', '# 实际接口绑定\n\nGET /api/tasks/:id\nPOST /api/tasks\nPOST /api/tasks/:id/start\nPOST /api/tasks/:id/review\n\n生成器：scripts/mvp-runner.mjs。预览通过同源 API 连接现有 Node server。\n未调用技术专家、Codex Worker 或外部模型。完整联调/生产 Build：Not Run。']
];
const artifacts = [];
for (const [stage, filename, cardId, content] of stages) {
  console.log(`[stage] ${stage} started`);
  await writeFile(path.join(root, filename), content, 'utf8');
  artifacts.push({ stage, card_id: cardId, path: path.join(artifactDir, filename), kind: 'document', status: 'draft', producer: 'mvp-runner' });
  console.log(`[file] ${filename} written`);
  console.log(`[stage] ${stage} completed`);
}
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地 MVP 真实运行预览</title><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui;color:#263349;background:#f3f6fa}header{padding:20px;background:white;border-bottom:1px solid #dce4ee}h1{font-size:20px;margin:0 0 8px}nav{display:flex;flex-wrap:wrap;gap:8px;padding:16px}button{padding:9px 14px;border:1px solid #ccd8e7;border-radius:8px;background:white;cursor:pointer;color:#184e9e}button:disabled{opacity:.5;cursor:default}main{max-width:920px;padding:0 16px 24px}section{background:white;border:1px solid #dce4ee;border-radius:10px;padding:20px;margin-bottom:16px}textarea{width:100%;min-height:100px;padding:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f9fc;padding:12px;font-size:12px}.muted{color:#64748b;font-size:12px}.status{font-weight:600}#feedback{min-height:24px;padding:0 16px;color:#184e9e}[hidden]{display:none!important}</style></head>
<body><header><h1>本地 MVP 真实运行预览</h1><div class="muted">mvp-runner 生成的低保真 HTML；任务操作连接真实 API。尚无专家/Controller/生产版本证据。</div><p>任务：<span id="task-title">${escapeHtml(taskId)}</span> · <span id="status" class="status">连接中</span></p></header>
<nav><button data-page="detail">任务详情</button><button data-page="create">创建任务</button><button data-page="artifact">Artifact</button><button data-page="review">Review</button><button id="refresh">刷新真实数据</button></nav><div id="feedback" role="status"></div>
<main><section data-section="detail"><h2>Task / Node</h2><div id="nodes"></div><button id="start">开始运行</button><h3>真实 stdout / stderr</h3><pre id="logs">尚无记录</pre></section>
<section data-section="create" hidden><h2>创建运行验收任务</h2><label>你想验证什么？<textarea id="request">本地 MVP 运行链路验收</textarea></label><p class="muted">此入口创建真实 Web/MVP 验收任务，不自动执行完整产品七阶段。</p><button id="create">创建验收任务</button></section>
<section data-section="artifact" hidden><h2>真实 Artifact</h2><pre id="artifact">Unknown / 尚无证据</pre></section>
<section data-section="review" hidden><h2>Master Controller Review</h2><p>只有 Runtime 进入 waiting_review 时才会交给已登记 Controller；进程退出成功不等于 completed。</p><button id="approve">触发总控审核</button><button id="reject" disabled>人工返工入口未接入</button><pre id="review">Unknown</pre></section></main>
<script>
let currentTaskId=${JSON.stringify(taskId)}; let busy=false;
const feedback=document.getElementById('feedback');
async function api(route,body){const response=await fetch(route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw new Error(value.error||('HTTP '+response.status));return value;}
async function refresh(){try{const data=await api('/api/tasks/'+encodeURIComponent(currentTaskId));const task=data.task;document.getElementById('task-title').textContent=task.name;document.getElementById('status').textContent=task.status;document.getElementById('nodes').textContent=(task.nodes||[]).map(n=>n.name+': '+n.status).join(' / ');document.getElementById('logs').textContent=(task.events||[]).filter(e=>e.stream==='stdout'||e.stream==='stderr').map(e=>e.at+' ['+e.stream+'] '+e.message).join('\\n')||'尚无记录';document.getElementById('artifact').textContent=task.artifact?.exists?task.artifact.path:'Unknown / 尚无证据';document.getElementById('review').textContent='Reviewer: '+(task.reviewer||'Unknown')+'\\nDecision: '+(task.decision||'Unknown');document.getElementById('start').disabled=!['pending','failed'].includes(task.status);for(const id of ['approve','reject'])document.getElementById(id).disabled=task.status!=='waiting_review';}catch(error){document.getElementById('status').textContent='本地运行服务未连接';feedback.textContent=error.message;}}
async function action(work){if(busy)return;busy=true;feedback.textContent='请求中…';try{await work();feedback.textContent='真实 API 请求已完成';await refresh();}catch(error){feedback.textContent=error.message;}finally{busy=false;}}
for(const button of document.querySelectorAll('[data-page]'))button.onclick=()=>{for(const section of document.querySelectorAll('[data-section]'))section.hidden=section.dataset.section!==button.dataset.page;};
document.getElementById('refresh').onclick=refresh;
document.getElementById('start').onclick=()=>action(()=>api('/api/tasks/'+encodeURIComponent(currentTaskId)+'/start',{}));
document.getElementById('approve').onclick=()=>action(()=>api('/api/tasks/'+encodeURIComponent(currentTaskId)+'/controller-review',{}));
document.getElementById('create').onclick=()=>action(async()=>{const requirement=document.getElementById('request').value.trim();if(!requirement)throw new Error('请填写需求');const result=await api('/api/tasks',{requirement,project_input:{original_request:requirement,product_platform:'web_app',delivery_goal:'runnable_mvp',project_type:'new',reference_files:[]}});currentTaskId=result.task.id;document.querySelector('[data-page="detail"]').click();});
refresh();setInterval(refresh,1500);
</script></body></html>`;
const appPath = path.join(appDir, 'index.html');
await writeFile(appPath, html, 'utf8');
console.log(`[artifact] ${path.relative(process.cwd(), appPath)} written`);
artifacts.push({ stage: 'interaction', card_id: 'interaction-demo', path: path.join(artifactDir, 'app/index.html'), kind: 'preview', status: 'generated', producer: 'mvp-runner', scope: 'shared_local_runtime_preview' });
artifacts.push({ stage: 'prototype', card_id: 'prototype-preview', path: path.join(artifactDir, 'app/index.html'), kind: 'preview', status: 'generated', producer: 'mvp-runner', scope: 'shared_local_runtime_preview' });
artifacts.push({ stage: 'ui_design', card_id: 'low-fi-demo', path: path.join(artifactDir, 'app/index.html'), kind: 'preview', status: 'generated', producer: 'mvp-runner', scope: 'shared_local_runtime_preview' });
console.log('[stage] testing started');
const actualHtml = await readFile(appPath, 'utf8');
const testResults = [
  { id: 'HTML-SOURCE', name: '生成文件包含真实 HTML 与交互控件', expected: true, actual: /<!doctype html>/i.test(actualHtml) && actualHtml.includes('id="start"'), evidence: path.join(artifactDir, 'app/index.html') },
  { id: 'API-BINDING', name: 'HTML 源码包含本地 Runtime API 绑定（未替代浏览器 E2E）', expected: true, actual: actualHtml.includes("api('/api/tasks/") && actualHtml.includes("'/controller-review'"), evidence: path.join(artifactDir, 'app/index.html') }
];
for (const item of artifacts) testResults.push({ id: item.card_id, name: `磁盘文件存在：${path.basename(item.path)}`, expected: true, actual: (await stat(path.resolve(item.path))).isFile(), evidence: item.path });
for (const check of testResults) check.status = check.actual === check.expected ? 'PASS' : 'FAIL';
await writeFile(path.join(root, '07-test-report.json'), JSON.stringify({ taskId, executionId, checks: testResults, browser_e2e: 'NOT RUN', product_acceptance: 'UNKNOWN' }, null, 2));
artifacts.push({ stage: 'testing', card_id: 'module-test', path: path.join(artifactDir, '07-test-report.json'), kind: 'test_report', producer: 'mvp-file-check' });
await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ task_id: taskId, execution_id: executionId, artifacts, test_results: testResults,
  ui_demos: ['任务详情', '创建任务', 'Artifact', 'Review'].map((title, i) => ({ id: `runtime-page-${i}`, title, artifact_path: path.join(artifactDir, 'app/index.html'), source: 'mvp-runner', covered_states: [], mode: 'lowfi_api', evidence: 'shared HTML preview; state coverage not run' })) }, null, 2));
console.log(`[check] ${testResults.filter(item => item.status === 'PASS').length}/${testResults.length} file/source checks PASS; browser E2E NOT RUN`);
console.log('[stage] testing completed');
console.log('[mvp-runner] finished with exit code 0');
if (testResults.some(item => item.status === 'FAIL')) process.exitCode = 1;
