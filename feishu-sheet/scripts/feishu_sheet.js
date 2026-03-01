#!/usr/bin/env node
/**
 * feishu_sheet.js - 飞书电子表格操作工具
 * 
 * 用法:
 *   node feishu_sheet.js create --title "标题" [--config config.json]
 *   node feishu_sheet.js write --ss <token> --sheet <sheetId> --range "A1:H12" --file data.json
 *   node feishu_sheet.js dropdown --ss <token> --sheet <sheetId> --range "C2:C12" --values '["A","B"]' --colors '["#FF0","#0F0"]'
 *   node feishu_sheet.js header --ss <token> --sheet <sheetId> --range "A1:H1" [--bg "#4472C4"] [--fg "#FFF"] [--bold] [--freeze-row 1]
 *   node feishu_sheet.js colwidth --ss <token> --sheet <sheetId> --widths '50,220,70'
 *   node feishu_sheet.js permission --ss <token> --user <open_id> --perm full_access
 *   node feishu_sheet.js permission --ss <token> --public anyone_editable
 *   node feishu_sheet.js read --ss <token> --sheet <sheetId> --range "A1:H50"
 *   node feishu_sheet.js sheets --ss <token>
 *   node feishu_sheet.js add-sheet --ss <token> --name "Sheet名" [--index 1]
 *   node feishu_sheet.js validation --ss <token> --sheet <sheetId> [--delete-all]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Config: try openclaw.json, then env vars
let APP_ID, APP_SECRET;
const configPaths = [
  '/root/.openclaw/openclaw.json',
  process.env.OPENCLAW_CONFIG,
].filter(Boolean);

for (const p of configPaths) {
  try {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    APP_ID = cfg.channels?.feishu?.appId;
    APP_SECRET = cfg.channels?.feishu?.appSecret;
    if (APP_ID) break;
  } catch {}
}
APP_ID = APP_ID || process.env.FEISHU_APP_ID;
APP_SECRET = APP_SECRET || process.env.FEISHU_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.error('Error: Feishu app credentials not found. Set FEISHU_APP_ID/FEISHU_APP_SECRET or configure openclaw.json');
  process.exit(1);
}

let TOKEN = '';

function req(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'open.feishu.cn', path: apiPath, method,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${TOKEN}` }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(options, (res) => {
      let chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { resolve({ error: e.message }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function getToken() {
  const res = await req('POST', '/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: APP_ID, app_secret: APP_SECRET
  });
  TOKEN = res.tenant_access_token;
  if (!TOKEN) throw new Error('Failed to get token: ' + JSON.stringify(res));
}

// --- Commands ---

async function cmdCreate(args) {
  const title = args['--title'] || '未命名表格';
  const configFile = args['--config'];

  const res = await req('POST', '/open-apis/sheets/v3/spreadsheets', { title });
  if (res.code !== 0) { console.error('Create failed:', res.msg); process.exit(1); }
  const ss = res.data.spreadsheet.spreadsheet_token;
  const url = res.data.spreadsheet.url;
  console.log(JSON.stringify({ token: ss, url }));

  if (configFile) {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    await applyConfig(ss, config);
  }
  return ss;
}

async function applyConfig(ss, config) {
  // config format: { sheets: [{ name, data, dropdowns, header, colWidths }], permissions: {...} }
  
  // Get default sheet
  const meta = await req('GET', `/open-apis/sheets/v3/spreadsheets/${ss}/sheets/query`);
  const defaultId = meta.data?.sheets?.[0]?.sheet_id;

  if (config.sheets && config.sheets.length > 0) {
    // Rename default + add extras
    const requests = [];
    if (config.sheets[0]) {
      requests.push({ updateSheet: { properties: { sheetId: defaultId, title: config.sheets[0].name } } });
    }
    for (let i = 1; i < config.sheets.length; i++) {
      requests.push({ addSheet: { properties: { title: config.sheets[i].name, index: i } } });
    }
    await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/sheets_batch_update`, { requests });

    // Re-fetch sheet IDs
    const allRes = await req('GET', `/open-apis/sheets/v3/spreadsheets/${ss}/sheets/query`);
    const sheetMap = {};
    for (const s of allRes.data?.sheets || []) { sheetMap[s.title] = s.sheet_id; }

    // Apply each sheet config
    for (const sheetCfg of config.sheets) {
      const sid = sheetMap[sheetCfg.name];
      if (!sid) continue;

      // Write data
      if (sheetCfg.data) {
        const lr = sheetCfg.data.length;
        const lc = Math.max(...sheetCfg.data.map(r => r.length));
        const endCol = String.fromCharCode(64 + lc);
        await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/values`, {
          valueRange: { range: `${sid}!A1:${endCol}${lr}`, values: sheetCfg.data }
        });
      }

      // Header style
      if (sheetCfg.header) {
        const h = sheetCfg.header;
        await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/style`, {
          appendStyle: {
            range: h.range ? `${sid}!${h.range}` : `${sid}!A1:${String.fromCharCode(64 + (sheetCfg.data?.[0]?.length || 8))}1`,
            style: { bold: h.bold !== false, backColor: h.bg || '#4472C4', foreColor: h.fg || '#FFFFFF' }
          }
        });
      }

      // Freeze rows
      if (sheetCfg.freezeRow) {
        await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/sheets_batch_update`, {
          requests: [{ updateSheet: { properties: { sheetId: sid, frozenRowCount: sheetCfg.freezeRow } } }]
        });
      }

      // Column widths
      if (sheetCfg.colWidths) {
        for (let i = 0; i < sheetCfg.colWidths.length; i++) {
          await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/dimension_range`, {
            dimension: { sheetId: sid, majorDimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
            dimensionProperties: { fixedSize: sheetCfg.colWidths[i] }
          });
        }
      }

      // Dropdowns with colors
      if (sheetCfg.dropdowns) {
        for (const dd of sheetCfg.dropdowns) {
          const ok = await createDropdown(ss, sid, dd.range, dd.values, dd.colors);
          console.log(`  Dropdown ${sid}!${dd.range}: ${ok ? '✅' : '❌'}`);
        }
      }
    }
  }

  // Permissions
  if (config.permissions) {
    const p = config.permissions;
    if (p.users) {
      for (const u of p.users) {
        await req('POST', `/open-apis/drive/v1/permissions/${ss}/members?type=sheet&need_notification=true`, {
          member_type: 'openid', member_id: u.id, perm: u.perm || 'full_access'
        });
      }
    }
    if (p.public) {
      await req('PATCH', `/open-apis/drive/v1/permissions/${ss}/public?type=sheet`, {
        external_access_entity: 'open', link_share_entity: p.public
      });
    }
  }
}

async function createDropdown(ss, sheetId, range, values, colors) {
  const body = {
    range: `${sheetId}!${range}`,
    dataValidationType: 'list',
    dataValidation: {
      conditionValues: values,
      options: { multipleValues: false }
    }
  };
  if (colors && colors.length > 0) {
    body.dataValidation.options.highlightValidData = true;
    body.dataValidation.options.colors = colors;  // ⚠️ 必须是数组！
  }
  const res = await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/dataValidation`, body);
  return res.code === 0;
}

async function cmdWrite(args) {
  const ss = args['--ss'];
  const sid = args['--sheet'];
  const range = args['--range'];
  const file = args['--file'];
  
  if (!ss || !sid || !range || !file) {
    console.error('Usage: write --ss <token> --sheet <sheetId> --range "A1:H12" --file data.json');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/values`, {
    valueRange: { range: `${sid}!${range}`, values: data }
  });
  console.log(res.code === 0 ? '✅ Written' : `❌ ${res.msg}`);
}

async function cmdDropdown(args) {
  const ss = args['--ss'];
  const sid = args['--sheet'];
  const range = args['--range'];
  const values = JSON.parse(args['--values']);
  const colors = args['--colors'] ? JSON.parse(args['--colors']) : null;
  const deleteFirst = args['--delete-existing'];

  if (!ss || !sid || !range || !values) {
    console.error('Usage: dropdown --ss <token> --sheet <sheetId> --range "C2:C12" --values \'["A","B"]\' [--colors \'["#F00","#0F0"]\'] [--delete-existing]');
    process.exit(1);
  }

  if (deleteFirst) {
    await deleteValidations(ss, sid);
  }

  const ok = await createDropdown(ss, sid, range, values, colors);
  console.log(ok ? '✅ Dropdown created' : '❌ Failed');
}

async function cmdHeader(args) {
  const ss = args['--ss'];
  const sid = args['--sheet'];
  const range = args['--range'] || 'A1:Z1';
  const bg = args['--bg'] || '#4472C4';
  const fg = args['--fg'] || '#FFFFFF';
  const bold = args.hasOwnProperty('--bold');
  const freezeRow = args['--freeze-row'];

  if (!ss || !sid) {
    console.error('Usage: header --ss <token> --sheet <sheetId> [--range A1:H1] [--bg #4472C4] [--fg #FFF] [--bold] [--freeze-row 1]');
    process.exit(1);
  }

  await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/style`, {
    appendStyle: { range: `${sid}!${range}`, style: { bold, backColor: bg, foreColor: fg } }
  });

  if (freezeRow) {
    await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/sheets_batch_update`, {
      requests: [{ updateSheet: { properties: { sheetId: sid, frozenRowCount: parseInt(freezeRow) } } }]
    });
  }
  console.log('✅ Header styled');
}

async function cmdColwidth(args) {
  const ss = args['--ss'];
  const sid = args['--sheet'];
  const widths = args['--widths'].split(',').map(Number);

  if (!ss || !sid || !widths.length) {
    console.error('Usage: colwidth --ss <token> --sheet <sheetId> --widths "50,220,70"');
    process.exit(1);
  }

  for (let i = 0; i < widths.length; i++) {
    await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/dimension_range`, {
      dimension: { sheetId: sid, majorDimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
      dimensionProperties: { fixedSize: widths[i] }
    });
  }
  console.log('✅ Column widths set');
}

async function cmdPermission(args) {
  const ss = args['--ss'];
  const userId = args['--user'];
  const perm = args['--perm'] || 'full_access';
  const pub = args['--public'];

  if (!ss) {
    console.error('Usage: permission --ss <token> --user <open_id> --perm full_access');
    process.exit(1);
  }

  if (userId) {
    const res = await req('POST', `/open-apis/drive/v1/permissions/${ss}/members?type=sheet&need_notification=true`, {
      member_type: 'openid', member_id: userId, perm
    });
    console.log(res.code === 0 ? `✅ ${userId} -> ${perm}` : `❌ ${res.msg}`);
  }

  if (pub) {
    const res = await req('PATCH', `/open-apis/drive/v1/permissions/${ss}/public?type=sheet`, {
      external_access_entity: 'open', link_share_entity: pub
    });
    console.log(res.code === 0 ? `✅ Public: ${pub}` : `❌ ${res.msg}`);
  }
}

async function cmdRead(args) {
  const ss = args['--ss'];
  const sid = args['--sheet'];
  const range = args['--range'] || 'A1:Z100';

  const res = await req('GET', `/open-apis/sheets/v2/spreadsheets/${ss}/values/${sid}!${range}`);
  console.log(JSON.stringify(res.data?.valueRange?.values || [], null, 2));
}

async function cmdSheets(args) {
  const ss = args['--ss'];
  const res = await req('GET', `/open-apis/sheets/v3/spreadsheets/${ss}/sheets/query`);
  for (const s of res.data?.sheets || []) {
    console.log(`${s.sheet_id}\t${s.title}\tindex=${s.index}`);
  }
}

async function cmdAddSheet(args) {
  const ss = args['--ss'];
  const name = args['--name'];
  const index = args['--index'] ? parseInt(args['--index']) : undefined;

  const props = { title: name };
  if (index !== undefined) props.index = index;

  const res = await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/sheets_batch_update`, {
    requests: [{ addSheet: { properties: props } }]
  });
  if (res.code === 0) {
    const reply = res.data?.replies?.[0]?.addSheet?.properties;
    console.log(JSON.stringify({ sheetId: reply?.sheetId, title: reply?.title }));
  } else {
    console.error('❌', res.msg);
  }
}

async function deleteValidations(ss, sheetId) {
  const res = await req('GET', `/open-apis/sheets/v2/spreadsheets/${ss}/dataValidation?range=${sheetId}&dataValidationType=list`);
  const dvs = res.data?.dataValidations || [];
  for (const dv of dvs) {
    await req('DELETE', `/open-apis/sheets/v2/spreadsheets/${ss}/dataValidation/${dv.dataValidationId}?sheetId=${sheetId}`);
  }
  return dvs.length;
}

async function cmdValidation(args) {
  const ss = args['--ss'];
  const sid = args['--sheet'];
  const deleteAll = args.hasOwnProperty('--delete-all');

  if (deleteAll) {
    const n = await deleteValidations(ss, sid);
    console.log(`Deleted ${n} validations`);
  } else {
    const res = await req('GET', `/open-apis/sheets/v2/spreadsheets/${ss}/dataValidation?range=${sid}&dataValidationType=list`);
    for (const dv of res.data?.dataValidations || []) {
      console.log(`id=${dv.dataValidationId} range=${dv.ranges[0]} values=[${dv.conditionValues}] colors=${JSON.stringify(dv.options?.colorValueMap || {})}`);
    }
  }
}

async function cmdCheckPerms(args) {
  console.log('Testing feishu-sheet permissions...\n');
  
  const checks = [];
  
  // 1. Create spreadsheet
  const createRes = await req('POST', '/open-apis/sheets/v3/spreadsheets', { title: '__perm_check__' });
  const canCreate = createRes.code === 0;
  checks.push({ name: 'Create spreadsheet (sheets:spreadsheet:create)', ok: canCreate });
  
  if (canCreate) {
    const ss = createRes.data.spreadsheet.spreadsheet_token;
    const meta = await req('GET', `/open-apis/sheets/v3/spreadsheets/${ss}/sheets/query`);
    const sid = meta.data?.sheets?.[0]?.sheet_id;
    
    // 2. Read sheets
    checks.push({ name: 'List sheets (sheets:spreadsheet:read)', ok: meta.code === 0 });
    
    // 3. Write data
    const writeRes = await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/values`, {
      valueRange: { range: `${sid}!A1:B2`, values: [['test','data'],['a','b']] }
    });
    checks.push({ name: 'Write data (sheets:spreadsheet:write_only)', ok: writeRes.code === 0 });
    
    // 4. Read data
    const readRes = await req('GET', `/open-apis/sheets/v2/spreadsheets/${ss}/values/${sid}!A1:B2`);
    checks.push({ name: 'Read data (sheets:spreadsheet:readonly)', ok: readRes.code === 0 });
    
    // 5. Set style
    const styleRes = await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/style`, {
      appendStyle: { range: `${sid}!A1:B1`, style: { bold: true } }
    });
    checks.push({ name: 'Set style (sheets:spreadsheet)', ok: styleRes.code === 0 });
    
    // 6. Data validation (dropdown)
    const dvRes = await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/dataValidation`, {
      range: `${sid}!A2:A2`, dataValidationType: 'list',
      dataValidation: { conditionValues: ['X','Y'], options: { highlightValidData: true, colors: ['#FF0000','#00FF00'] } }
    });
    checks.push({ name: 'Color dropdown (dataValidation)', ok: dvRes.code === 0 });
    
    // 7. Permission management
    const permRes = await req('PATCH', `/open-apis/drive/v1/permissions/${ss}/public?type=sheet`, {
      external_access_entity: 'open', link_share_entity: 'anyone_readable'
    });
    checks.push({ name: 'Set permissions (drive:file, docs:permission)', ok: permRes.code === 0 });
    
    // Cleanup
    await req('DELETE', `/open-apis/drive/v1/files/${ss}?type=sheet`);
  }
  
  // Print results
  let pass = 0, fail = 0;
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.name}`);
    c.ok ? pass++ : fail++;
  }
  
  console.log(`\n${pass}/${checks.length} passed`);
  if (fail > 0) {
    console.log('\n⚠️ Some permissions missing. Fix:');
    console.log('  1. Open https://open.feishu.cn/app → Your App → Permissions');
    console.log('  2. Search and enable: sheets:spreadsheet, drive:file, docs:permission');
    console.log('  3. Or run: node feishu_sheet.js apply-perms');
  } else {
    console.log('✅ All permissions OK! Ready to use.');
  }
}

async function cmdApplyPerms(args) {
  // Apply for all declared but not-yet-approved scopes
  const res = await req('POST', '/open-apis/application/v6/scopes/apply');
  
  if (res.code === 0) {
    console.log('✅ Permission apply request sent to admin!');
    console.log('Admin needs to approve in Feishu Admin Console.');
  } else if (res.code === 212002) {
    console.log('✅ All permissions already granted, nothing to apply.');
  } else if (res.code === 212001) {
    console.log('⚠️ Remaining unapproved permissions are high-sensitivity scopes.');
    console.log('These must be approved manually in Feishu Admin Console:');
    console.log('  https://open.feishu.cn/app → Your App → Permissions');
  } else if (res.code === 212004) {
    console.log('⚠️ Duplicate apply request. Already pending admin approval.');
  } else {
    console.error('❌ Apply failed:', res.code, res.msg);
  }
}

async function cmdSetup(args) {
  console.log('🚀 feishu-sheet setup\n');

  // Step 1: Check credentials
  console.log('Step 1: Checking credentials...');
  try {
    await getToken();
    console.log(`  ✅ App ID: ${APP_ID.substring(0, 10)}...`);
    console.log(`  ✅ Token obtained\n`);
  } catch (e) {
    console.error('  ❌ Failed to get token. Check your FEISHU_APP_ID / FEISHU_APP_SECRET');
    console.error('  Set in openclaw.json (channels.feishu.appId/appSecret) or env vars.\n');
    process.exit(1);
  }

  // Step 2: Run permission check
  console.log('Step 2: Checking permissions (creating test spreadsheet)...');
  const checks = [];
  const createRes = await req('POST', '/open-apis/sheets/v3/spreadsheets', { title: '__setup_test__' });
  const canCreate = createRes.code === 0;
  checks.push({ name: 'Create spreadsheet', ok: canCreate, scope: 'sheets:spreadsheet:create' });

  if (canCreate) {
    const ss = createRes.data.spreadsheet.spreadsheet_token;
    const meta = await req('GET', `/open-apis/sheets/v3/spreadsheets/${ss}/sheets/query`);
    const sid = meta.data?.sheets?.[0]?.sheet_id;
    checks.push({ name: 'Read sheets', ok: meta.code === 0, scope: 'sheets:spreadsheet:read' });

    const writeRes = await req('PUT', `/open-apis/sheets/v2/spreadsheets/${ss}/values`, {
      valueRange: { range: `${sid}!A1:B2`, values: [['test','data'],['a','b']] }
    });
    checks.push({ name: 'Write data', ok: writeRes.code === 0, scope: 'sheets:spreadsheet:write_only' });

    const dvRes = await req('POST', `/open-apis/sheets/v2/spreadsheets/${ss}/dataValidation`, {
      range: `${sid}!A2:A2`, dataValidationType: 'list',
      dataValidation: { conditionValues: ['X','Y'], options: { highlightValidData: true, colors: ['#FF0000','#00FF00'] } }
    });
    checks.push({ name: 'Color dropdown', ok: dvRes.code === 0, scope: 'sheets:spreadsheet' });

    const permRes = await req('PATCH', `/open-apis/drive/v1/permissions/${ss}/public?type=sheet`, {
      external_access_entity: 'open', link_share_entity: 'anyone_readable'
    });
    checks.push({ name: 'Set permissions', ok: permRes.code === 0, scope: 'docs:permission' });

    await req('DELETE', `/open-apis/drive/v1/files/${ss}?type=sheet`);
  }

  let pass = 0, fail = 0;
  const missingScopes = [];
  for (const c of checks) {
    console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}`);
    c.ok ? pass++ : fail++;
    if (!c.ok) missingScopes.push(c.scope);
  }
  console.log(`  ${pass}/${checks.length} passed\n`);

  // Step 3: Apply missing permissions if needed
  if (fail > 0) {
    console.log('Step 3: Applying missing permissions...');
    console.log(`  Missing scopes: ${missingScopes.join(', ')}\n`);
    
    console.log('  ⚠️  Feishu requires 2 steps to grant permissions:');
    console.log('  ────────────────────────────────────────────');
    console.log('  A) Declare scopes in app config (manual, one-time):');
    console.log(`     1. Open: https://open.feishu.cn/app/${APP_ID}/`);
    console.log('     2. Go to "权限管理" (Permissions)');
    console.log('     3. Search and enable each scope:');
    for (const s of missingScopes) {
      console.log(`        - ${s}`);
    }
    console.log('     4. Click "创建版本并发布" (Create version & publish)');
    console.log('');
    console.log('  B) Request admin approval (can be automated):');
    
    const applyRes = await req('POST', '/open-apis/application/v6/scopes/apply');
    if (applyRes.code === 0) {
      console.log('     ✅ Apply request sent! Waiting for admin approval.');
    } else if (applyRes.code === 212002) {
      console.log('     ℹ️  No pending scopes to apply. Complete step A first.');
    } else {
      console.log(`     ⚠️  Apply returned: ${applyRes.code} ${applyRes.msg}`);
    }
    
    console.log('\n  After approval, run this again to verify:');
    console.log('  node feishu_sheet.js setup\n');
  } else {
    console.log('Step 3: ✅ All permissions OK!\n');
    console.log('🎉 Setup complete! You can now use all feishu-sheet commands.');
    console.log('   Example: node feishu_sheet.js create --title "My Sheet"');
  }
}

// --- CLI ---
function parseArgs(argv) {
  const args = { _cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i];
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.log('Usage: feishu_sheet.js <command> [options]');
    console.log('Commands: setup, create, write, read, dropdown, header, colwidth, permission, sheets, add-sheet, validation, check-perms, apply-perms');
    process.exit(0);
  }

  const args = parseArgs(rawArgs);
  await getToken();

  switch (args._cmd) {
    case 'create': await cmdCreate(args); break;
    case 'write': await cmdWrite(args); break;
    case 'read': await cmdRead(args); break;
    case 'dropdown': await cmdDropdown(args); break;
    case 'header': await cmdHeader(args); break;
    case 'colwidth': await cmdColwidth(args); break;
    case 'permission': await cmdPermission(args); break;
    case 'sheets': await cmdSheets(args); break;
    case 'add-sheet': await cmdAddSheet(args); break;
    case 'validation': await cmdValidation(args); break;
    case 'check-perms': await cmdCheckPerms(args); break;
    case 'apply-perms': await cmdApplyPerms(args); break;
    case 'setup': await cmdSetup(args); break;
    default:
      console.error(`Unknown command: ${args._cmd}`);
      process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
