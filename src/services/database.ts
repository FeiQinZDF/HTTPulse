import localforage from "localforage";
import { HTTPRequest } from "../commands/http_request";
import { HTTPResponse } from "../commands/http_response";

/**
 * 接口配置数据库服务
 * 使用 localforage (IndexedDB) 存储接口配置和响应历史
 */

// 数据库实例
const apiConfigDB = localforage.createInstance({
  name: "httpulse",
  storeName: "api_configs",
  description: "API接口配置存储",
});

const responseHistoryDB = localforage.createInstance({
  name: "httpulse",
  storeName: "response_history",
  description: "API响应历史记录",
});

const requestHistoryDB = localforage.createInstance({
  name: "httpulse",
  storeName: "request_history",
  description: "API请求历史记录",
});

// ============= 接口配置相关 =============

export interface APIConfig {
  id: string;
  name: string;
  method: string;
  url: string;
  request: HTTPRequest;
  folder?: string;
  tags?: string[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 保存接口配置
 */
export async function saveAPIConfig(config: APIConfig): Promise<void> {
  config.updatedAt = Date.now();
  if (!config.createdAt) {
    config.createdAt = Date.now();
  }
  await apiConfigDB.setItem(config.id, config);
}

/**
 * 获取接口配置
 */
export async function getAPIConfig(id: string): Promise<APIConfig | null> {
  return await apiConfigDB.getItem<APIConfig>(id);
}

/**
 * 删除接口配置
 */
export async function deleteAPIConfig(id: string): Promise<void> {
  await apiConfigDB.removeItem(id);
  // 同时删除相关的响应历史
  await deleteResponseHistoryByAPIId(id);
}

/**
 * 获取所有接口配置
 */
export async function getAllAPIConfigs(): Promise<APIConfig[]> {
  const configs: APIConfig[] = [];
  await apiConfigDB.iterate<APIConfig, void>((value) => {
    configs.push(value);
  });
  return configs.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 按文件夹获取接口配置
 */
export async function getAPIConfigsByFolder(
  folder: string
): Promise<APIConfig[]> {
  const configs: APIConfig[] = [];
  await apiConfigDB.iterate<APIConfig, void>((value) => {
    if (value.folder === folder) {
      configs.push(value);
    }
  });
  return configs.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 搜索接口配置
 */
export async function searchAPIConfigs(
  keyword: string
): Promise<APIConfig[]> {
  const configs: APIConfig[] = [];
  const lowerKeyword = keyword.toLowerCase();
  
  await apiConfigDB.iterate<APIConfig, void>((value) => {
    if (
      value.name.toLowerCase().includes(lowerKeyword) ||
      value.url.toLowerCase().includes(lowerKeyword) ||
      value.description?.toLowerCase().includes(lowerKeyword) ||
      value.tags?.some((tag) => tag.toLowerCase().includes(lowerKeyword))
    ) {
      configs.push(value);
    }
  });
  
  return configs.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 批量导入接口配置
 */
export async function importAPIConfigs(configs: APIConfig[]): Promise<void> {
  for (const config of configs) {
    await saveAPIConfig(config);
  }
}

/**
 * 导出所有接口配置
 */
export async function exportAPIConfigs(): Promise<APIConfig[]> {
  return await getAllAPIConfigs();
}

// ============= 响应历史相关 =============

export interface ResponseHistory {
  id: string;
  apiId: string;
  apiName: string;
  request: HTTPRequest;
  response: HTTPResponse;
  timestamp: number;
  duration: number;
  success: boolean;
}

/**
 * 保存响应历史
 */
export async function saveResponseHistory(
  history: ResponseHistory
): Promise<void> {
  await responseHistoryDB.setItem(history.id, history);
  
  // 限制每个接口最多保存 100 条历史记录
  await trimResponseHistory(history.apiId, 100);
}

/**
 * 获取响应历史
 */
export async function getResponseHistory(
  id: string
): Promise<ResponseHistory | null> {
  return await responseHistoryDB.getItem<ResponseHistory>(id);
}

/**
 * 获取某个接口的所有响应历史
 */
export async function getResponseHistoryByAPIId(
  apiId: string,
  limit: number = 50
): Promise<ResponseHistory[]> {
  const histories: ResponseHistory[] = [];
  
  await responseHistoryDB.iterate<ResponseHistory, void>((value) => {
    if (value.apiId === apiId) {
      histories.push(value);
    }
  });
  
  return histories
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * 删除某个接口的所有响应历史
 */
export async function deleteResponseHistoryByAPIId(
  apiId: string
): Promise<void> {
  const histories = await getResponseHistoryByAPIId(apiId, 1000);
  for (const history of histories) {
    await responseHistoryDB.removeItem(history.id);
  }
}

/**
 * 清理响应历史，只保留最新的 N 条
 */
async function trimResponseHistory(
  apiId: string,
  keepCount: number
): Promise<void> {
  const histories = await getResponseHistoryByAPIId(apiId, 1000);
  
  if (histories.length > keepCount) {
    const toDelete = histories.slice(keepCount);
    for (const history of toDelete) {
      await responseHistoryDB.removeItem(history.id);
    }
  }
}

/**
 * 获取最近的响应历史（跨所有接口）
 */
export async function getRecentResponseHistory(
  limit: number = 20
): Promise<ResponseHistory[]> {
  const histories: ResponseHistory[] = [];
  
  await responseHistoryDB.iterate<ResponseHistory, void>((value) => {
    histories.push(value);
  });
  
  return histories
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * 清除所有响应历史
 */
export async function clearAllResponseHistory(): Promise<void> {
  await responseHistoryDB.clear();
}

// ============= 统计相关 =============

export interface APIStats {
  totalAPIs: number;
  totalRequests: number;
  successCount: number;
  failCount: number;
  avgResponseTime: number;
}

/**
 * 获取统计信息
 */
export async function getStats(): Promise<APIStats> {
  const configs = await getAllAPIConfigs();
  const histories: ResponseHistory[] = [];
  
  await responseHistoryDB.iterate<ResponseHistory, void>((value) => {
    histories.push(value);
  });
  
  const successCount = histories.filter((h) => h.success).length;
  const failCount = histories.filter((h) => !h.success).length;
  const totalDuration = histories.reduce((sum, h) => sum + h.duration, 0);
  
  return {
    totalAPIs: configs.length,
    totalRequests: histories.length,
    successCount,
    failCount,
    avgResponseTime: histories.length > 0 ? totalDuration / histories.length : 0,
  };
}

// ============= 请求模板相关 =============

export interface RequestTemplate {
  id: string;
  name: string;
  description?: string;
  request: Partial<HTTPRequest>;
  createdAt: number;
}

/**
 * 保存请求模板
 */
export async function saveRequestTemplate(
  template: RequestTemplate
): Promise<void> {
  if (!template.createdAt) {
    template.createdAt = Date.now();
  }
  await requestHistoryDB.setItem(template.id, template);
}

/**
 * 获取所有请求模板
 */
export async function getAllRequestTemplates(): Promise<RequestTemplate[]> {
  const templates: RequestTemplate[] = [];
  await requestHistoryDB.iterate<RequestTemplate, void>((value) => {
    templates.push(value);
  });
  return templates.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 删除请求模板
 */
export async function deleteRequestTemplate(id: string): Promise<void> {
  await requestHistoryDB.removeItem(id);
}

// ============= 数据库维护 =============

/**
 * 清空所有数据库
 */
export async function clearAllData(): Promise<void> {
  await apiConfigDB.clear();
  await responseHistoryDB.clear();
  await requestHistoryDB.clear();
}

/**
 * 获取数据库大小信息
 */
export async function getDatabaseSize(): Promise<{
  configs: number;
  responses: number;
  templates: number;
}> {
  const configs = await apiConfigDB.length();
  const responses = await responseHistoryDB.length();
  const templates = await requestHistoryDB.length();
  
  return { configs, responses, templates };
}

/**
 * 导出所有数据（用于备份）
 */
export async function exportAllData(): Promise<{
  configs: APIConfig[];
  responses: ResponseHistory[];
  templates: RequestTemplate[];
  exportTime: number;
}> {
  const configs = await exportAPIConfigs();
  const responses: ResponseHistory[] = [];
  const templates: RequestTemplate[] = [];
  
  await responseHistoryDB.iterate<ResponseHistory, void>((value) => {
    responses.push(value);
  });
  
  await requestHistoryDB.iterate<RequestTemplate, void>((value) => {
    templates.push(value);
  });
  
  return {
    configs,
    responses,
    templates,
    exportTime: Date.now(),
  };
}

/**
 * 导入所有数据（用于恢复）
 */
export async function importAllData(data: {
  configs?: APIConfig[];
  responses?: ResponseHistory[];
  templates?: RequestTemplate[];
}): Promise<void> {
  if (data.configs) {
    for (const config of data.configs) {
      await saveAPIConfig(config);
    }
  }
  
  if (data.responses) {
    for (const response of data.responses) {
      await saveResponseHistory(response);
    }
  }
  
  if (data.templates) {
    for (const template of data.templates) {
      await saveRequestTemplate(template);
    }
  }
}
