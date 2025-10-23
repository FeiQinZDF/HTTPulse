import { HTTPMethod } from "../commands/http_request";
import { KVParam } from "../commands/interface";
import { EnvironmentVariable } from "../commands/environment";

/**
 * 解析 .http 文件的返回类?
 */
export interface ParsedHTTPFile {
  environmentName?: string;  // 环境名称
  environmentVariables: EnvironmentVariable[];
  requests: Array<{
    name: string;
    description?: string;
    folder?: string;
    tags?: string[];
    method: string;
    url: string;
    headers: KVParam[];
    query: KVParam[];
    body?: string;
    contentType?: string;
  }>;
}

/**
 * 解析环境变量定义
 * 格式：@变量?= ?
 * 返回：{ environmentName, variables }
 */
function parseEnvironmentVariables(content: string): { 
  environmentName?: string;
  variables: EnvironmentVariable[];
} {
  const variables: EnvironmentVariable[] = [];
  let environmentName: string | undefined;
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 如果遇到 ### 开头的请求定义，停止解析环境变?
    if (line.startsWith('###')) {
      break;
    }
    
    // 解析环境名称?# Environment: xxx
    if (!environmentName && line.match(/^##\s*Environment:\s*(.+)$/i)) {
      const match = line.match(/^##\s*Environment:\s*(.+)$/i);
      if (match) {
        environmentName = match[1].trim();
      }
      continue;
    }
    
    // 解析变量定义：@变量?= ?
    // 支持字母、数字、下划线、连字符，值可以为?
    const varMatch = line.match(/^@([\w-]+)\s*=\s*(.*)$/);
    if (varMatch) {
      const key = varMatch[1].trim();
      const value = varMatch[2].trim();
      
      // 检查下一行是否是该变量的描述? ?## 开头的注释?
      let description = '';
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith('##')) {
          description = nextLine.substring(2).trim();
        } else if (nextLine.startsWith('#')) {
          description = nextLine.substring(1).trim();
        }
      }
      
      variables.push({
        key,
        value,
        description,
      });
    }
  }
  
  return { environmentName, variables };
}

/**
 * 解析 .http 文件内容
 */
export function parseHTTPFile(content: string): ParsedHTTPFile {
  const results: any[] = [];
  
  // 先解析环境变?
  const { environmentName, variables: environmentVariables } = parseEnvironmentVariables(content);
  
  // ?### 分割请求
  const requests = content.split(/^###\s*/m).filter(s => s.trim());
  
  for (const requestBlock of requests) {
    const lines = requestBlock.split('\n');
    let name = '';
    let description = '';
    let folder = '';
    const tags: string[] = [];
    let method = '';
    let url = '';
    const headers: KVParam[] = [];
    const query: KVParam[] = [];
    let body = '';
    let contentType = '';
    let parsingHeaders = false;
    let parsingBody = false;
    let foundRequestLine = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 跳过空行
      if (!line) {
        if (foundRequestLine && parsingHeaders && !parsingBody) {
          // 空行表示 headers 结束，body 开?
          parsingHeaders = false;
          parsingBody = true;
        }
        continue;
      }
      
      // 第一行不?# 开头，也不?HTTP 方法，就是名?
      if (i === 0 && !name && !line.startsWith('#') && !line.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+/i)) {
        name = line;
        continue;
      }
      
      // 解析注释
      if (line.startsWith('#')) {
        // 处理 ## ?# 开头的注释
        const comment = line.startsWith('##') 
          ? line.substring(2).trim() 
          : line.substring(1).trim();
        
        // 如果还没有名称，且不是特殊标记，就作为名称或描述
        if (!name && !comment.startsWith('Folder:') && !comment.startsWith('Tags:') && !comment.startsWith('=====') && !comment.startsWith('Environment:') && !comment.includes('HTTPulse')) {
          name = comment;
        } else if (comment.startsWith('Folder:')) {
          folder = comment.substring(7).trim();
        } else if (comment.startsWith('Tags:')) {
          const tagStr = comment.substring(5).trim();
          tags.push(...tagStr.split(',').map(t => t.trim()));
        } else if (!description && name && !comment.startsWith('=====') && !comment.startsWith('Environment:') && !comment.includes('HTTPulse')) {
          // 已经有名称后的注释作为描?
          description = comment;
        }
        continue;
      }
      
      // 解析请求?(GET https://...)
      if (!foundRequestLine) {
        const requestLineMatch = line.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
        if (requestLineMatch) {
          method = requestLineMatch[1].toUpperCase();
          const fullUrl = requestLineMatch[2].trim();
          
          // 分离 URL 和查询参?
          const urlParts = fullUrl.split('?');
          url = urlParts[0];
          
          if (urlParts.length > 1) {
            // 解析查询参数
            const queryString = urlParts[1];
            const queryPairs = queryString.split('&');
            queryPairs.forEach(pair => {
              const [key, value] = pair.split('=');
              if (key) {
                query.push({
                  key: decodeURIComponent(key),
                  value: value ? decodeURIComponent(value) : '',
                  enabled: true,
                });
              }
            });
          }
          
          foundRequestLine = true;
          parsingHeaders = true;
          continue;
        }
      }
      
      // 解析 Headers
      if (parsingHeaders && !parsingBody) {
        const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
        if (headerMatch) {
          const key = headerMatch[1].trim();
          const value = headerMatch[2].trim();
          
          if (key.toLowerCase() === 'content-type') {
            contentType = value;
          }
          
          headers.push({
            key,
            value,
            enabled: true,
          });
          continue;
        }
      }
      
      // 解析 Body
      if (parsingBody) {
        body += line + '\n';
      }
    }
    
    // 如果找到了有效的请求
    if (foundRequestLine && method && url) {
      results.push({
        name: name || `${method} ${url}`,
        description,
        folder,
        tags,
        method,
        url,
        headers,
        query,
        body: body.trim(),
        contentType,
      });
    }
  }
  
  return {
    environmentName,
    environmentVariables,
    requests: results,
  };
}

/**
 * 检测内容是否为 .http 格式
 */
export function isHTTPFormat(content: string): boolean {
  // 检查是否包?HTTP 方法开头的?
  return /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+http/im.test(content) ||
         /^###\s+/m.test(content);
}


