import { defineStore } from 'pinia';
import { sortBy } from 'lodash-es';
import {
  Environment,
  EnvironmentVariable,
  newDefaultEnvironment,
  createDevEnvironment,
  createProdEnvironment,
  createEnvironment,
  getAllEnvironments,
  getEnvironmentById,
  updateEnvironment,
  deleteEnvironmentById,
  deleteEnvironmentsByIds,
  getActiveEnvironment,
  setActiveEnvironment as setActiveEnv,
  addVariableToEnvironment,
  removeVariableFromEnvironment,
  updateVariableInEnvironment,
  replaceEnvironmentVariables,
  replaceEnvironmentVariablesInObject,
  validateEnvironmentVariables,
  getUsedVariables,
} from '../commands/environment';

export const useEnvironmentsStore = defineStore('environments', {
  state: () => {
    return {
      environments: [] as Environment[],
      activeEnvironment: null as Environment | null,
      fetching: false,
      adding: false,
      updating: false,
      removing: false,
      switching: false,
    };
  },
  getters: {
    /**
     * 获取启用的环境列表
     */
    enabledEnvironments(): Environment[] {
      return this.environments.filter((env) => env.enabled === '1');
    },
    
    /**
     * 根据 ID 获取环境
     */
    getEnvironmentById() {
      return (id: string): Environment | undefined => {
        return this.environments.find((env) => env.id === id);
      };
    },
    
    /**
     * 根据名称获取环境
     */
    getEnvironmentByName() {
      return (name: string): Environment | undefined => {
        return this.environments.find((env) => env.name === name);
      };
    },
    
    /**
     * 获取当前激活环境中的变量值
     */
    getActiveVariableValue() {
      return (key: string): string | undefined => {
        if (!this.activeEnvironment) return undefined;
        const variable = this.activeEnvironment.variables.find((v) => v.key === key);
        return variable?.value;
      };
    },
  },
  actions: {
    /**
     * 初始化：加载所有环境并设置激活环境
     */
    async initialize() {
      await this.fetch();
      await this.loadActiveEnvironment();
      
      // 不自动创建默认环境，用户手动添加
    },
    
    /**
     * 创建默认环境（dev 和 prod）
     */
    async createDefaultEnvironments() {
      const devEnv = createDevEnvironment();
      const prodEnv = createProdEnvironment();
      
      await this.add(devEnv);
      await this.add(prodEnv);
      
      // 默认激活 dev 环境
      await this.setActive(devEnv.id);
    },
    
    /**
     * 获取所有环境
     */
    async fetch() {
      if (this.fetching) return;
      
      this.fetching = true;
      try {
        const result = await getAllEnvironments();
        this.environments = sortBy(result, (item) => item.name);
      } finally {
        this.fetching = false;
      }
    },
    
    /**
     * 加载激活的环境
     */
    async loadActiveEnvironment() {
      try {
        const active = await getActiveEnvironment();
        this.activeEnvironment = active || null;
      } catch (error) {
        console.error('Failed to load active environment:', error);
      }
    },
    
    /**
     * 添加新环境
     */
    async add(env: Environment) {
      if (this.adding) return;
      
      this.adding = true;
      try {
        await createEnvironment(env);
        this.environments.push(env);
        this.environments = sortBy(this.environments, (item) => item.name);
      } finally {
        this.adding = false;
      }
    },
    
    /**
     * 更新环境
     */
    async update(env: Environment) {
      if (this.updating) return;
      
      this.updating = true;
      try {
        await updateEnvironment(env);
        
        const index = this.environments.findIndex((item) => item.id === env.id);
        if (index !== -1) {
          this.environments[index] = env;
        }
        
        // 如果更新的是激活环境，同步更新
        if (this.activeEnvironment && this.activeEnvironment.id === env.id) {
          this.activeEnvironment = env;
        }
      } finally {
        this.updating = false;
      }
    },
    
    /**
     * 删除环境
     */
    async remove(id: string) {
      if (this.removing) return;
      
      this.removing = true;
      try {
        await deleteEnvironmentById(id);
        this.environments = this.environments.filter((item) => item.id !== id);
        
        // 如果删除的是激活环境，清空激活环境
        if (this.activeEnvironment && this.activeEnvironment.id === id) {
          this.activeEnvironment = null;
        }
      } finally {
        this.removing = false;
      }
    },
    
    /**
     * 批量删除环境
     */
    async batchRemove(ids: string[]) {
      if (this.removing) return;
      
      this.removing = true;
      try {
        await deleteEnvironmentsByIds(ids);
        this.environments = this.environments.filter((item) => !ids.includes(item.id));
        
        // 如果激活环境被删除，清空
        if (this.activeEnvironment && ids.includes(this.activeEnvironment.id)) {
          this.activeEnvironment = null;
        }
      } finally {
        this.removing = false;
      }
    },
    
    /**
     * 设置激活的环境
     */
    async setActive(id: string) {
      if (this.switching) return;
      
      this.switching = true;
      try {
        await setActiveEnv(id);
        
        // 更新本地状态
        this.environments.forEach((env) => {
          env.isActive = env.id === id;
        });
        
        const env = await getEnvironmentById(id);
        this.activeEnvironment = env || null;
      } finally {
        this.switching = false;
      }
    },
    
    /**
     * 清除激活的环境（允许没有环境被激活）
     */
    async clearActive() {
      if (this.switching) return;
      
      this.switching = true;
      try {
        // 清除数据库中所有环境的激活状态
        for (const env of this.environments) {
          if (env.isActive) {
            env.isActive = false;
            await updateEnvironment(env);
          }
        }
        
        // 清空激活环境
        this.activeEnvironment = null;
      } finally {
        this.switching = false;
      }
    },
    
    /**
     * 添加或更新环境变量
     */
    async addOrUpdateVariable(envId: string, variable: EnvironmentVariable) {
      await addVariableToEnvironment(envId, variable);
      
      // 更新本地状态
      const env = this.environments.find((e) => e.id === envId);
      if (env) {
        const index = env.variables.findIndex((v) => v.key === variable.key);
        if (index !== -1) {
          env.variables[index] = variable;
        } else {
          env.variables.push(variable);
        }
        
        // 如果是激活环境，同步更新
        if (this.activeEnvironment && this.activeEnvironment.id === envId) {
          this.activeEnvironment = { ...env };
        }
      }
    },
    
    /**
     * 删除环境变量
     */
    async removeVariable(envId: string, variableKey: string) {
      await removeVariableFromEnvironment(envId, variableKey);
      
      // 更新本地状态
      const env = this.environments.find((e) => e.id === envId);
      if (env) {
        env.variables = env.variables.filter((v) => v.key !== variableKey);
        
        // 如果是激活环境，同步更新
        if (this.activeEnvironment && this.activeEnvironment.id === envId) {
          this.activeEnvironment = { ...env };
        }
      }
    },
    
    /**
     * 在文本中替换环境变量
     */
    replaceVariables(text: string): string {
      if (!this.activeEnvironment) return text;
      return replaceEnvironmentVariables(text, this.activeEnvironment);
    },
    
    /**
     * 在对象中批量替换环境变量
     */
    replaceVariablesInObject<T extends Record<string, any>>(obj: T): T {
      if (!this.activeEnvironment) return obj;
      return replaceEnvironmentVariablesInObject(obj, this.activeEnvironment);
    },
    
    /**
     * 验证文本中的环境变量是否完整
     */
    validateVariables(text: string): { valid: boolean; missingVariables: string[] } {
      if (!this.activeEnvironment) {
        return { valid: true, missingVariables: [] };
      }
      return validateEnvironmentVariables(text, this.activeEnvironment);
    },
    
    /**
     * 获取文本中使用的所有环境变量
     */
    getUsedVariables(text: string): string[] {
      return getUsedVariables(text);
    },
  },
});
