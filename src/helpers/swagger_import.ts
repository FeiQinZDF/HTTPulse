import { HTTPRequest } from "../commands/http_request";
import { ulid } from "ulid";
import { APISetting } from "../commands/api_setting";
import { APIFolder, newDefaultAPIFolder } from "../commands/api_folder";

/**
 * Swagger/OpenAPI 文档导入
 */

interface SwaggerParameter {
  name: string;
  in: "query" | "header" | "path" | "body" | "formData";
  description?: string;
  required?: boolean;
  type?: string;
  schema?: any;
}

interface SwaggerPath {
  [method: string]: {
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: SwaggerParameter[];
    requestBody?: any;
    responses?: any;
  };
}

interface SwaggerDoc {
  swagger?: string; // Swagger 2.0
  openapi?: string; // OpenAPI 3.0
  info?: {
    title?: string;
    version?: string;
  };
  host?: string;
  basePath?: string;
  schemes?: string[];
  servers?: Array<{ url: string }>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  paths?: {
    [path: string]: SwaggerPath;
  };
  definitions?: any; // Swagger 2.0 definitions
  components?: any; // OpenAPI 3.0 components
}

/**
 * 从 Swagger UI URL 提取 API 文档 URL
 */
export function extractSwaggerJsonUrl(swaggerUiUrl: string): string[] {
  try {
    const url = new URL(swaggerUiUrl);
    const baseUrl = `${url.protocol}//${url.host}`;
    
    // 常见的 Swagger JSON 地址
    return [
      `${baseUrl}/v3/api-docs`,
      `${baseUrl}/v2/api-docs`,
      `${baseUrl}/swagger/v3/api-docs`,
      `${baseUrl}/swagger/v2/api-docs`,
      `${baseUrl}/api-docs`,
      `${baseUrl}/swagger.json`,
      `${baseUrl}/api/swagger.json`,
    ];
  } catch (err) {
    console.error("Invalid URL:", err);
    return [];
  }
}

/**
 * 获取 Swagger 文档
 */
export async function fetchSwaggerDoc(url: string): Promise<SwaggerDoc | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const doc = await response.json();
    return doc as SwaggerDoc;
  } catch (err) {
    console.error(`Failed to fetch ${url}:`, err);
    return null;
  }
}

/**
 * 尝试从多个可能的 URL 获取 Swagger 文档
 */
export async function fetchSwaggerDocFromUrls(urls: string[]): Promise<SwaggerDoc | null> {
  for (const url of urls) {
    const doc = await fetchSwaggerDoc(url);
    if (doc && (doc.swagger || doc.openapi)) {
      console.log(`Successfully fetched Swagger doc from: ${url}`);
      return doc;
    }
  }
  return null;
}

/**
 * 将 Swagger 参数转换为 KVParam
 */
function convertParameters(parameters: SwaggerParameter[] | undefined, type: "query" | "header") {
  if (!parameters) return [];
  
  return parameters
    .filter((p) => p.in === type)
    .map((p) => {
      // 优先使用 example，其次 default
      let value = "";
      if ((p as any).example !== undefined) {
        value = String((p as any).example);
      } else if ((p as any).default !== undefined) {
        value = String((p as any).default);
      } else if (p.schema) {
        // OpenAPI 3.0 参数可能有 schema
        const exampleValue = generateExampleFromSchema(p.schema, p.name);
        if (exampleValue !== null && exampleValue !== undefined) {
          value = String(exampleValue);
        }
      }
      
      return {
        key: p.name,
        value,
        enabled: !p.required ? true : true, // 默认都启用
        description: p.description,
      };
    });
}

/**
 * 解析请求体
 */
