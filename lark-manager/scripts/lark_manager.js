#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 从 OpenClaw 配置读取飞书凭据（保持与 OpenClaw channel 一致）
function loadFeishuCredentials() {
    // 优先环境变量
    if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
        return { appId: process.env.FEISHU_APP_ID, appSecret: process.env.FEISHU_APP_SECRET };
    }
    // 从 openclaw.json 读取
    const configPaths = [
        path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json'),
        '/root/.openclaw/openclaw.json',
    ];
    for (const p of configPaths) {
        try {
            const config = JSON.parse(fs.readFileSync(p, 'utf-8'));
            const feishu = (config.channels || {}).feishu || {};
            if (feishu.appId && feishu.appSecret) {
                return { appId: feishu.appId, appSecret: feishu.appSecret };
            }
        } catch {}
    }
    // 最终兜底（不应该走到这里）
    console.error('⚠️  Warning: Could not read Feishu credentials from openclaw.json, using fallback');
    return { appId: 'YOUR_APP_ID', appSecret: 'YOUR_APP_SECRET' };
}

const { appId: APP_ID, appSecret: APP_SECRET } = loadFeishuCredentials();

// Default document owner - the user (all documents auto-transfer to this user)
// Note: open_id is per-app. This is the user's open_id under app YOUR_APP_ID
const DEFAULT_OWNER_ID = 'YOUR_OPEN_ID';

// Block type mappings
const BLOCK_TYPES = {
    1: 'page',
    2: 'text',
    3: 'heading1',
    4: 'heading2',
    5: 'heading3',
    6: 'heading4',
    7: 'heading5',
    8: 'heading6',
    9: 'heading7',
    10: 'heading8',
    11: 'heading9',
    12: 'bullet',
    13: 'ordered',
    14: 'code',
    15: 'quote',
    16: 'divider',
    17: 'image',
    18: 'table_old',
    19: 'callout',
    20: 'todo',
    21: 'equation',
    22: 'view',
    31: 'table',
    32: 'table_cell'
};

// Reverse mapping
const TYPE_TO_BLOCK = Object.fromEntries(
    Object.entries(BLOCK_TYPES).map(([k, v]) => [v, parseInt(k)])
);

/**
 * Get tenant access token for API authentication
 */
