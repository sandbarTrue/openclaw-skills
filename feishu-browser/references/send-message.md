# 发送消息

## 完整流程

### Step 0: 确保浏览器已启动

```
browser action=start profile=openclaw
```

### Step 1: 导航到消息页

```
browser action=navigate profile=openclaw targetUrl="https://ja484frx8z.feishu.cn/next/messenger/"
```

等待 2-3 秒，用 screenshot 确认页面加载完成。

### Step 2: 点击目标群聊

用 snapshot 获取左侧聊天列表，找到目标群聊的 ref，点击进入。

```
browser action=snapshot profile=openclaw
browser action=act profile=openclaw request={kind:"click", ref:"<群聊ref>"}
```

如果聊天列表不可见，检查 viewport 宽度是否 ≥1280。

### Step 3: 清空输入框

```javascript
// ✅ 已验证
(function(){
  var el = document.querySelector('[contenteditable=true]');
  el.focus();
  el.innerHTML = '';
  document.execCommand('selectAll');
  document.execCommand('delete');
  return 'cleared';
})()
```

通过 browser evaluate 执行：
```
browser action=act profile=openclaw request={kind:"evaluate", fn:"(function(){ var el = document.querySelector('[contenteditable=true]'); el.focus(); el.innerHTML = ''; document.execCommand('selectAll'); document.execCommand('delete'); return 'cleared'; })()"}
```

### Step 4: 写入消息内容

```javascript
// ✅ 已验证
(function(){
  var el = document.querySelector('[contenteditable=true]');
  el.focus();
  document.execCommand('insertText', false, '你要发送的消息');
  return 'inserted';
})()
```

**⚠️ 关键：必须用 `execCommand('insertText')`，不能用 innerHTML/innerText！**

### Step 5: 点击发送按钮

```javascript
// ✅ 已验证 - viewport 1280x800 下发送按钮位置
(function(){
  var btns = document.querySelectorAll('button');
  for(var i=0; i<btns.length; i++){
    var r = btns[i].getBoundingClientRect();
    if(r.y > 730 && r.x > 1210){
      btns[i].click();
      return 'sent';
    }
  }
  return 'send btn not found';
})()
```

## @人 {#at人}

### 方法

在消息内容中需要 @某人时：

1. 先写入 `@` 前面的文字（如果有）
2. 用 `execCommand('insertText', false, '@')` 输入 @ 符号
3. 等待 1-2 秒，飞书会弹出选人下拉列表
4. 用 snapshot 找到目标人名的 ref
5. 点击目标人名
6. 继续输入后续文字
7. 点击发送

```javascript
// ✅ 已验证 - 输入 @ 触发选人列表
(function(){
  var el = document.querySelector('[contenteditable=true]');
  el.focus();
  document.execCommand('insertText', false, '@');
  return 'at inserted';
})()
```

然后等待 1-2 秒后，用 evaluate 找到目标人名并点击：

```javascript
// ✅ 已验证 - 在选人列表中点击目标人名（例：杨紫雪）
(function(){
  var all = document.querySelectorAll('*');
  for(var i=0; i<all.length; i++){
    if(all[i].textContent.trim() === '杨紫雪' && all[i].children.length === 0){
      var r = all[i].getBoundingClientRect();
      if(r.y > 500){
        all[i].closest('[class]').click();
        return 'clicked';
      }
    }
  }
  return 'not found';
})()
```

将 `'杨紫雪'` 替换为目标人名。`r.y > 500` 确保只匹配输入框下方弹出的选人列表，而非聊天记录中的同名文字。

**群成员名单：** 周军、杨紫雪、杨大哥、瓦力

### @人后继续输入

点击选中人名后，飞书会自动在 @ 标签后插入一个空格。此时可以继续用 `execCommand('insertText')` 输入后续内容。

## 多行消息

`execCommand('insertText')` 支持 `\n` 换行：

```javascript
// ⚠️ 待验证 - 多行消息
(function(){
  var el = document.querySelector('[contenteditable=true]');
  el.focus();
  document.execCommand('insertText', false, '第一行\n第二行\n第三行');
  return 'inserted';
})()
```

如果 `\n` 不生效，可以分步插入，中间用 Shift+Enter：

```
// ⚠️ 待验证 - 用 Shift+Enter 换行
browser action=act profile=openclaw request={kind:"press", key:"Shift+Enter"}
```

## 完整示例：发送一条带 @人 的消息

目标：发送 "@张三 你好，请查看文档"

1. 导航到消息页，进入目标群聊
2. 清空输入框
3. 输入 `@`，等待选人列表
4. snapshot 找到「张三」，点击
5. 输入 ` 你好，请查看文档`
6. 点击发送按钮