function parseRequestBody(requestBody: any, parameters?: SwaggerParameter[], doc?: SwaggerDoc): { body: string; contentType: string } {
  // OpenAPI 3.0 requestBody
  if (requestBody?.content) {
    const contentTypes = Object.keys(requestBody.content);
    const contentType = contentTypes[0] || "application/json";
    const mediaType = requestBody.content[contentType];
    const schema = mediaType?.schema;
    
    let body = "";
    if (schema) {
      // 优先使用 examples 或 example
      if (mediaType.examples) {
        // examples 是一个对象，取第一个示例
        const exampleKey = Object.keys(mediaType.examples)[0];
        if (exampleKey) {
          const exampleValue = mediaType.examples[exampleKey].value;
          body = JSON.stringify(exampleValue, null, 2);
        }
      } else if (mediaType.example) {
        body = JSON.stringify(mediaType.example, null, 2);
      } else if (schema.example) {
        body = JSON.stringify(schema.example, null, 2);
      } else {
        // 没有真实示例，直接返回空对象
        body = "{}";
      }
    } else {
      // 没有 schema，返回空对象
      body = "{}";
    }
    
    return { body, contentType };
  }
  
  // Swagger 2.0 body parameter
  const bodyParam = parameters?.find((p) => p.in === "body");
  if (bodyParam?.schema) {
    let body = "";
    // 优先使用参数的 example
    if ((bodyParam as any).example) {
      body = JSON.stringify((bodyParam as any).example, null, 2);
    } else if (bodyParam.schema.example) {
      body = JSON.stringify(bodyParam.schema.example, null, 2);
    } else {
      // 没有真实示例，返回空对象
      body = "{}";
    }
    return {
      body,
      contentType: "application/json",
    };
  }
  
  // Form data
  const formParams = parameters?.filter((p) => p.in === "formData");
  if (formParams && formParams.length > 0) {
    const formData = formParams.map((p) => ({
      key: p.name,
      value: (p as any).example || (p as any).default || "",
      enabled: true,
    }));
    return {
      body: JSON.stringify(formData),
      contentType: "application/x-www-form-urlencoded",
    };
  }
  
  return { body: "", contentType: "application/json" };
}

/**
 * 判断 schema 是否有真实示例
 */
function hasRealExample(schema: any): boolean {
  if (!schema) return false;
  return schema.example !== undefined || schema.default !== undefined;
}

/**
 * 判断是否是无效的 tag 或路径
 * 过滤掉单个字符或一些常见的内部接口
 */
function isInvalidTag(tag: string): boolean {
  // 单个字符的 tag
  if (tag.length === 1 && /^[a-zA-Z]$/.test(tag)) {
    return true;
  }
  
  // 常见的内部接口 tag
  const internalTags = [
    'basic-error-controller',
    'default-controller',
    'trans-proxy-controller',
    'web-mvc-links-handler',
    'operation-handler',
    'actuator',
    'swagger',
    'api-docs',
    'rpc',
    'rpc-api',
    'rpc服务',
  ];
  
  const lowerTag = tag.toLowerCase();
  if (internalTags.some(t => lowerTag.includes(t))) {
    return true;
  }
  
  return false;
}

/**
 * 判断是否是应该过滤的路径
 */
function shouldFilterPath(path: string): boolean {
  const internalPaths = [
    '/jmreport/',      // JimuReport 内部接口
    '/actuator/',      // Spring Boot Actuator
    '/swagger',        // Swagger UI
    '/api-docs',       // API 文档
    '/v2/api-docs',
    '/v3/api-docs',
    '/error',          // 错误处理
    '/webjars/',       // 静态资源
    '/rpc-api/',       // RPC 服务
    '/rpc/',           // RPC 服务
    '/easyTrans/',     // EasyTrans 代理
  ];
  
  return internalPaths.some(p => path.startsWith(p));
}

/**
 * 解析 $ref 引用
 */
function resolveRef(ref: string, doc: SwaggerDoc): any {
  if (!ref || !ref.startsWith('#/')) return null;
  
  const parts = ref.split('/');
  let current: any = doc;
  
  for (let i = 1; i < parts.length; i++) {
    if (!current) return null;
    current = current[parts[i]];
  }
  
  return current;
}

