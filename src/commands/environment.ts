import { ulid } from "ulid";
import dayjs from "dayjs";

/**
 * 环境变量系统 - 新版本
 * 
 * 每个环境（如 dev, prod）包含多个变量（如 baseUrl, token 等）
 */

export enum EnvironmentStatus {
  Enabled = "1",
  Disabled = "0",
}

/**
 * 环境中的单个变量
 */
export interface EnvironmentVariable {
  key: string;    // 变量名，如 baseUrl, token
  value: string;  // 变量值
  description?: string; // 变量说明
}

/**
 * 环境配置（如 dev, prod, test）
 */
export interface Environment {
  id: string;
  name: string;  // 环境名称，如 dev, prod, test
  variables: EnvironmentVariable[];  // 该环境下的所有变量
  enabled: EnvironmentStatus;  // 是否启用
  isActive: boolean;  // 是否为当前激活的环境
  description?: string;  // 环境说明
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建默认环境
 */
export function newDefaultEnvironment(name: string = ""): Environment {
  return {
    id: ulid(),
    name,
    variables: [],
    enabled: EnvironmentStatus.Enabled,
    isActive: false,
    description: "",
    createdAt: dayjs().format(),
    updatedAt: dayjs().format(),
  };
}

/**
 * 创建默认环境变量
 */
export function newDefaultEnvironmentVariable(): EnvironmentVariable {
  return {
    key: "",
    value: "",
    description: "",
  };
}

/**
 * 创建预设的开发环境
 */
export function createDevEnvironment(): Environment {
  return {
    ...newDefaultEnvironment("dev"),
    description: "开发环境",
    variables: [
      {
        key: "baseUrl",
        value: "http://localhost:3000",
        description: "API 基础地址",
      },
      {
        key: "token",
        value: "dev_token_here",
        description: "认证令牌",
      },
    ],
  };
}

/**
 * 创建预设的生产环境
 */
export function createProdEnvironment(): Environment {
  return {
    ...newDefaultEnvironment("prod"),
    description: "生产环境",
    variables: [
      {
        key: "baseUrl",
        value: "https://api.example.com",
        description: "API 基础地址",
      },
      {
        key: "token",
        value: "prod_token_here",
        description: "认证令牌",
      },
    ],
  };
}

/**
 * 从环境中获取变量值
 */
export function getVariableFromEnvironment(
  env: Environment,
  key: string
): string | undefined {
  const variable = env.variables.find((v) => v.key === key);
  return variable?.value;
}

/**
 * 在文本中替换环境变量
 * 例如: "{{baseUrl}}/api/users" -> "http://localhost:3000/api/users"
 */
export function replaceEnvironmentVariables(
  text: string,
  env: Environment
): string {
  let result = text;
  
  // 匹配所有 {{变量名}} 格式
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = text.matchAll(regex);
  
  for (const match of matches) {
    const varName = match[1].trim();
    const varValue = getVariableFromEnvironment(env, varName);
    
    if (varValue !== undefined) {
      result = result.replace(match[0], varValue);
    }
  }
  
  return result;
}

/**
 * 批量替换对象中的环境变量
 */
export function replaceEnvironmentVariablesInObject<T extends Record<string, any>>(
  obj: T,
  env: Environment
): T {
  const result = { ...obj };
  
  for (const key in result) {
    const value = result[key];
    
    if (typeof value === "string") {
      result[key] = replaceEnvironmentVariables(value, env) as any;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: any) => {
        if (typeof item === "string") {
          return replaceEnvironmentVariables(item, env);
        } else if (typeof item === "object" && item !== null) {
          return replaceEnvironmentVariablesInObject(item, env);
        }
        return item;
      }) as any;
    } else if (typeof value === "object" && value !== null) {
      result[key] = replaceEnvironmentVariablesInObject(value, env) as any;
    }
  }
  
  return result;
}

/**
 * 获取文本中使用的所有环境变量
 */
export function getUsedVariables(text: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = text.matchAll(regex);
  const variables: string[] = [];
  
  for (const match of matches) {
    const varName = match[1].trim();
    if (!variables.includes(varName)) {
      variables.push(varName);
    }
  }
  
  return variables;
}

/**
 * 验证环境变量是否完整（所有引用的变量都有定义）
 */
export function validateEnvironmentVariables(
  text: string,
  env: Environment
): { valid: boolean; missingVariables: string[] } {
  const usedVariables = getUsedVariables(text);
  const missingVariables: string[] = [];
  
  for (const varName of usedVariables) {
    if (getVariableFromEnvironment(env, varName) === undefined) {
      missingVariables.push(varName);
    }
  }
  
  return {
    valid: missingVariables.length === 0,
    missingVariables,
  };
}

/**
 * 数据库操作 API
 */
import * as db from '../db';

// 创建环境
export async function createEnvironment(env: Environment): Promise<void> {
  env.updatedAt = dayjs().format();
  await db.saveEnvironment(env);
}

// 获取所有环境
export async function getAllEnvironments(): Promise<Environment[]> {
  return await db.listEnvironments();
}

// 根据 ID 获取环境
export async function getEnvironmentById(id: string): Promise<Environment | undefined> {
  return await db.getEnvironment(id);
}

// 根据名称获取环境
export async function getEnvironmentByName(name: string): Promise<Environment | undefined> {
  return await db.getEnvironmentByName(name);
}

// 更新环境
export async function updateEnvironment(env: Environment): Promise<void> {
  env.updatedAt = dayjs().format();
  await db.saveEnvironment(env);
}

// 删除环境
export async function deleteEnvironmentById(id: string): Promise<void> {
  await db.deleteEnvironment(id);
}

// 批量删除环境
export async function deleteEnvironmentsByIds(ids: string[]): Promise<void> {
  await db.deleteEnvironments(ids);
}

// 获取当前激活的环境
export async function getActiveEnvironment(): Promise<Environment | undefined> {
  return await db.getActiveEnvironment();
}

// 设置激活的环境
export async function setActiveEnvironment(id: string): Promise<void> {
  await db.setActiveEnvironment(id);
}

// 添加环境变量到指定环境
export async function addVariableToEnvironment(
  envId: string,
  variable: EnvironmentVariable
): Promise<void> {
  const env = await db.getEnvironment(envId);
  if (!env) {
    throw new Error(`Environment with id ${envId} not found`);
  }
  
  // 检查变量名是否已存在
  const existingIndex = env.variables.findIndex((v) => v.key === variable.key);
  if (existingIndex !== -1) {
    // 更新现有变量
    env.variables[existingIndex] = variable;
  } else {
    // 添加新变量
    env.variables.push(variable);
  }
  
  await updateEnvironment(env);
}

// 从环境中删除变量
export async function removeVariableFromEnvironment(
  envId: string,
  variableKey: string
): Promise<void> {
  const env = await db.getEnvironment(envId);
  if (!env) {
    throw new Error(`Environment with id ${envId} not found`);
  }
  
  env.variables = env.variables.filter((v) => v.key !== variableKey);
  await updateEnvironment(env);
}

// 更新环境中的变量
export async function updateVariableInEnvironment(
  envId: string,
  variable: EnvironmentVariable
): Promise<void> {
  await addVariableToEnvironment(envId, variable);
}
