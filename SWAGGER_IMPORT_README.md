# Swagger/OpenAPI 导入功能

## 已完成

已创建 `src/helpers/swagger_import.ts` 模块,包含以下功能:

1. **自动检测 Swagger 文档 URL**: 从 Swagger UI 地址提取可能的 API 文档地址
2. **支持多种格式**: Swagger 2.0 和 OpenAPI 3.0
3. **完整解析**: 解析请求方法、URL、参数、请求体、响应等
4. **自动生成示例**: 根据 JSON Schema 自动生成请求体示例数据

## 使用方法

### 1. 在 Collection 页面添加导入按钮

在 `src/components/APISettingTree/index.tsx` 或类似位置添加"从 Swagger 导入"按钮。

### 2. 调用导入功能

```typescript
import { importFromSwaggerUI } from '../helpers/swagger_import';

// 弹出对话框让用户输入 Swagger UI URL
const swaggerUrl = await prompt("请输入 Swagger UI 地址");

try {
  // 导入配置
  const configs = await importFromSwaggerUI(swaggerUrl);
  
  // 保存到数据库
  for (const config of configs) {
    await saveAPIConfig(config);
  }
  
  message.success(`成功导入 ${configs.length} 个接口`);
} catch (err) {
  showError(message, err);
}
```

### 3. 在 AppHeader 中添加菜单项

修改 `src/views/AppHeader.tsx`:

1. 在 `FnKey` enum 中添加:
```typescript
enum FnKey {
  // ... 其他项
  importSwagger = "importSwagger",
}
```

2. 在 `handleFunction` 中添加处理:
```typescript
case FnKey.importSwagger:
  handleImportSwagger();
  break;
```

3. 添加处理函数:
```typescript
const handleImportSwagger = async () => {
  // 使用 NaiveUI 的 dialog 显示输入框
  dialog.create({
    title: "从 Swagger 导入",
    content: () => {
      const urlRef = ref("");
      return (
        <NInput
          v-model:value={urlRef.value}
          placeholder="请输入 Swagger UI 地址，例如: http://192.168.1.8:20256/doc.html"
        />
      );
    },
    positiveText: "导入",
    negativeText: "取消",
    onPositiveClick: async () => {
      if (!urlRef.value) return;
      const loading = message.loading("正在导入...", { duration: 0 });
      try {
        const configs = await importFromSwaggerUI(urlRef.value);
        
        // 获取当前 collection
        const route = useRoute();
        const collection = route.query.collection as string;
        
        // 保存配置
        for (const config of configs) {
          config.collection = collection;
          await saveAPIConfig(config);
        }
        
        message.success(`成功导入 ${configs.length} 个接口`);
        // 刷新列表
        await apiSettingStore.fetch(collection);
      } catch (err) {
        showError(message, err);
      } finally {
        loading.destroy();
      }
    },
  });
};
```

4. 在菜单中添加选项:
```typescript
// 在 collection 页面的菜单中添加
{
  label: "从 Swagger 导入",
  key: FnKey.importSwagger,
  icon: () => (
    <NIcon>
      <DownloadOutline class="rotate180" />
    </NIcon>
  ),
}
```

## 支持的 Swagger URL 格式

- `http://host/v3/api-docs`
- `http://host/v2/api-docs`
- `http://host/swagger/v3/api-docs`
- `http://host/swagger.json`
- 等等...

用户只需要提供 Swagger UI 的 URL (如 `http://192.168.1.8:20256/doc.html`),
程序会自动尝试常见的 API 文档地址。

## 功能特性

1. **自动分组**: 根据 Swagger 的 tags 自动分组到不同的 folder
2. **参数解析**: 自动解析 query, header, path 参数
3. **请求体生成**: 根据 schema 自动生成示例 JSON
4. **完整 URL**: 自动拼接 baseUrl, basePath 和 path
5. **描述信息**: 保留接口的 summary 和 description

## 注意事项

1. **跨域问题**: 如果 Swagger 文档服务器不支持 CORS,可能无法直接获取。解决方案:
   - 让用户手动下载 JSON 文件并导入
   - 或者通过后端代理请求

2. **认证**: 如果 Swagger 文档需要认证,可能需要添加认证支持

3. **复杂 Schema**: 对于复杂的 JSON Schema(如 allOf, oneOf 等),目前只做简单处理
