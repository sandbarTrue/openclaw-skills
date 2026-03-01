# 飞书电子表格 API 参考

## 基础信息
- Base URL: `https://open.feishu.cn/open-apis`
- 认证: `Authorization: Bearer {tenant_access_token}`
- 获取 token: `POST /auth/v3/tenant_access_token/internal` body: `{ app_id, app_secret }`

## 电子表格操作

### 创建电子表格
```
POST /sheets/v3/spreadsheets
Body: { title: "表格标题" }
Response: { data: { spreadsheet: { spreadsheet_token, url } } }
```

### 获取工作表列表
```
GET /sheets/v3/spreadsheets/{token}/sheets/query
Response: { data: { sheets: [{ sheet_id, title, index }] } }
```

### 添加/修改工作表
```
POST /sheets/v2/spreadsheets/{token}/sheets_batch_update
Body: {
  requests: [
    { addSheet: { properties: { title: "Sheet名", index: 0 } } },
    { updateSheet: { properties: { sheetId: "xxx", title: "新名称" } } }
  ]
}
```

## 数据操作

### 写入数据
```
PUT /sheets/v2/spreadsheets/{token}/values
Body: {
  valueRange: {
    range: "{sheetId}!A1:H12",
    values: [["row1col1", "row1col2"], ["row2col1", "row2col2"]]
  }
}
```

### 读取数据
```
GET /sheets/v2/spreadsheets/{token}/values/{sheetId}!{range}
Response: { data: { valueRange: { values: [[...], ...] } } }
```

## 下拉列表（数据验证）

### 创建下拉列表（带颜色）⚠️ 最重要
```
POST /sheets/v2/spreadsheets/{token}/dataValidation
Body: {
  range: "{sheetId}!C2:C12",
  dataValidationType: "list",
  dataValidation: {
    conditionValues: ["选项1", "选项2", "选项3"],
    options: {
      multipleValues: false,
      highlightValidData: true,
      colors: ["#FF0000", "#00FF00", "#0000FF"]  // ⚠️ 必须是数组！
    }
  }
}
```
**⚠️ `colors` 必须是数组，和 `conditionValues` 一一对应。不要用 `colorValueMap`！**

### 查询下拉列表
```
GET /sheets/v2/spreadsheets/{token}/dataValidation?range={sheetId}&dataValidationType=list
Response: {
  data: {
    dataValidations: [{
      dataValidationId: 1,
      conditionValues: [...],
      options: { colorValueMap: {...}, highlightValidData: true },
      ranges: ["{sheetId}!C2:C12"]
    }]
  }
}
```
注意：GET 返回 `colorValueMap` 对象格式，但创建时必须用 `colors` 数组格式。

### 删除下拉列表
```
DELETE /sheets/v2/spreadsheets/{token}/dataValidation/{id}?sheetId={sheetId}
```

### 更新下拉列表
```
PUT /sheets/v2/spreadsheets/{token}/dataValidation/{id}
Body: 同创建格式
```

## 样式操作

### 设置单元格样式
```
PUT /sheets/v2/spreadsheets/{token}/style
Body: {
  appendStyle: {
    range: "{sheetId}!A1:H1",
    style: {
      bold: true,
      backColor: "#4472C4",
      foreColor: "#FFFFFF",
      fontSize: 12,
      hAlign: 0  // 0=左, 1=中, 2=右
    }
  }
}
```

### 批量设置样式
```
PUT /sheets/v2/spreadsheets/{token}/styles_batch_update
Body: {
  data: [{
    ranges: "{sheetId}!C2:C2",
    style: { backColor: "#E8F5E9" }
  }]
}
```

## 行列操作

### 冻结行列
```
POST /sheets/v2/spreadsheets/{token}/sheets_batch_update
Body: {
  requests: [{
    updateSheet: {
      properties: { sheetId: "xxx", frozenRowCount: 1 }
    }
  }]
}
```

### 设置列宽
```
PUT /sheets/v2/spreadsheets/{token}/dimension_range
Body: {
  dimension: {
    sheetId: "xxx",
    majorDimension: "COLUMNS",
    startIndex: 0,    // 列索引（0-based）
    endIndex: 1
  },
  dimensionProperties: { fixedSize: 200 }  // 像素宽度
}
```

## 权限管理

### 添加协作者
```
POST /drive/v1/permissions/{token}/members?type=sheet&need_notification=true
Body: { member_type: "openid", member_id: "ou_xxx", perm: "full_access" }
```
perm 可选: `full_access`, `edit`, `view`

### 设置公开分享
```
PATCH /drive/v1/permissions/{token}/public?type=sheet
Body: {
  external_access_entity: "open",
  link_share_entity: "anyone_editable"  // 或 "anyone_readable"
}
```

## 错误码
| Code | 说明 |
|------|------|
| 90204 | conditionValues should be one-to-one match with colors → 用 `colors` 数组代替 `colorValueMap` |
| 0 | 成功 |
| 99991663 | tenant token invalid → token 过期，重新获取 |

## 频率限制
- dataValidation: 100 次/秒
- 写入数据: 100 次/秒
- 读取数据: 100 次/秒