/**
 * 从 JSON Schema 生成示例数据
 * @param isRequestBody - 是否是请求体，如果是且没有真实示例，尽量保持空对象
 */
function generateExampleFromSchema(schema: any, fieldName?: string, doc?: SwaggerDoc, visited?: Set<string>, isRequestBody?: boolean): any {
  if (!schema) return {};
  
  // 防止循环引用
  if (!visited) {
    visited = new Set();
  }
  
  // 处理 $ref 引用
  if (schema.$ref && doc) {
    if (visited.has(schema.$ref)) {
      return {}; // 循环引用，返回空对象
    }
    visited.add(schema.$ref);
    const resolved = resolveRef(schema.$ref, doc);
    if (resolved) {
      return generateExampleFromSchema(resolved, fieldName, doc, visited);
    }
  }
  
  // 处理 allOf, oneOf, anyOf
  if (schema.allOf) {
    // 合并所有 schema
    const merged: any = {};
    for (const subSchema of schema.allOf) {
      const subExample = generateExampleFromSchema(subSchema, fieldName, doc, visited);
      Object.assign(merged, subExample);
    }
    return merged;
  }
  
  if (schema.oneOf || schema.anyOf) {
    // 使用第一个 schema
    const subSchemas = schema.oneOf || schema.anyOf;
    if (subSchemas.length > 0) {
      return generateExampleFromSchema(subSchemas[0], fieldName, doc, visited);
    }
  }
  
  // 如果有 example，直接使用
  if (schema.example !== undefined) {
    return schema.example;
  }
  
  // 如果有 default，使用默认值
  if (schema.default !== undefined) {
    return schema.default;
  }
  
  // 根据类型生成
  switch (schema.type) {
    case "object":
      {
        const obj: any = {};
        if (schema.properties) {
          for (const key in schema.properties) {
            const propValue = generateExampleFromSchema(schema.properties[key], key, doc, visited, false);
            // 如果是请求体且属性是必填的，或者有真实示例，才添加
            if (!isRequestBody || schema.required?.includes(key) || hasRealExample(schema.properties[key])) {
              obj[key] = propValue;
            }
          }
        }
        // 处理 additionalProperties
        if (!isRequestBody && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          obj['additionalProp'] = generateExampleFromSchema(schema.additionalProperties, undefined, doc, visited, false);
        }
        return obj;
      }
    case "array":
      {
        if (schema.items) {
          const itemExample = generateExampleFromSchema(schema.items, fieldName, doc, visited);
          // 如果有 minItems，生成对应数量的元素
          if (schema.minItems && schema.minItems > 1) {
            return Array(schema.minItems).fill(itemExample);
          }
          return [itemExample];
        }
        return [];
      }
    case "string":
      {
        // 如果有枚举，使用第一个值
        if (schema.enum && schema.enum.length > 0) {
          return schema.enum[0];
        }
        
        // 根据 format生成
        if (schema.format) {
          switch (schema.format) {
            case "date":
              return "2024-01-01";
            case "date-time":
              return "2024-01-01T00:00:00Z";
            case "email":
              return "example@example.com";
            case "uri":
            case "url":
              return "https://example.com";
            case "uuid":
              return "00000000-0000-0000-0000-000000000000";
            case "binary":
              return "";
            case "byte":
              return "";
            case "password":
              return "********";
            default:
              break;
          }
        }
        
        // 根据字段名生成更真实的示例
        if (fieldName) {
          const lowerName = fieldName.toLowerCase();
          if (lowerName.includes("name") || lowerName.includes("名称")) {
            return "示例名称";
          }
          if (lowerName.includes("email") || lowerName.includes("邮箱")) {
            return "example@example.com";
          }
          if (lowerName.includes("phone") || lowerName.includes("电话") || lowerName.includes("mobile")) {
            return "13800138000";
          }
          if (lowerName.includes("address") || lowerName.includes("地址")) {
            return "示例地址";
          }
          if (lowerName.includes("url") || lowerName.includes("link")) {
            return "https://example.com";
          }
          if (lowerName.includes("password") || lowerName.includes("密码")) {
            return "********";
          }
          if (lowerName.includes("description") || lowerName.includes("描述") || lowerName.includes("desc")) {
            return "详细描述";
          }
          if (lowerName.includes("title") || lowerName.includes("标题")) {
            return "示例标题";
          }
          if (lowerName.includes("content") || lowerName.includes("内容")) {
            return "示例内容";
          }
          if (lowerName.includes("code") || lowerName.includes("编码")) {
            return "CODE001";
          }
        }
        
        // 如果有长度限制，生成对应长度的字符串
        if (schema.minLength && schema.minLength > 0) {
          return "x".repeat(schema.minLength);
        }
        
        return "示例文本";
      }
    case "number":
    case "integer":
      {
        // 根据字段名生成更真实的数字
        if (fieldName) {
          const lowerName = fieldName.toLowerCase();
          if (lowerName.includes("age") || lowerName.includes("年龄")) {
            return 20;
          }
          if (lowerName.includes("price") || lowerName.includes("价格") || lowerName.includes("amount") || lowerName.includes("金额")) {
            return 100.00;
          }
          if (lowerName.includes("count") || lowerName.includes("数量") || lowerName.includes("total")) {
            return 10;
          }
          if (lowerName.includes("page")) {
            return 1;
          }
          if (lowerName.includes("size") || lowerName.includes("limit")) {
            return 10;
          }
        }
        
        // 如果有枚举，使用第一个值
        if (schema.enum && schema.enum.length > 0) {
          return schema.enum[0];
        }
        
        // 如果有最小值，使用最小值
        if (schema.minimum !== undefined) {
          return schema.minimum;
        }
        
        return schema.type === "integer" ? 0 : 0.0;
      }
    case "boolean":
      return false;
    default:
      // 处理没有 type 但有 properties 的情况（默认为 object）
      if (schema.properties) {
        const obj: any = {};
        for (const key in schema.properties) {
          obj[key] = generateExampleFromSchema(schema.properties[key], key, doc, visited);
        }
        return obj;
      }
      return null;
  }
}

