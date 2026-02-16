# 文档权限设置

## 给组织内所有人开编辑权限（✅ 已验证 2026-02-14）

### Step 1: 打开目标文档

```
browser action=navigate profile=openclaw targetUrl="https://ja484frx8z.feishu.cn/wiki/<doc_token>"
```

### Step 2: 点击 Share 按钮

```javascript
// ✅ 已验证 - 找到顶部 Share 按钮并点击
(function(){
  var all = document.querySelectorAll('button, [role=button]');
  for(var i=0; i<all.length; i++){
    var t = all[i].textContent.trim();
    var r = all[i].getBoundingClientRect();
    if(t === 'Share' && r.x > 300 && r.y < 60){
      all[i].click();
      return 'clicked Share';
    }
  }
  return 'not found';
})()
```

等待 2 秒让分享弹窗出现。

### Step 3: 点击 "Can view" 下拉框

```javascript
// ✅ 已验证
(function(){
  var all = document.querySelectorAll('*');
  for(var i=0; i<all.length; i++){
    if(all[i].textContent.trim() === 'Can view' && all[i].children.length <= 1){
      var r = all[i].getBoundingClientRect();
      if(r.y > 250 && r.y < 310){
        all[i].click();
        return 'clicked Can view';
      }
    }
  }
  return 'not found';
})()
```

### Step 4: 选择 "Can edit"

```javascript
// ✅ 已验证
(function(){
  var all = document.querySelectorAll('*');
  for(var i=0; i<all.length; i++){
    if(all[i].textContent.trim() === 'Can edit' && all[i].children.length === 0){
      all[i].click();
      return 'clicked Can edit';
    }
  }
  return 'not found';
})()
```

### Step 5: 确认权限变更

弹出确认窗口，选项：
- Current page only（默认）
- Current page and sub-pages

```javascript
// ✅ 已验证
(function(){
  var all = document.querySelectorAll('*');
  for(var i=0; i<all.length; i++){
    if(all[i].textContent.trim() === 'Confirm' && all[i].children.length === 0){
      all[i].click();
      return 'confirmed';
    }
  }
  return 'not found';
})()
```

### 完成后

权限变更即时生效。Link sharing 显示 "Can edit"，组织内获得链接的人可编辑。

## 给特定人添加权限

在 Share 弹窗的 "Invite collaborators" 搜索框中输入人名：

```javascript
// ⚠️ 待验证
(function(){
  var input = document.querySelector('[placeholder*="Search for users"]');
  if(input){ input.focus(); document.execCommand('insertText', false, '周军'); return 'searching'; }
  return 'input not found';
})()
```

等待搜索结果出现后，点击目标人名即可添加。

## 注意事项

- 权限设置需要文档所有者权限
- 每步之间等待 1-2 秒确保 UI 更新
- 操作完毕后弹窗可通过点击空白处关闭
