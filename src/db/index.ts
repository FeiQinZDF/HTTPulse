import Dexie, { Table } from 'dexie';
import { Environment } from '../commands/environment';

/**
 * 接口响应数据结构
 */
export interface ResponseData {
  id: string;
  interfaceId: string;  // 关联接口ID
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  latency: number;  // 响应时间 (ms)
  receivedAt: string;
}

/**
 * HTTPulse 数据库类
 */
class HTTPulseDB extends Dexie {
  // 环境配置?
  environments!: Table<Environment, string>;
  // 响应数据?
  responses!: Table<ResponseData, string>;

  constructor() {
    super('HTTPulseDB');
    
    try {
      // 定义数据库版本和表结?
      this.version(1).stores({
        environments: 'id, &name, isActive, enabled, createdAt, updatedAt',
        responses: 'id, interfaceId, statusCode, receivedAt',
      });
    } catch (err) {
      console.error('Failed to initialize database:', err);
    }
  }
}

// 导出数据库实?
export const db = new HTTPulseDB();

/**
 * 环境操作 API
 */

// 添加或更新环?
export async function saveEnvironment(env: Environment): Promise<void> {
  await db.environments.put(env);
}

// 获取所有环?
export async function listEnvironments(): Promise<Environment[]> {
  return await db.environments.toArray();
}

// 根据 ID 获取环境
export async function getEnvironment(id: string): Promise<Environment | undefined> {
  return await db.environments.get(id);
}

// 根据名称获取环境
export async function getEnvironmentByName(name: string): Promise<Environment | undefined> {
  return await db.environments.where('name').equals(name).first();
}

// 删除环境
export async function deleteEnvironment(id: string): Promise<void> {
  await db.environments.delete(id);
}

// 批量删除环境
export async function deleteEnvironments(ids: string[]): Promise<void> {
  await db.environments.bulkDelete(ids);
}

// 获取激活的环境
export async function getActiveEnvironment(): Promise<Environment | undefined> {
  const allEnvs = await db.environments.toArray();
  return allEnvs.find(env => env.isActive === true);
}

// 设置激活的环境（自动取消其他环境的激活状态）
export async function setActiveEnvironment(id: string): Promise<void> {
  await db.transaction('rw', db.environments, async () => {
    // 取消所有环境的激活状?
    const allEnvs = await db.environments.toArray();
    for (const env of allEnvs) {
      if (env.isActive) {
        env.isActive = false;
        await db.environments.put(env);
      }
    }
    
    // 激活指定环?
    const targetEnv = await db.environments.get(id);
    if (targetEnv) {
      targetEnv.isActive = true;
      await db.environments.put(targetEnv);
    }
  });
}

/**
 * 响应数据操作 API
 */

// 保存响应数据
export async function saveResponse(response: ResponseData): Promise<void> {
  await db.responses.put(response);
}

// 根据接口 ID 获取响应列表
export async function getResponsesByInterfaceId(
  interfaceId: string,
  limit: number = 10
): Promise<ResponseData[]> {
  return await db.responses
    .where('interfaceId')
    .equals(interfaceId)
    .reverse()
    .sortBy('receivedAt')
    .then((results) => results.slice(0, limit));
}

// 删除响应数据
export async function deleteResponse(id: string): Promise<void> {
  await db.responses.delete(id);
}

// 清空某个接口的所有响?
export async function clearResponsesByInterfaceId(interfaceId: string): Promise<void> {
  await db.responses.where('interfaceId').equals(interfaceId).delete();
}

// 清空所有响应数?
export async function clearAllResponses(): Promise<void> {
  await db.responses.clear();
}