/**
 * 构建完整的 URL
 */
function buildUrl(doc: SwaggerDoc, path: string): string {
  // OpenAPI 3.0
  if (doc.servers && doc.servers.length > 0) {
    return `${doc.servers[0].url}${path}`;
  }
  
  // Swagger 2.0
  const scheme = doc.schemes?.[0] || "http";
  const host = doc.host || "";
  const basePath = doc.basePath || "";
  
  if (host) {
    return `${scheme}://${host}${basePath}${path}`;
  }
  
  return path;
}

/**
 * 将 Swagger 文档转换为 API 配置列表，按 tags 分组
 * 传递 doc 用于解析 $ref 引用
 */
export function convertSwaggerToAPIConfigs(
  doc: SwaggerDoc,
  collection: string
): {
  folders: Map<string, { folder: APIFolder; settingIds: string[] }>;
  settings: APISetting[];
} {
  const settings: APISetting[] = [];
  const folders = new Map<string, { folder: APIFolder; settingIds: string[] }>();
  
  // 提取 Swagger 定义的 tags 顺序
  const tagOrder = new Map<string, number>();
  if (doc.tags && Array.isArray(doc.tags)) {
    doc.tags.forEach((tagObj: any, index: number) => {
      if (tagObj.name) {
        tagOrder.set(tagObj.name, index);
      }
    });
  }
  
  if (!doc.paths) {
    return configs;
  }
  
  // 临时存储，用于按 tag 顺序排列
  interface TempSetting {
    tag: string;
    path: string;
    method: string;
    config: APISetting;
  }
  const tempSettings: TempSetting[] = [];
  
  // 获取所有路径
  const paths = Object.keys(doc.paths);
  
  for (const path of paths) {
    // 过滤内部路径
    if (shouldFilterPath(path)) {
      continue;
    }
    
    const pathItem = doc.paths[path];
    
    for (const method in pathItem) {
      if (["get", "post", "put", "delete", "patch", "options", "head"].includes(method.toLowerCase())) {
        const operation = pathItem[method];
        
        // 过滤没有有效 tag 的接口
        const tag = operation.tags?.[0];
        if (!tag || tag.trim() === "" || isInvalidTag(tag)) {
          continue; // 跳过这个接口
        }
        const url = buildUrl(doc, path);
        
        // 只有 POST, PUT, PATCH 等方法才解析请求体
        const methodUpper = method.toUpperCase();
        const hasBody = ['POST', 'PUT', 'PATCH'].includes(methodUpper);
        
        let body = "";
        let contentType = "application/json";
        
        if (hasBody) {
          const result = parseRequestBody(
            operation.requestBody,
            operation.parameters,
            doc
          );
          body = result.body;
          contentType = result.contentType;
        }
        
        const request: HTTPRequest = {
          method: methodUpper,
          uri: url,
          body,
          contentType,
          headers: convertParameters(operation.parameters, "header"),
          query: convertParameters(operation.parameters, "query"),
          auth: [],
        };
        
        const settingId = ulid();
        const config: APISetting = {
          id: settingId,
          collection,
          name: operation.summary || `${method.toUpperCase()} ${path}`,
          category: "http",
          setting: JSON.stringify(request),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        // 保存到临时数组，稍后按 tag 排序
        tempSettings.push({
          tag,
          path,
          method: method.toUpperCase(),
          config,
        });
      }
    }
  }
  
  // 按 Swagger 定义的 tags 顺序排序
  tempSettings.sort((a, b) => {
    // 先按 tag 排序（使用 Swagger 定义的顺序）
    if (a.tag !== b.tag) {
      const orderA = tagOrder.get(a.tag) ?? 999;
      const orderB = tagOrder.get(b.tag) ?? 999;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // 如果都没有定义顺序，按名称排序
      return a.tag.localeCompare(b.tag, 'zh-CN');
    }
    // tag 相同，按路径排序
    if (a.path !== b.path) {
      return a.path.localeCompare(b.path);
    }
    // 路径相同，按方法排序
    const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
    return methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method);
  });
  
  // 按排序后的顺序添加到 settings 和 folders
  tempSettings.forEach((item) => {
    settings.push(item.config);
    
    if (!folders.has(item.tag)) {
      const folder = newDefaultAPIFolder();
      folder.id = ulid();
      folder.collection = collection;
      folder.name = item.tag;
      folder.children = "";
      folders.set(item.tag, { folder, settingIds: [] });
    }
    
    folders.get(item.tag)!.settingIds.push(item.config.id);
  });
  
  // 更新文件夹的 children
  folders.forEach((item) => {
    item.folder.children = item.settingIds.join(",");
  });
  
  return { folders, settings };
}

/**
 * 从 Swagger UI URL 导入 API 配置
 */
export async function importFromSwaggerUI(
  swaggerUiUrl: string,
  collection: string
): Promise<{
  folders: APIFolder[];
  settings: APISetting[];
}> {
  // 提取可能的 API 文档 URL
  const docUrls = extractSwaggerJsonUrl(swaggerUiUrl);
  
  // 尝试获取文档
  const doc = await fetchSwaggerDocFromUrls(docUrls);
  
  if (!doc) {
    throw new Error("无法获取 Swagger 文档，请检查 URL 是否正确");
  }
  
  // 转换为 API 配置
  const result = convertSwaggerToAPIConfigs(doc, collection);
  
  if (result.settings.length === 0) {
    throw new Error("Swagger 文档中没有找到任何接口");
  }
  
  // 转换为数组
  const folders: APIFolder[] = [];
  result.folders.forEach((item) => {
    folders.push(item.folder);
  });
  
  return {
    folders,
    settings: result.settings,
  };
}
