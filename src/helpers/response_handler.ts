import { HTTPResponse } from "../commands/http_response";
import { useEnvironmentsStore } from "../stores/environments";
import { newDefaultEnvironment } from "../commands/environment";

/**
 * 执行响应处理脚本
 * 支持语法: {% client.global.set("key", response.body.path); %}
 */
export async function executeResponseHandler(
  script: string,
  response: HTTPResponse
): Promise<void> {
  if (!script || !script.trim()) {
    return;
  }

  console.log("[ResponseHandler] Executing script:", script);

  try {
    // 解析响应body为JSON
    let responseBody: any = {};
    try {
      if (response.body && typeof response.body === "string") {
        // body可能是base64编码的
        const bodyText = response.body;
        responseBody = JSON.parse(bodyText);
      }
    } catch (err) {
      console.error("[ResponseHandler] Failed to parse response body:", err);
    }

    // 提取所有的 {% ... %} 脚本块
    const scriptBlocks = extractScriptBlocks(script);

    for (const block of scriptBlocks) {
      await executeScriptBlock(block, responseBody, response);
    }
  } catch (err) {
    console.error("[ResponseHandler] Script execution failed:", err);
    throw err;
  }
}

/**
 * 提取脚本块 {% ... %}
 */
function extractScriptBlocks(script: string): string[] {
  const blocks: string[] = [];
  const regex = /\{%\s*(.*?)\s*%\}/gs;
  let match;

  while ((match = regex.exec(script)) !== null) {
    blocks.push(match[1].trim());
  }

  return blocks;
}

/**
 * 执行单个脚本块
 */
async function executeScriptBlock(
  block: string,
  responseBody: any,
  response: HTTPResponse
): Promise<void> {
  console.log("[ResponseHandler] Executing block:", block);

  // 匹配 client.global.set("key", value)
  const setGlobalRegex = /client\.global\.set\s*\(\s*["']([^"']+)["']\s*,\s*(.+)\s*\)/;
  const match = setGlobalRegex.exec(block);

  if (match) {
    const key = match[1];
    const valueExpr = match[2].trim();

    // 计算value表达式
    const value = evaluateExpression(valueExpr, responseBody, response);

    if (value !== undefined && value !== null) {
      await saveToEnvironment(key, String(value));
      console.log(`[ResponseHandler] Set ${key} = ${value}`);
    }
  }
}

/**
 * 计算表达式的值
 * 支持: response.body.xxx, response.status, "string", 123
 */
function evaluateExpression(
  expr: string,
  responseBody: any,
  response: HTTPResponse
): any {
  expr = expr.trim();

  // 字符串字面量
  if (
    (expr.startsWith('"') && expr.endsWith('"')) ||
    (expr.startsWith("'") && expr.endsWith("'"))
  ) {
    return expr.slice(1, -1);
  }

  // 数字字面量
  if (/^\d+(\.\d+)?$/.test(expr)) {
    return parseFloat(expr);
  }

  // response.body.xxx
  if (expr.startsWith("response.body.")) {
    const path = expr.substring("response.body.".length);
    return getNestedValue(responseBody, path);
  }

  // response.status
  if (expr === "response.status") {
    return response.status;
  }

  // response.body (整个body)
  if (expr === "response.body") {
    return JSON.stringify(responseBody);
  }

  return undefined;
}

/**
 * 获取嵌套对象的值
 * 例如: "data.token" -> obj.data.token
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * 保存到环境变量
 */
async function saveToEnvironment(key: string, value: string): Promise<void> {
  const environmentsStore = useEnvironmentsStore();

  // 如果没有激活的环境
  if (!environmentsStore.activeEnvironment) {
    console.log("[ResponseHandler] No active environment");
    
    // 尝试使用第一个可用环境
    if (environmentsStore.environments.length > 0) {
      console.log("[ResponseHandler] Using first available environment");
      await environmentsStore.setActive(environmentsStore.environments[0].id);
    } else {
      // 如果没有任何环境，创建一个新的
      console.log("[ResponseHandler] Creating new default environment");
      const defaultEnv = newDefaultEnvironment("默认环境");
      await environmentsStore.add(defaultEnv);
      await environmentsStore.setActive(defaultEnv.id);
    }
  }

  const activeEnv = environmentsStore.activeEnvironment;
  if (!activeEnv) {
    console.error("[ResponseHandler] Failed to get active environment");
    return;
  }

  // 添加或更新变量
  await environmentsStore.addOrUpdateVariable(activeEnv.id, {
    key,
    value,
    description: "由响应脚本自动设置",
  });

  console.log(`[ResponseHandler] Saved ${key} to environment ${activeEnv.name}`);
}
