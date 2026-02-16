#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 从环境变量读取配置，或使用默认值
const APP_ID = process.env.FEISHU_APP_ID || 'cli_a9f77611ef785cd2';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '9nNv3H5wdaLibay3w1tVMfWGQiRKiigT';

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
            } else {
                normalBlocks.push(block);
            }
        }

        // Flush remaining normal blocks
        if (normalBlocks.length > 0) {
            await addBlocks(token, doc.document_id, normalBlocks);
            totalBlocks += normalBlocks.length;
        }

        console.log(`✅ Content uploaded (${totalBlocks} blocks, ${tableCount} tables)`);
    }

    // Auto-assign permission if user ID provided
    if (userId) {
        console.log(`\n🔓 Attempting to assign permission to user: ${userId}`);
        try {
            await addPermissionMember(token, doc.document_id, userId, 'edit', false);
            console.log(`✅ Permission assigned successfully!`);
        } catch (err) {
            console.warn(`⚠️  Auto-assign permission failed: ${err.message}`);
            console.warn(`   Please manually share the document with the user.`);
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
  node lark_manager.js create --title "My Doc" --user ou_e512bb532a31e199e2c7e81966b87db0

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
  node lark_manager.js add-permission --doc <doc_id> --user ou_e512bb532a31e199e2c7e81966b87db0 --perm edit

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
    listPermissionMembers,
    updatePermissionMember,
    deletePermissionMember
};