async function getTenantAccessToken() {
    const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
    try {
        const response = await axios.post(url, {
            app_id: APP_ID,
            app_secret: APP_SECRET
        });
        if (response.data.code !== 0) {
            throw new Error(`Get token failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.tenant_access_token;
    } catch (error) {
        throw new Error(`Error getting token: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Create a new document
 */
async function createDocument(token, title = 'Untitled', folderToken = '') {
    const url = 'https://open.feishu.cn/open-apis/docx/v1/documents';
    try {
        const response = await axios.post(url, {
            title,
            folder_token: folderToken
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Create doc failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data.document;
    } catch (error) {
        throw new Error(`Error creating doc: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Get document metadata
 */
async function getDocument(token, documentId) {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Get doc failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data.document;
    } catch (error) {
        throw new Error(`Error getting doc: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Get blocks (children) of a document or block
 */
async function getBlocks(token, documentId, blockId = null, pageToken = '', pageSize = 50) {
    const targetBlockId = blockId || documentId;
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${targetBlockId}/children`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: {
                page_size: pageSize,
                page_token: pageToken || undefined
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Get blocks failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data;
    } catch (error) {
        throw new Error(`Error getting blocks: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Get all blocks (with pagination)
 */
async function getAllBlocks(token, documentId, blockId = null) {
    let allBlocks = [];
    let pageToken = '';
    let hasMore = true;

    while (hasMore) {
        const result = await getBlocks(token, documentId, blockId, pageToken);
        allBlocks = allBlocks.concat(result.items || []);
        pageToken = result.page_token;
        hasMore = result.has_more;
    }

    return allBlocks;
}

/**
 * Update a block's content
 */
async function updateBlock(token, documentId, blockId, updates) {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`;
    try {
        const response = await axios.patch(url, updates, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Update block failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data;
    } catch (error) {
        throw new Error(`Error updating block: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Download image from URL or read from local file
 * @returns {{ fileData: Buffer, fileName: string } | null}
 */
async function loadImageData(imageSource) {
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
        try {
            const resp = await axios.get(imageSource, { responseType: 'arraybuffer', timeout: 30000 });
            const urlPath = new URL(imageSource).pathname;
            return { fileData: Buffer.from(resp.data), fileName: path.basename(urlPath) || 'image.jpg' };
        } catch (err) {
            console.error(`⚠️  Failed to download image: ${imageSource} - ${err.message}`);
            return null;
        }
    } else {
        if (!fs.existsSync(imageSource)) {
            console.error(`⚠️  Image file not found: ${imageSource}`);
            return null;
        }
        return { fileData: fs.readFileSync(imageSource), fileName: path.basename(imageSource) };
    }
}

/**
 * Build multipart payload for Feishu media upload
 */
function buildMultipartPayload(fields, fileData, fileName) {
    const boundary = 'feishu_img_' + Date.now();
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    const contentType = mimeTypes[ext] || 'image/jpeg';
    
    let parts = [];
    for (const f of fields) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`));
    parts.push(fileData);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    return { payload: Buffer.concat(parts), boundary };
}

/**
 * Upload image to Feishu drive via medias/upload_all
 * @param {string} token - tenant access token
 * @param {string} parentNode - parent_node for upload (block_id or doc_id)
 * @param {Buffer} fileData - image data
 * @param {string} fileName - file name
 * @returns {{ fileToken: string|null, errorCode: number|null }}
 */
async function uploadMediaToFeishu(token, parentNode, fileData, fileName) {
    const fields = [
        { name: 'parent_type', value: 'docx_image' },
        { name: 'parent_node', value: parentNode },
        { name: 'size', value: String(fileData.length) },
        { name: 'file_name', value: fileName },
    ];
    const { payload, boundary } = buildMultipartPayload(fields, fileData, fileName);
    
    try {
        const resp = await axios.post('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            },
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024
        });
        
        if (resp.data.code === 0 && resp.data.data?.file_token) {
            return { fileToken: resp.data.data.file_token, errorCode: null };
        }
        return { fileToken: null, errorCode: resp.data.code };
    } catch (err) {
        // Axios errors: extract response data if available
        if (err.response?.data) {
            const code = err.response.data.code;
            console.error(`⚠️  Image upload failed: code=${code} msg=${err.response.data.msg}`);
            return { fileToken: null, errorCode: code };
        }
        console.error(`⚠️  Image upload failed: ${err.message}`);
        return { fileToken: null, errorCode: -1 };
    }
}

/**
 * Upload an image to a Feishu document and return the file_token
 * Uses block_id as parent_node (works on personal tenants)
 */
async function uploadImageToDoc(token, parentNode, imageSource) {
    const img = await loadImageData(imageSource);
    if (!img) return null;
    const { fileToken } = await uploadMediaToFeishu(token, parentNode, img.fileData, img.fileName);
    return fileToken;
}

// Tenant image upload capability cache (per process lifetime)
let _tenantImageMode = null; // 'block' | 'import'

/**
 * Insert image into document — auto-detect tenant capability
 * 
 * Strategy A (block mode): 3-step — create empty image block → upload to block_id → PATCH replace_image
 * Strategy B (import mode): for enterprise tenants where block_id upload returns 1061044
 *   Uses docx import: build a .docx file with embedded image → import into existing doc
 * 
 * @param {string} token - tenant access token
 * @param {string} documentId - target document ID
 * @param {string} imageSource - URL or local file path
 * @param {string} [imageAlt] - alt text for fallback
 * @returns {boolean} success
 */
async function insertImageIntoDoc(token, documentId, imageSource, imageAlt) {
    const img = await loadImageData(imageSource);
    if (!img) return false;
    
    // Try Strategy A first (unless we already know this tenant needs import mode)
    if (_tenantImageMode !== 'import') {
        const result = await _insertImageBlockMode(token, documentId, img);
        if (result === true) {
            _tenantImageMode = 'block';
            return true;
        }
        if (result === 'parent_not_exist') {
            console.log(`   ℹ️  Enterprise tenant detected — switching to import mode`);
            _tenantImageMode = 'import';
        } else {
            return false; // Other error, don't fallback
        }
    }
    
    // Strategy B: import mode
    return await _insertImageImportMode(token, documentId, img, imageAlt);
}

/**
 * Strategy A: 3-step block mode (personal/standard tenants)
 * @returns {true|'parent_not_exist'|false}
 */
async function _insertImageBlockMode(token, documentId, img) {
    try {
        // Step 1: Create empty image block
        const step1Resp = await axios.post(
            `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
            { children: [{ block_type: 27, image: {} }], index: -1 },
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (step1Resp.data.code !== 0) throw new Error(`Step 1 failed: ${JSON.stringify(step1Resp.data)}`);
        const imgBlockId = step1Resp.data.data.children[0].block_id;
        
        // Step 2: Upload image with parent_node = block_id
        const { fileToken, errorCode } = await uploadMediaToFeishu(token, imgBlockId, img.fileData, img.fileName);
        if (!fileToken) {
            if (errorCode === 1061044) return 'parent_not_exist';
            throw new Error(`Step 2 failed: upload error code ${errorCode}`);
        }
        
        // Step 3: PATCH replace_image
        const step3Resp = await axios.patch(
            `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${imgBlockId}`,
            { replace_image: { token: fileToken }, document_revision_id: -1 },
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (step3Resp.data.code !== 0) throw new Error(`Step 3 failed: ${JSON.stringify(step3Resp.data)}`);
        return true;
    } catch (err) {
        if (err.message && err.message.includes('parent_not_exist')) return 'parent_not_exist';
        console.error(`   ⚠️  Block mode failed: ${err.message}`);
        return false;
    }
}

/**
 * Strategy B: Import mode (enterprise tenants like ByteDance)
 * Creates a minimal .docx with the image, imports it as a NEW Feishu doc.
 * Returns the imported document ID (caller handles merging/linking).
 * 
 * For single-image inserts, creates a standalone imported doc and adds a link
 * in the target document pointing to the image.
 */
async function _insertImageImportMode(token, documentId, img, imageAlt) {
    try {
        // Build .docx with the image
        const docxBuffer = buildMinimalDocxWithImage(img.fileData, img.fileName, imageAlt);
        
        // Step 1: Upload .docx to drive
        const uploadFields = [
            { name: 'parent_type', value: 'explorer' },
            { name: 'parent_node', value: '' },
            { name: 'size', value: String(docxBuffer.length) },
            { name: 'file_name', value: 'image_import.docx' },
        ];
        const { payload, boundary } = buildMultipartPayload(uploadFields, docxBuffer, 'image_import.docx');
        
        const uploadResp = await axios.post('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            },
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024
        });
        
        if (uploadResp.data.code !== 0) throw new Error(`Upload .docx failed: ${JSON.stringify(uploadResp.data)}`);
        const docxFileToken = uploadResp.data.data.file_token;
        
        // Step 2: Create import task
        const importResp = await axios.post('https://open.feishu.cn/open-apis/drive/v1/import_tasks', {
            file_extension: 'docx',
            file_token: docxFileToken,
            type: 'docx',
            point: { mount_type: 1, mount_key: '' }
        }, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        
        if (importResp.data.code !== 0) throw new Error(`Import task failed: ${JSON.stringify(importResp.data)}`);
        const ticket = importResp.data.data.ticket;
        
        // Step 3: Poll for completion (max 60s)
        let importedDocId = null;
        let importedUrl = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const statusResp = await axios.get(`https://open.feishu.cn/open-apis/drive/v1/import_tasks/${ticket}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = statusResp.data.data?.result;
            if (result && result.job_status === 0 && result.token) {
                importedDocId = result.token;
                importedUrl = result.url;
                break;
            } else if (result && result.job_status >= 100) {
                // 100+ = definite failure (129=save_as_import etc)
                throw new Error(`Import failed (status=${result.job_status}): ${result.job_error_msg}`);
            }
        }
        if (!importedDocId) throw new Error('Import timed out after 60s');
        
        // Step 4: Add a text block in target doc with link to the imported image doc
        // (Enterprise tenants don't support cross-doc image token references)
        const linkUrl = importedUrl || `https://feishu.cn/docx/${importedDocId}`;
        const altLabel = imageAlt || '图片';
        
        // Add the image link as a clickable text block
        await axios.post(
            `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
            { children: [{
                block_type: 2,
                text: { elements: [
                    { text_run: { content: `📷 ${altLabel} `, text_element_style: { bold: true } } },
                    { text_run: { content: '📎 查看图片', text_element_style: { link: { url: encodeURI(linkUrl) }, bold: true, underline: true } } }
                ] }
            }], index: -1 },
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        
        console.log(`   📎 Image imported as linked doc: ${importedDocId}`);
        return true;
    } catch (err) {
        console.error(`   ⚠️  Import mode failed: ${err.message}`);
        return false;
    }
}

/**
 * Build a .docx file containing a single image
 * Uses python3 + python-docx if available, falls back to manual ZIP construction
 * @returns {Buffer} .docx file data
 */
function buildMinimalDocxWithImage(imageData, imageName, altText) {
    const { execSync } = require('child_process');
    const os = require('os');
    const tmpDir = os.tmpdir();
    const imgPath = path.join(tmpDir, 'lm_img_' + Date.now() + '_' + imageName);
    const docxPath = path.join(tmpDir, 'lm_docx_' + Date.now() + '.docx');
    
    try {
        fs.writeFileSync(imgPath, imageData);
        
        // Try python-docx first (produces fully valid .docx files)
        const pyScript = `
import sys
from docx import Document
from docx.shared import Inches
doc = Document()
doc.add_picture(sys.argv[1], width=Inches(5))
doc.save(sys.argv[2])
`;
        // Write python script to temp file to avoid shell escaping issues
        const pyPath = path.join(tmpDir, 'lm_mkdocx_' + Date.now() + '.py');
        fs.writeFileSync(pyPath, pyScript);
        
        const pyEnv = { ...process.env, PYTHONPATH: '/usr/local/lib/python3.8/dist-packages:/usr/local/lib/python3/dist-packages:/usr/lib/python3/dist-packages' };
        const pythonPaths = ['/usr/bin/python3', 'python3', '/usr/local/bin/python3'];
        
        for (const pyBin of pythonPaths) {
            try {
                execSync(`${pyBin} "${pyPath}" "${imgPath}" "${docxPath}"`, {
                    timeout: 15000, stdio: 'pipe', env: pyEnv
                });
                if (fs.existsSync(docxPath)) {
                    const result = fs.readFileSync(docxPath);
                    console.log(`   📦 Built .docx via python-docx (${result.length} bytes)`);
                    try { fs.unlinkSync(pyPath); } catch {}
                    return result;
                }
            } catch {}
        }
        try { fs.unlinkSync(pyPath); } catch {}
        
        // Try pip install as last resort
        console.log(`   ℹ️  python-docx not found, trying pip install...`);
        try {
            execSync('pip3 install python-docx -q --break-system-packages 2>/dev/null || pip3 install python-docx -q', { timeout: 30000, stdio: 'pipe' });
            fs.writeFileSync(pyPath, pyScript);
            execSync(`python3 "${pyPath}" "${imgPath}" "${docxPath}"`, { timeout: 15000, stdio: 'pipe' });
            try { fs.unlinkSync(pyPath); } catch {}
            if (fs.existsSync(docxPath)) {
                const result = fs.readFileSync(docxPath);
                console.log(`   📦 Built .docx via python-docx after install (${result.length} bytes)`);
                return result;
            }
        } catch (installErr) {
            console.log(`   ℹ️  pip install failed, falling back to manual .docx construction`);
        }
        try { fs.unlinkSync(pyPath); } catch {}
        
        // Fallback: manual OOXML ZIP construction
        return _buildDocxManually(imageData, imageName);
    } finally {
        try { fs.unlinkSync(imgPath); } catch {}
        try { fs.unlinkSync(docxPath); } catch {}
    }
}

/**
 * Manual .docx construction (fallback when python-docx is unavailable)
 */
function _buildDocxManually(imageData, imageName) {
    const ext = imageName.split('.').pop().toLowerCase();
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
    const mime = mimeMap[ext] || 'image/png';
    const imgExt = ext === 'jpg' ? 'jpeg' : ext;
    
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="${imgExt}" ContentType="${mime}"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.${imgExt}"/></Relationships>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="5000000" cy="3500000"/><wp:docPr id="1" name="Image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="${imageName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5000000" cy="3500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`;

    const files = [
        { path: '[Content_Types].xml', data: Buffer.from(contentTypes), compress: true },
        { path: '_rels/.rels', data: Buffer.from(rels), compress: true },
        { path: 'word/document.xml', data: Buffer.from(documentXml), compress: true },
        { path: 'word/_rels/document.xml.rels', data: Buffer.from(wordRels), compress: true },
        { path: `word/media/image1.${imgExt}`, data: imageData, compress: false },
    ];
    
    return _buildZip(files);
}

function _buildZip(files) {
    const entries = [];
    let offset = 0;
    const centralDir = [];
    
    for (const file of files) {
        const nameBuffer = Buffer.from(file.path);
        const rawData = file.data;
        const crc = _crc32(rawData);
        let compressedData, method;
        
        if (file.compress) {
            const deflated = require('zlib').deflateRawSync(rawData);
            compressedData = deflated.length < rawData.length ? deflated : rawData;
            method = deflated.length < rawData.length ? 8 : 0;
        } else {
            compressedData = rawData;
            method = 0;
        }
        
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(method, 8);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(compressedData.length, 18);
        lh.writeUInt32LE(rawData.length, 22);
        lh.writeUInt16LE(nameBuffer.length, 26);
        entries.push(lh, nameBuffer, compressedData);
        
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(method, 10);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(compressedData.length, 20);
        cd.writeUInt32LE(rawData.length, 24);
        cd.writeUInt16LE(nameBuffer.length, 28);
        cd.writeUInt32LE(offset, 42);
        centralDir.push(cd, nameBuffer);
        
        offset += 30 + nameBuffer.length + compressedData.length;
    }
    
    const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(offset, 16);
    
    return Buffer.concat([...entries, ...centralDir, eocd]);
}

function _crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = _crc32.t || (_crc32.t = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c; }
        return t;
    })());
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Add new blocks to a document
 */
async function addBlocks(token, documentId, blocks, parentBlockId = null) {
    const targetBlockId = parentBlockId || documentId;
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${targetBlockId}/children`;

    const chunkSize = 50;
    for (let i = 0; i < blocks.length; i += chunkSize) {
        const chunk = blocks.slice(i, i + chunkSize);
        try {
            const response = await axios.post(url, {
                children: chunk,
                index: -1
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
            if (response.data.code !== 0) {
                console.error('Add blocks warning:', JSON.stringify(response.data));
            }
        } catch (error) {
            console.error('Error adding blocks:', error.response ? JSON.stringify(error.response.data) : error.message);
        }
    }
    return { success: true };
}

/**
 * Add nested/descendant blocks (for tables, etc.)
 * Uses the descendant API which supports parent-child hierarchy
 */
async function addDescendants(token, documentId, childrenId, descendants, parentBlockId = null) {
    const targetBlockId = parentBlockId || documentId;
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${targetBlockId}/descendant`;

    try {
        const response = await axios.post(url, {
            children_id: childrenId,
            descendants: descendants,
            index: -1
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
        if (response.data.code !== 0) {
            console.error('Add descendants warning:', JSON.stringify(response.data));
            return { success: false, error: response.data };
        }
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Error adding descendants:', error.response ? JSON.stringify(error.response.data) : error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Delete blocks
 */
async function deleteBlock(token, documentId, blockId) {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`;
    try {
        const response = await axios.delete(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Delete block failed: ${JSON.stringify(response.data)}`);
        }
        return { success: true };
    } catch (error) {
        throw new Error(`Error deleting block: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Add document permission member (授权)
 * API: https://open.feishu.cn/open-apis/drive/v1/permissions/:token/members
 */
async function addPermissionMember(token, documentId, userId, perm = 'edit', notify = false) {
    const url = `https://open.feishu.cn/open-apis/drive/v1/permissions/${documentId}/members`;
    try {
        const response = await axios.post(url, {
            member_type: 'openid',
            member_id: userId,
            perm: perm
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: {
                type: 'docx',
                need_notification: notify
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Add permission failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data;
    } catch (error) {
        throw new Error(`Error adding permission: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Transfer document owner
 * API: POST https://open.feishu.cn/open-apis/drive/v1/permissions/:token/members/transfer_owner
 */
async function transferOwner(token, documentId, userId, removeOldOwner = false) {
    const url = `https://open.feishu.cn/open-apis/drive/v1/permissions/${documentId}/members/transfer_owner`;
    try {
        const response = await axios.post(url, {
            member_type: 'openid',
            member_id: userId,
            remove_old_owner: removeOldOwner
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: {
                type: 'docx',
                need_notification: true
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Transfer owner failed: code=${response.data.code}, msg=${response.data.msg}`);
        }
        return response.data.data;
    } catch (error) {
        throw new Error(`Error transferring owner: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * List document permission members
 * API: https://open.feishu.cn/open-apis/drive/v1/permissions/:token/members
 */
async function listPermissionMembers(token, documentId, pageSize = 50) {
    const url = `https://open.feishu.cn/open-apis/drive/v1/permissions/${documentId}/members`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: {
                type: 'docx',
                page_size: pageSize
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`List permissions failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data;
    } catch (error) {
        throw new Error(`Error listing permissions: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Update permission member
 * API: https://open.feishu.cn/open-apis/drive/v1/permissions/:token/members
 */
async function updatePermissionMember(token, documentId, userId, perm = 'edit') {
    const url = `https://open.feishu.cn/open-apis/drive/v1/permissions/${documentId}/members`;
    try {
        const response = await axios.put(url, {
            member_type: 'openid',
            member_id: userId,
            perm: perm
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: {
                type: 'docx'
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Update permission failed: ${JSON.stringify(response.data)}`);
        }
        return response.data.data;
    } catch (error) {
        throw new Error(`Error updating permission: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Delete permission member
 * API: https://open.feishu.cn/open-apis/drive/v1/permissions/:token/members
 */
async function deletePermissionMember(token, documentId, userId) {
    const url = `https://open.feishu.cn/open-apis/drive/v1/permissions/${documentId}/members`;
    try {
        const response = await axios.delete(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: {
                type: 'docx',
                member_type: 'openid',
                member_id: userId
            }
        });
        if (response.data.code !== 0) {
            throw new Error(`Delete permission failed: ${JSON.stringify(response.data)}`);
        }
        return { success: true };
    } catch (error) {
        throw new Error(`Error deleting permission: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

/**
 * Parse inline markdown formats to text_run elements
 * Supports: **bold**, *italic*, ~~strikethrough~~, `inline_code`, [link](url)
 */
function parseInlineFormats(text) {
    const elements = [];
    let remaining = text;

    // Combined regex for all inline formats
    // Order matters: links first (to avoid matching * inside []), then bold/italic/code/strikethrough
    const patterns = [
        // Link: [text](url)
        { regex: /\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
        // Bold: **text**
        { regex: /\*\*([^*]+)\*\*/, type: 'bold' },
        // Italic: *text* or _text_ (not preceded by * to avoid matching **)
        { regex: /(?<!\*)\*([^*]+)\*(?!\*)/, type: 'italic' },
        { regex: /_([^_]+)_/, type: 'italic' },
        // Strikethrough: ~~text~~
        { regex: /~~([^~]+)~~/, type: 'strikethrough' },
        // Inline code: `code` (not matching ``)
        { regex: /(?<!`)`([^`]+)`(?!`)/, type: 'inline_code' }
    ];

    while (remaining.length > 0) {
        let earliestMatch = null;
        let earliestIndex = Infinity;
        let earliestPattern = null;

        // Find the earliest match among all patterns
        for (const pattern of patterns) {
            const match = remaining.match(pattern.regex);
            if (match && match.index < earliestIndex) {
                earliestMatch = match;
                earliestIndex = match.index;
                earliestPattern = pattern;
            }
        }

        if (earliestMatch) {
            // Add plain text before the match
            if (earliestIndex > 0) {
                elements.push({
                    text_run: {
                        content: remaining.substring(0, earliestIndex),
                        text_element_style: {}
                    }
                });
            }

            // Add the matched element with style
            const matchedText = earliestMatch[1];
            const style = {};

            switch (earliestPattern.type) {
                case 'link':
                    style.link = { url: earliestMatch[2] };
                    break;
                case 'bold':
                    style.bold = true;
                    break;
                case 'italic':
                    style.italic = true;
                    break;
                case 'strikethrough':
                    style.strikethrough = true;
                    break;
                case 'inline_code':
                    style.inline_code = true;
                    break;
            }

            elements.push({
                text_run: {
                    content: matchedText,
                    text_element_style: style
                }
            });

            // Move past the matched portion
            remaining = remaining.substring(earliestIndex + earliestMatch[0].length);
        } else {
            // No more matches, add remaining text as plain
            if (remaining.length > 0) {
                elements.push({
                    text_run: {
                        content: remaining,
                        text_element_style: {}
                    }
                });
            }
            break;
        }
    }

    // If no elements were created (empty text), return one empty element
    if (elements.length === 0) {
        elements.push({
            text_run: {
                content: '',
                text_element_style: {}
            }
        });
    }

    return elements;
}

/**
 * Parse markdown table to list-based blocks
 * Converts table headers to bold text, rows to bullet lists with | separator
 */
function parseMarkdownTable(lines, startIndex) {
    let i = startIndex;
    const tableLines = [];

    // Collect all table lines
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            tableLines.push(line);
            i++;
        } else {
            break;
        }
    }

    if (tableLines.length < 2) {
        return { table: null, endIndex: startIndex };
    }

    // Parse table structure
    const headerLine = tableLines[0];
    const headers = headerLine.split('|').map(h => h.trim()).filter(h => h.length > 0);
    const colCount = headers.length;

    // Data rows (skip separator at index 1)
    const dataRows = [];
    for (let j = 2; j < tableLines.length; j++) {
        const cells = tableLines[j].split('|').map(c => c.trim()).filter(c => c.length > 0);
        // Pad or trim to match column count
        while (cells.length < colCount) cells.push('');
        dataRows.push(cells.slice(0, colCount));
    }

    const rowCount = 1 + dataRows.length; // header + data rows
    const tableId = 'tbl_' + Math.random().toString(36).substring(2, 8);

    // Build descendant structure
    const childrenId = [tableId];
    const descendants = [];
    const cellIds = [];
    const cellTextIds = [];

    // Generate IDs for all cells and their text blocks
    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
            const cellId = `cell_${r}_${c}_${Math.random().toString(36).substring(2, 6)}`;
            const textId = `txt_${r}_${c}_${Math.random().toString(36).substring(2, 6)}`;
            cellIds.push(cellId);
            cellTextIds.push(textId);
        }
    }

    // Table block
    descendants.push({
        block_id: tableId,
        block_type: 31,
        table: {
            property: {
                row_size: rowCount,
                column_size: colCount
            }
        },
        children: cellIds
    });

    // Cell blocks + their text content
    let idx = 0;
    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
            const cellId = cellIds[idx];
            const textId = cellTextIds[idx];

            // Determine cell content
            let content = '';
            let isBold = false;
            if (r === 0) {
                content = headers[c] || '';
                isBold = true; // Header row is bold
            } else {
                content = dataRows[r - 1][c] || '';
            }

            // Table cell block
            descendants.push({
                block_id: cellId,
                block_type: 32,
                table_cell: {},
                children: [textId]
            });

            // Text block inside cell
            const elements = isBold
                ? parseInlineFormats(`**${content}**`)
                : parseInlineFormats(content);
            descendants.push({
                block_id: textId,
                block_type: 2,
                text: { elements: elements },
                children: []
            });

            idx++;
        }
    }

    return { table: { childrenId, descendants }, endIndex: i };
}

/**
 * Parse Markdown to Feishu blocks
 */
function parseMarkdownToBlocks(markdown) {
    const lines = markdown.split('\n');
    const blocks = [];

    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = 'text';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim() === '') continue;

        if (line.startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                inCodeBlock = false;
                blocks.push({
                    block_type: TYPE_TO_BLOCK.code,
                    code: {
                        style: {},
                        elements: [{
                            text_run: {
                                content: codeContent.join('\n'),
                                text_element_style: {}
                            }
                        }],
                        language: codeLanguage
                    }
                });
                codeContent = [];
                codeLanguage = 'text';
            } else {
                // Start code block
                inCodeBlock = true;
                codeLanguage = line.substring(3).trim() || 'text';
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        // Check for table (starts with |)
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            const result = parseMarkdownTable(lines, i);
            if (result.table) {
                // Insert a special marker for table (handled separately via descendant API)
                blocks.push({ _tableDescendant: result.table });
            }
            i = result.endIndex - 1; // -1 because loop will increment
            continue;
        }

        if (line.startsWith('# ')) {
            blocks.push({
                block_type: TYPE_TO_BLOCK.heading1,
                heading1: {
                    elements: parseInlineFormats(line.substring(2))
                }
            });
        } else if (line.startsWith('## ')) {
            blocks.push({
                block_type: TYPE_TO_BLOCK.heading2,
                heading2: {
                    elements: parseInlineFormats(line.substring(3))
                }
            });
        } else if (line.startsWith('### ')) {
            blocks.push({
                block_type: TYPE_TO_BLOCK.heading3,
                heading3: {
                    elements: parseInlineFormats(line.substring(4))
                }
            });
        } else if (line.startsWith('- ') || (line.startsWith('* ') && !line.match(/^\*\*[^*]+\*\*/))) {
            blocks.push({
                block_type: TYPE_TO_BLOCK.bullet,
                bullet: {
                    elements: parseInlineFormats(line.substring(2))
                }
            });
        } else if (line.match(/^\d+\. /)) {
            blocks.push({
                block_type: TYPE_TO_BLOCK.ordered,
                ordered: {
                    elements: parseInlineFormats(line.replace(/^\d+\. /, ''))
                }
            });
        } else if (line.startsWith('> ')) {
            // Quote block
            blocks.push({
                block_type: TYPE_TO_BLOCK.quote,
                quote: {
                    elements: parseInlineFormats(line.substring(2))
                }
            });
        } else if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)) {
            // Image: ![alt](url)
            const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
            blocks.push({ _imageUrl: m[2], _imageAlt: m[1] || '' });
        } else if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)) {
            // Image inline (with possible text after)
            const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
            blocks.push({ _imageUrl: m[2], _imageAlt: m[1] || '' });
        } else {
            blocks.push({
                block_type: TYPE_TO_BLOCK.text,
                text: {
                    elements: parseInlineFormats(line)
                }
            });
        }
    }
    return blocks;
}

/**
 * Convert Feishu blocks to Markdown
 */
function blocksToMarkdown(blocks) {
    const lines = [];

    for (const block of blocks) {
        const type = BLOCK_TYPES[block.block_type] || 'unknown';

        switch (type) {
            case 'heading1':
                const h1 = block.heading1?.elements?.[0]?.text_run?.content || '';
                if (h1) lines.push(`# ${h1}`);
                break;
            case 'heading2':
                const h2 = block.heading2?.elements?.[0]?.text_run?.content || '';
                if (h2) lines.push(`## ${h2}`);
                break;
            case 'heading3':
                const h3 = block.heading3?.elements?.[0]?.text_run?.content || '';
                if (h3) lines.push(`### ${h3}`);
                break;
            case 'text':
                const text = block.text?.elements?.[0]?.text_run?.content || '';
                if (text) lines.push(text);
                break;
            case 'bullet':
                const bullet = block.bullet?.elements?.[0]?.text_run?.content || '';
                if (bullet) lines.push(`- ${bullet}`);
                break;
            case 'ordered':
                const ordered = block.ordered?.elements?.[0]?.text_run?.content || '';
                if (ordered) lines.push(`1. ${ordered}`);
                break;
            case 'code':
                const code = block.code?.elements?.[0]?.text_run?.content || '';
                const lang = block.code?.language || 'text';
                if (code) lines.push(`\`\`\`${lang}\n${code}\n\`\`\``);
                break;
            case 'quote':
                const quote = block.quote?.elements?.[0]?.text_run?.content || '';
                if (quote) lines.push(`> ${quote}`);
                break;
            case 'divider':
                lines.push('---');
                break;
            default:
                lines.push(`[Unsupported block type: ${type}]`);
        }
    }

    return lines.join('\n');
}

/**
 * Print blocks in human-readable format
 */
function printBlocks(blocks, verbose = false) {
    console.log(`\n📄 Found ${blocks.length} blocks:\n`);
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const type = BLOCK_TYPES[block.block_type] || 'unknown';
        const id = block.block_id || 'no-id';

        let content = '';
        switch (type) {
            case 'heading1':
                content = block.heading1?.elements?.[0]?.text_run?.content || '';
                break;
            case 'heading2':
                content = block.heading2?.elements?.[0]?.text_run?.content || '';
                break;
            case 'heading3':
                content = block.heading3?.elements?.[0]?.text_run?.content || '';
                break;
            case 'text':
                content = block.text?.elements?.[0]?.text_run?.content || '';
                break;
            case 'bullet':
                content = block.bullet?.elements?.[0]?.text_run?.content || '';
                break;
            case 'ordered':
                content = block.ordered?.elements?.[0]?.text_run?.content || '';
                break;
            case 'code':
                content = '[Code Block]';
                break;
            case 'quote':
                content = block.quote?.elements?.[0]?.text_run?.content || '';
                break;
            default:
                content = `[${type}]`;
        }

        const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
        console.log(`[${i}] ${type.padEnd(10)} | ${id.substring(0, 8)}... | ${preview}`);

        if (verbose) {
            console.log(`    Full: ${JSON.stringify(block, null, 2)}\n`);
        }
    }
}

/**
 * Command: Create document
 */
async function cmdCreate(args) {
    const title = args.title || args.t || 'Untitled';
    const markdown = args.file || args.f || null;
    const folder = args.folder || null;
    const userId = args.user || args.u || null;

    console.log(`📝 Creating document: ${title}`);

    const token = await getTenantAccessToken();
    const doc = await createDocument(token, title, folder || '');

    console.log(`✅ Document created!`);
    console.log(`   URL: https://feishu.cn/docx/${doc.document_id}`);
    console.log(`   ID: ${doc.document_id}`);

    if (markdown) {
        console.log(`\n📄 Uploading content from: ${markdown}`);
        const content = fs.readFileSync(markdown, 'utf8');
        const allBlocks = parseMarkdownToBlocks(content);

        // Separate normal blocks from table descendants
        let normalBlocks = [];
        let tableCount = 0;
        let totalBlocks = 0;

        let imageCount = 0;
        for (const block of allBlocks) {
            if (block._tableDescendant) {
                // Flush normal blocks first
                if (normalBlocks.length > 0) {
                    await addBlocks(token, doc.document_id, normalBlocks);
                    totalBlocks += normalBlocks.length;
                    normalBlocks = [];
                }
                // Add table via descendant API (rate limit: 3/sec per doc)
                await new Promise(r => setTimeout(r, 400));
                const result = await addDescendants(
                    token, doc.document_id,
                    block._tableDescendant.childrenId,
                    block._tableDescendant.descendants
                );
                if (result.success) {
                    tableCount++;
                    totalBlocks++;
                } else {
                    console.error(`⚠️  Table creation failed, falling back to list format`);
                    // Fallback: add as text
                    normalBlocks.push({
                        block_type: 2,
                        text: { elements: [{ text_run: { content: '[Table failed to render]', text_element_style: {} } }] }
                    });
                }
            } else if (block._imageUrl) {
                // Flush normal blocks first
                if (normalBlocks.length > 0) {
                    await addBlocks(token, doc.document_id, normalBlocks);
                    totalBlocks += normalBlocks.length;
                    normalBlocks = [];
                }
                // Insert image — auto-detects tenant type:
                // Strategy A (block mode): 3-step — create block → upload to block_id → PATCH
                // Strategy B (import mode): for enterprise tenants — build .docx → import
                console.log(`   📷 Uploading image: ${block._imageAlt || block._imageUrl.substring(0, 60)}...`);
                
                const imgSuccess = await insertImageIntoDoc(token, doc.document_id, block._imageUrl, block._imageAlt);
                if (imgSuccess) {
                    imageCount++;
                    totalBlocks++;
                    console.log(`   ✅ Image inserted (${imageCount})`);
                } else {
                    console.error(`   ⚠️  Image insert failed, falling back to link`);
                    // Fallback: insert as clickable link
                    const encodedUrl = encodeURI(block._imageUrl).replace(/%25/g, '%');
                    normalBlocks.push({
                        block_type: 2,
                        text: {
                            elements: [{
                                text_run: { content: `📷 ${block._imageAlt || '图片'}  `, text_element_style: { bold: true } }
                            }, {
                                text_run: { content: '👉 点击查看大图', text_element_style: { link: { url: encodedUrl }, bold: true } }
                            }]
                        }
                    });
                }
            } else {
                normalBlocks.push(block);
            }
        }

        // Flush remaining normal blocks
        if (normalBlocks.length > 0) {
            await addBlocks(token, doc.document_id, normalBlocks);
            totalBlocks += normalBlocks.length;
        }

        console.log(`✅ Content uploaded (${totalBlocks} blocks, ${tableCount} tables, ${imageCount} images)`);
    }

    // Auto-transfer owner: default to the user if no user specified
    const ownerUserId = userId || DEFAULT_OWNER_ID;
    if (ownerUserId) {
        console.log(`\n🔓 Transferring document owner to: ${ownerUserId}`);
        try {
            // First add as full_access collaborator (required before transfer)
            await addPermissionMember(token, doc.document_id, ownerUserId, 'full_access', false);
            // Then transfer ownership
            await transferOwner(token, doc.document_id, ownerUserId, false);
            console.log(`✅ Document owner transferred successfully!`);
        } catch (err) {
            console.warn(`⚠️  Owner transfer failed: ${err.message}`);
            console.warn(`   Falling back to full_access permission...`);
            try {
                await addPermissionMember(token, doc.document_id, ownerUserId, 'full_access', false);
                console.log(`✅ Full access permission assigned as fallback.`);
            } catch (err2) {
                console.warn(`⚠️  Fallback also failed: ${err2.message}`);
            }
        }
    }

    return doc;
}

/**
 * Command: Read document
 */
async function cmdRead(args) {
    const docId = args.doc || args.d;
    const output = args.output || args.o || null;
    const verbose = args.verbose || args.v || false;

    if (!docId) {
        throw new Error('Document ID required (--doc or -d)');
    }

    console.log(`📖 Reading document: ${docId}`);

    const token = await getTenantAccessToken();
    const doc = await getDocument(token, docId);
    const blocks = await getAllBlocks(token, docId);

    console.log(`\n📄 Document: ${doc.title}`);
    console.log(`   Created: ${new Date(doc.create_time * 1000).toLocaleString()}`);
    console.log(`   Revision: ${doc.revision_id}`);

    if (output) {
        const markdown = blocksToMarkdown(blocks);
        fs.writeFileSync(output, markdown, 'utf8');
        console.log(`\n✅ Exported to: ${output}`);
    } else {
        printBlocks(blocks, verbose);
    }

    return { doc, blocks };
}

/**
 * Command: Edit document
 */
async function cmdEdit(args) {
    const docId = args.doc || args.d;
    const blockId = args.block || args.b;
    const newText = args.text || args.t;
    const file = args.file || args.f || null;

    if (!docId) throw new Error('Document ID required (--doc or -d)');
    if (!blockId && !file) throw new Error('Block ID (--block) or file (--file) required');

    console.log(`✏️  Editing document: ${docId}`);

    const token = await getTenantAccessToken();

    if (file) {
        // Append content from file to document
        console.log(`📄 Appending content from: ${file}`);
        const content = fs.readFileSync(file, 'utf8');
        const allBlocks = parseMarkdownToBlocks(content);

        // Separate normal blocks from table descendants (same logic as cmdCreate)
        let normalBlocks = [];
        let tableCount = 0;
        let totalBlocks = 0;

        for (const block of allBlocks) {
            if (block._tableDescendant) {
                if (normalBlocks.length > 0) {
                    await addBlocks(token, docId, normalBlocks);
                    totalBlocks += normalBlocks.length;
                    normalBlocks = [];
                }
                await new Promise(r => setTimeout(r, 400));
                const result = await addDescendants(
                    token, docId,
                    block._tableDescendant.childrenId,
                    block._tableDescendant.descendants
                );
                if (result.success) {
                    tableCount++;
                    totalBlocks++;
                } else {
                    console.error(`⚠️  Table creation failed`);
                    normalBlocks.push({
                        block_type: 2,
                        text: { elements: [{ text_run: { content: '[Table failed to render]', text_element_style: {} } }] }
                    });
                }
            } else {
                normalBlocks.push(block);
            }
        }

        if (normalBlocks.length > 0) {
            await addBlocks(token, docId, normalBlocks);
            totalBlocks += normalBlocks.length;
        }

        console.log(`✅ Content appended (${totalBlocks} blocks, ${tableCount} tables)`);
    } else if (blockId && newText) {
        // Update single block
        console.log(`📝 Updating block: ${blockId}`);
        await updateBlock(token, docId, blockId, {
            text: {
                elements: [{ text_run: { content: newText, text_element_style: {} } }]
            }
        });
        console.log(`✅ Block updated`);
    }

    return { success: true };
}

/**
 * Command: List blocks
 */
async function cmdList(args) {
    const docId = args.doc || args.d;
    const verbose = args.verbose || args.v || false;

    if (!docId) {
        throw new Error('Document ID required (--doc or -d)');
    }

    console.log(`📋 Listing blocks for: ${docId}`);

    const token = await getTenantAccessToken();
    const blocks = await getAllBlocks(token, docId);

    printBlocks(blocks, verbose);

    return { docId, blocks };
}

/**
 * Command: Add permission member (授权)
 */
async function cmdAddPermission(args) {
    const docId = args.doc || args.d;
    const userId = args.user || args.u;
    const perm = args.perm || args.p || 'edit';
    const notify = args.notify || false;

    if (!docId) throw new Error('Document ID required (--doc or -d)');
    if (!userId) throw new Error('User ID required (--user or -u)');

    console.log(`🔓 Adding permission to document: ${docId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Permission: ${perm}`);

    const token = await getTenantAccessToken();
    const result = await addPermissionMember(token, docId, userId, perm, notify);

    console.log(`✅ Permission added!`);
    console.log(`   Document URL: https://feishu.cn/docx/${docId}`);

    return result;
}

/**
 * Command: List permission members
 */
async function cmdListPermissions(args) {
    const docId = args.doc || args.d;

    if (!docId) {
        throw new Error('Document ID required (--doc or -d)');
    }

    console.log(`👥 Listing permissions for: ${docId}`);

    const token = await getTenantAccessToken();
    const result = await listPermissionMembers(token, docId);

    console.log(`\n📄 Found ${result.items?.length || 0} members:\n`);

    for (const member of result.items || []) {
        const role = member.type || 'unknown';
        const perm = member.perm || 'unknown';
        const userId = member.user?.user_id || member.user?.open_id || 'unknown';
        const name = member.user?.name || 'Unknown';

        console.log(`👤 ${name} (${userId})`);
        console.log(`   Role: ${role} | Permission: ${perm}\n`);
    }

    return result;
}

/**
 * Command: Update permission member
 */
async function cmdUpdatePermission(args) {
    const docId = args.doc || args.d;
    const userId = args.user || args.u;
    const perm = args.perm || args.p || 'edit';

    if (!docId) throw new Error('Document ID required (--doc or -d)');
    if (!userId) throw new Error('User ID required (--user or -u)');

    console.log(`🔄 Updating permission for: ${docId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   New Permission: ${perm}`);

    const token = await getTenantAccessToken();
    const result = await updatePermissionMember(token, docId, userId, perm);

    console.log(`✅ Permission updated!`);

    return result;
}

/**
 * Command: Delete permission member
 */
async function cmdDeletePermission(args) {
    const docId = args.doc || args.d;
    const userId = args.user || args.u;

    if (!docId) throw new Error('Document ID required (--doc or -d)');
    if (!userId) throw new Error('User ID required (--user or -u)');

    console.log(`🗑️  Deleting permission for: ${docId}`);
    console.log(`   User ID: ${userId}`);

    const token = await getTenantAccessToken();
    await deletePermissionMember(token, docId, userId);

    console.log(`✅ Permission deleted!`);

    return { success: true };
}

/**
 * Command: Test API connection
 */
/**
 * Command: Transfer document owner
 */
async function cmdTransferOwner(args) {
    const docId = args.doc || args.d;
    const userId = args.user || args.u || DEFAULT_OWNER_ID;

    if (!docId) {
        console.error('❌ Document ID required (--doc or -d)');
        process.exit(1);
    }
    if (!userId) {
        console.error('❌ User ID required (--user or -u)');
        process.exit(1);
    }

    console.log(`🔄 Transferring owner of document: ${docId}`);
    console.log(`   New owner: ${userId}`);

    const token = await getTenantAccessToken();

    // First ensure user has full_access
    try {
        await addPermissionMember(token, docId, userId, 'full_access', false);
        console.log(`✅ Full access granted`);
    } catch (err) {
        console.log(`ℹ️  Permission already exists or add failed: ${err.message}`);
    }

    // Transfer ownership
    const result = await transferOwner(token, docId, userId, false);
    console.log(`✅ Owner transferred successfully!`);
    console.log(`   Document URL: https://feishu.cn/docx/${docId}`);
    return result;
}

async function cmdTest() {
    console.log(`🧪 Testing API connection...`);

    try {
        const token = await getTenantAccessToken();
        console.log(`✅ Token obtained successfully`);
        console.log(`   App ID: ${APP_ID}`);

        // Try to get document list if app has permission
        console.log(`\n📋 Testing document access...`);
        const response = await axios.get('https://open.feishu.cn/open-apis/drive/v1/files', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
            },
            params: { page_size: 1 }
        });

        if (response.data.code === 0) {
            console.log(`✅ Document access OK`);
        } else {
            console.log(`⚠️  Document access warning:`, JSON.stringify(response.data));
        }
    } catch (error) {
        console.error(`❌ Test failed:`, error.response ? JSON.stringify(error.response.data) : error.message);
        throw error;
    }
}

/**
 * Main CLI
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const parsedArgs = {};
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            parsedArgs[args[i].substring(2)] = args[i + 1];
            i++;
        } else if (args[i].startsWith('-')) {
            parsedArgs[args[i].substring(1)] = args[i + 1];
            i++;
        }
    }

    try {
        switch (command) {
            case 'create':
                await cmdCreate(parsedArgs);
                break;
            case 'read':
                await cmdRead(parsedArgs);
                break;
            case 'edit':
                await cmdEdit(parsedArgs);
                break;
            case 'list':
                await cmdList(parsedArgs);
                break;
            case 'add-permission':
                await cmdAddPermission(parsedArgs);
                break;
            case 'list-permissions':
                await cmdListPermissions(parsedArgs);
                break;
            case 'update-permission':
                await cmdUpdatePermission(parsedArgs);
                break;
            case 'delete-permission':
                await cmdDeletePermission(parsedArgs);
                break;
            case 'transfer-owner':
                await cmdTransferOwner(parsedArgs);
                break;
            case 'test':
                await cmdTest();
                break;
            default:
                console.log(`
📚 Lark/Feishu Document Manager

Usage:
  node lark_manager.js <command> [options]

Commands:
  create                Create a new document
  read                  Read document content
  edit                  Edit document content
  list                  List document blocks
  add-permission        Add permission member to document
  list-permissions      List document permission members
  update-permission     Update permission member
  delete-permission     Delete permission member
  test                  Test API connection

Create Options:
  --title, -t    Document title (default: Untitled)
  --file, -f     Upload content from markdown file
  --folder       Folder token to create in
  --user, -u     User ID to auto-assign edit permission (format: ou_xxxxxxxxxxxx)

Read Options:
  --doc, -d      Document ID (required)
  --output, -o   Export to markdown file
  --verbose, -v  Show block details

Edit Options:
  --doc, -d      Document ID (required)
  --block, -b    Block ID to update
  --text, -t     New text for block
  --file, -f     Replace entire document from file

List Options:
  --doc, -d      Document ID (required)
  --verbose, -v  Show block details

Permission Options:
  --doc, -d      Document ID (required)
  --user, -u     User ID (open_id format: ou_xxx)
  --perm, -p     Permission: view, edit, full_access (default: edit)
  --notify       Send notification to user (default: false)

Examples:
  # Create document and auto-assign permission
  node lark_manager.js create --title "My Doc" --user YOUR_OPEN_ID

  # Create document from markdown
  node lark_manager.js create --title "My Doc" --file content.md

  # Read document and export
  node lark_manager.js read --doc <doc_id> --output export.md

  # List blocks
  node lark_manager.js list --doc <doc_id>

  # Edit single block
  node lark_manager.js edit --doc <doc_id> --block <block_id> --text "New text"

  # Replace document content
  node lark_manager.js edit --doc <doc_id> --file new_content.md

  # Add permission (授权给用户)
  node lark_manager.js add-permission --doc <doc_id> --user YOUR_OPEN_ID --perm edit

  # List permissions
  node lark_manager.js list-permissions --doc <doc_id>

  # Update permission
  node lark_manager.js update-permission --doc <doc_id> --user ou_xxx --perm full_access

  # Delete permission
  node lark_manager.js delete-permission --doc <doc_id> --user ou_xxx

  # Test API connection
  node lark_manager.js test
`);
        }
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    getTenantAccessToken,
    createDocument,
    getDocument,
    getBlocks,
    getAllBlocks,
    updateBlock,
    addBlocks,
    deleteBlock,
    parseMarkdownToBlocks,
    blocksToMarkdown,
    addPermissionMember,
    transferOwner,
    listPermissionMembers,
    updatePermissionMember,
    deletePermissionMember
};
