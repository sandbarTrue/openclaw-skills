# 通过浏览器创建飞书文档

## 创建新文档（✅ 已验证 2026-02-14）

### Step 1: 导航到云空间

```
browser action=navigate profile=openclaw targetUrl="https://ja484frx8z.feishu.cn/drive/home/"
```

等待 2 秒。

### Step 2: 点击 New 按钮

```
browser action=snapshot profile=openclaw refs=aria
# 找到 New / Create a new document 区域的 ref，点击
```

### Step 3: 选择 "Docs"

```javascript
// ✅ 已验证
(function(){
  var all = document.querySelectorAll('*');
  for(var i=0; i<all.length; i++){
    if(all[i].textContent.trim() === 'Docs' && all[i].children.length === 0){
      var r = all[i].getBoundingClientRect();
      if(r.y > 130 && r.y < 200){
        all[i].click();
        return 'clicked Docs';
      }
    }
  }
  return 'not found';
})()
```

### Step 4: 选择 "New Docs"（空白文档）

```javascript
// ✅ 已验证
(function(){
  var all = document.querySelectorAll('*');
  for(var i=0; i<all.length; i++){
    if(all[i].textContent.trim() === 'New Docs' && all[i].children.length === 0){
      all[i].click();
      return 'clicked New Docs';
    }
  }
  return 'not found';
})()
```

等待 3 秒。新文档在新标签页打开。

### Step 5: 切换到新标签页

```
browser action=tabs profile=openclaw
# 找到 "Untitled document" 标签页的 targetId
browser action=screenshot profile=openclaw targetId=<新标签页targetId>
```

### Step 6: 输入标题

```javascript
// ✅ 已验证 - 标题是第一个 contenteditable 元素
(function(){
  var el = document.querySelector('[contenteditable=true]');
  if(el){
    el.focus();
    document.execCommand('insertText', false, '文档标题');
    return 'title inserted';
  }
  return 'not found';
})()
```

### Step 7: 按 Enter 进入正文，继续输入

```
browser action=act profile=openclaw targetId=<新标签页> request={kind:"press", key:"Enter"}
```

```javascript
// ✅ 已验证
(function(){
  document.execCommand('insertText', false, '正文内容');
  return 'content inserted';
})()
```

## 富文本格式（快捷键）

| 格式 | 快捷键 | 状态 |
|------|--------|------|
| 一级标题 | Ctrl+Alt+1 | ⚠️ 待验证 |
| 二级标题 | Ctrl+Alt+2 | ⚠️ 待验证 |
| 加粗 | Ctrl+B | ⚠️ 待验证 |
| 斜体 | Ctrl+I | ⚠️ 待验证 |
| 无序列表 | 输入 `- ` + 空格 | ⚠️ 待验证 |
| 有序列表 | 输入 `1. ` + 空格 | ⚠️ 待验证 |
| 分割线 | 输入 `---` + Enter | ⚠️ 待验证 |

## 插入流程图/画板

输入 `/` 触发命令菜单，搜索「画板」或「Flowchart」：

```javascript
// ⚠️ 待验证
(function(){
  document.execCommand('insertText', false, '/');
  return 'slash menu triggered';
})()
```

等待命令菜单出现后，用 snapshot 找到选项并点击。

## 文档质量要求

创建文档时确保：
- **思路清晰**：明确的结构和层次（标题→正文→总结）
- **逻辑通顺**：段落之间有连贯性
- **美观排版**：合理使用标题、列表、分割线、表格
- **适当图表**：必要时插入流程图

## 获取文档链接

```javascript
// ✅ 已验证
window.location.href
```
