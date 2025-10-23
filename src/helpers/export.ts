import { APIConfig } from "../services/database";
import { KVParam } from "../commands/interface";
import { Environment } from "../commands/environment";

/**
 * ?KV 参数转换为字符串
 */
function convertKVParamsToString(params: KVParam[] | undefined): string {
  if (!params || params.length === 0) {
    return "";
  }
  return params
    .filter((p) => p.enabled && p.key)
    .map((p) => `${p.key}: ${p.value}`)
    .join("\n");
}

/**
 * ?API 配置转换?.http 格式
 */
function convertAPIConfigToHTTP(config: APIConfig): string {
  const lines: string[] = [];

  // 添加注释：API名称和描?
  lines.push(`### ${config.name}`);
  if (config.description) {
    lines.push(`## ${config.description}`);
  }
  // 添加文件夹路径（完整层级路径，如 "用户管理/权限管理"?
  if (config.folder) {
    lines.push(`## Folder: ${config.folder}`);
  }
  if (config.tags && config.tags.length > 0) {
    lines.push(`## Tags: ${config.tags.join(", ")}`);
  }
  lines.push("");

  // 构建请求?
  const method = config.method || "GET";
  let url = config.url || config.request.uri;

  // 添加查询参数
  if (config.request.query && config.request.query.length > 0) {
    const queryParams = config.request.query
      .filter((q) => q.enabled && q.key)
      .map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`)
      .join("&");
    if (queryParams) {
      url += (url.includes("?") ? "&" : "?") + queryParams;
    }
  }

  lines.push(`${method} ${url}`);

  // 添加请求头（过滤?Content-Type，因为会单独处理?
  const filteredHeaders = config.request.headers?.filter(
    (h) => h.enabled && h.key && h.key.toLowerCase() !== 'content-type'
  );
  const headers = convertKVParamsToString(filteredHeaders);
  if (headers) {
    lines.push(headers);
  }

  // 添加 Content-Type
  if (config.request.contentType) {
    lines.push(`Content-Type: ${config.request.contentType}`);
  }

  // 添加认证
  if (config.request.auth && config.request.auth.length > 0) {
    const auth = config.request.auth.find((a) => a.enabled);
    if (auth) {
      // 假设?Basic Auth，key 是用户名，value 是密?
      const encoded = btoa(`${auth.key}:${auth.value}`);
      lines.push(`Authorization: Basic ${encoded}`);
    }
  }

  // 添加请求?
  if (config.request.body) {
    lines.push("");
    try {
      // 尝试格式?JSON
      if (
        config.request.contentType === "application/json" ||
        config.request.body.trim().startsWith("{") ||
        config.request.body.trim().startsWith("[")
      ) {
        const formatted = JSON.stringify(
          JSON.parse(config.request.body),
          null,
          2
        );
        lines.push(formatted);
      } else {
        lines.push(config.request.body);
      }
    } catch {
      lines.push(config.request.body);
    }
  }

  lines.push("");
  lines.push("");

  return lines.join("\n");
}

/**
 * 将所?API 配置导出?.http 文件内容
 * @param configs API 配置列表
 * @param activeEnvironment 当前激活的环境（可选）
 */
export function exportAPIConfigsToHTTP(
  configs: APIConfig[],
  activeEnvironment?: Environment
): string {
  const lines: string[] = [];

  // 添加文件?
  lines.push("## HTTPulse HTTP File");
  lines.push(`## Generated at ${new Date().toISOString()}`);
  lines.push(`## Total APIs: ${configs.length}`);
  lines.push("");
  
  // 如果有激活的环境，导出环境变?
  if (activeEnvironment && activeEnvironment.variables.length > 0) {
    lines.push(`## Environment: ${activeEnvironment.name}`);
    lines.push("");
    
    // 导出环境变量，格式：@变量?= ?
    activeEnvironment.variables.forEach((variable) => {
      lines.push(`@${variable.key} = ${variable.value}`);
      if (variable.description) {
        lines.push(`## ${variable.description}`);
      }
    });
    
    lines.push("");
  }
  
  lines.push("");

  // 按文件夹分组
  const grouped = new Map<string, APIConfig[]>();
  configs.forEach((config) => {
    const folder = config.folder || "Uncategorized";
    if (!grouped.has(folder)) {
      grouped.set(folder, []);
    }
    grouped.get(folder)!.push(config);
  });

  // 生成每个分组的内?
  grouped.forEach((configs, folder) => {
    lines.push(`## ==================== ${folder} ====================`);
    lines.push("");
    configs.forEach((config) => {
      lines.push(convertAPIConfigToHTTP(config));
    });
  });

  return lines.join("\n");
}

/**
 * ?API 配置导出?JSON 文件内容
 */
export function exportAPIConfigsToJSON(configs: APIConfig[]): string {
  return JSON.stringify(
    {
      exportTime: new Date().toISOString(),
      version: "1.0",
      totalAPIs: configs.length,
      configs,
    },
    null,
    2
  );
}


