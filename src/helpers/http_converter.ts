import { HTTPRequest } from "../commands/http_request";
import { KVParam } from "../commands/interface";

/**
 * 将HTTPRequest转换为HTTP格式文本
 * @param name 接口名称，如果传入则会在最开头添加 ### 名称
 */
export function requestToHttpText(req: HTTPRequest, name?: string): string {
  const lines: string[] = [];
  
  // 如果有接口名称，在最开头添加
  if (name) {
    lines.push(`### ${name}`);
  }
  
  // 添加请求行
  let url = (req.uri as string) || "";
  
  // 如果有query参数，添加到URL
  if (req.query && Array.isArray(req.query) && req.query.length > 0) {
    const queryParams = req.query
      .filter((q) => q.enabled && q.key)
      .map((q) => `${q.key}=${q.value || ""}`)
      .join("&");
    if (queryParams) {
      url += ((url || "").includes("?") ? "&" : "?") + queryParams;
    }
  }

  lines.push(`${req.method || "GET"} ${url}`);

  // 添加headers
  if (req.headers && req.headers.length > 0) {
    req.headers
      .filter((h) => h.enabled && h.key)
      .forEach((h) => {
        lines.push(`${h.key}: ${h.value || ""}`);
      });
  }

  // 添加Content-Type（如果有）
  if (req.contentType && !hasHeader(req.headers, "content-type")) {
    lines.push(`Content-Type: ${req.contentType}`);
  }

  // 添加空行和body（去掉结尾多余空白，防止空行累积）
  let bodyValue = (req.body as string) || "";
  if (bodyValue) {
    bodyValue = bodyValue.replace(/[\s\n\r]+$/g, "");
    if (bodyValue) {
      lines.push("");
      lines.push(bodyValue);
    }
  }
  
  // 添加响应处理脚本
  const responseHandler = req.responseHandler as string | undefined;
  if (responseHandler) {
    lines.push("");
    // 将每行脚本前面添加 >
    const handlerLines = responseHandler.split("\n");
    handlerLines.forEach(line => {
      if (line.trim()) {
        lines.push("> " + line.trim());
      }
    });
  }

  const result = lines.join("\n");
  return result;
}

/**
 * 解析HTTP格式文本为HTTPRequest
 * @returns 返回HTTPRequest、可能的接口名称和响应处理脚本
 */
export function httpTextToRequest(text: string): Partial<HTTPRequest> & { name?: string; responseHandler?: string } {
  try {
    const lines = text.split("\n");
    let currentLine = 0;
    let name = "";

    // 提取接口名称和跳过空行、注释
    while (
      currentLine < lines.length &&
      (lines[currentLine].trim() === "" ||
        lines[currentLine].trim().startsWith("#"))
    ) {
      const line = lines[currentLine].trim();
      // 提取 ### 开头的接口名称
      if (line.startsWith("###")) {
        name = line.substring(3).trim();
      }
      currentLine++;
    }

    if (currentLine >= lines.length) {
      return {};
    }

    // 解析请求行 (METHOD URL)
    const requestLine = lines[currentLine].trim();
    const requestParts = requestLine.split(/\s+/);
    if (requestParts.length < 2) {
      return {};
    }

    const method = requestParts[0];
    let url = requestParts[1];
    currentLine++;

    // 从 URL 中提取 query 参数（仅分离 query，保留 {{env}} 等所有其他部分）
    const query: KVParam[] = [];
    const qIdx = url.indexOf('?');
    if (qIdx >= 0) {
      const queryString = url.substring(qIdx + 1);
      url = url.substring(0, qIdx);
      queryString.split("&").forEach((param) => {
        const [key, value] = param.split("=");
        if (key) {
          query.push({ key, value: value || "", enabled: true });
        }
      });
    }

    // 解析headers
    const headers: KVParam[] = [];
    let contentType = "";

    while (currentLine < lines.length && lines[currentLine].trim() !== "") {
      const line = lines[currentLine].trim();
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        const lowerKey = key.toLowerCase();
        
        if (lowerKey === "content-type") {
          // 单独记录 Content-Type，不再放入 headers 列表，避免重复
          contentType = value;
        } else {
          // 其他所有请求头（包括 Bearer Token）都放到headers
          headers.push({ key, value, enabled: true });
        }
      }
      currentLine++;
    }

    // 跳过空行
    while (currentLine < lines.length && lines[currentLine].trim() === "") {
      currentLine++;
    }

    // 分离 body 和响应处理脚本
    let body = "";
    let responseHandler = "";
    const bodyLines: string[] = [];
    const handlerLines: string[] = [];
    let inHandler = false;
    
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      // 检测响应处理脚本（以 > 开头）
      if (line.trim().startsWith(">")) {
        inHandler = true;
        // 移除 > 前缀
        handlerLines.push(line.trim().substring(1).trim());
      } else if (inHandler) {
        // 如果已经开始读取handler，继续读取
        handlerLines.push(line);
      } else {
        // body 部分
        bodyLines.push(line);
      }
      currentLine++;
    }
    
    // 去除 body 尾部连续空行，防止往返转换累积空白
    while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") {
      bodyLines.pop()
    }
    body = bodyLines.join("\n");
    responseHandler = handlerLines.join("\n").trim();

    if (responseHandler) {
      console.log('[httpTextToRequest] Found responseHandler:', responseHandler.substring(0, 100));
    }
    console.log('[httpTextToRequest] Parsed:', { method, uri: url, body: body.substring(0, 50), bodyLength: body.length, name, hasHandler: !!responseHandler });

    return {
      method,
      uri: url,
      query,
      headers,
      contentType: contentType || "application/json",
      body,
      name: name || undefined,
      responseHandler: responseHandler || undefined,
    };
  } catch (err) {
    console.error("Parse HTTP text failed:", err);
    return {};
  }
}

function hasHeader(headers: KVParam[] | undefined, headerName: string): boolean {
  if (!headers) return false;
  return headers.some(
    (h) => h.enabled && h.key.toLowerCase() === headerName.toLowerCase()
  );
}

// 格式化 HTTP 文本：
// - 规范请求行空白
// - Content-Type 规范大小写
// - 压缩多余空行，保证 headers/body/handler 之间最多一个空行
// - 去除行尾空白
export function formatHttpText(text: string): string {
  if (!text) return '';
  // 解析成结构
  const parsed = httpTextToRequest(text);

  // JSON 格式化
  let body = parsed.body || '';
  const ct = parsed.contentType || '';
  const looksJson = /json/i.test(ct) || /^(\s|\n|\r)*[\{\[]/.test(body || '');
  if (looksJson && body) {
    try {
      const obj = JSON.parse(body);
      body = JSON.stringify(obj, null, 2);
    } catch {
      // 非严格 JSON，保持原样
    }
  }

  const req: HTTPRequest = {
    method: (parsed.method as any) || 'GET',
    uri: (parsed.uri as any) || '',
    query: (parsed.query as any) || [],
    headers: (parsed.headers as any) || [],
    contentType: (parsed.contentType as any) || (looksJson ? 'application/json' : ('' as any)),
    body: (body as any) || '',
    responseHandler: (parsed.responseHandler as any) || '',
  } as any;

  // 重建为标准顺序：
  // ### 标题
  // METHOD URL
  // Headers（含 Content-Type）
  // [空行]
  // Body（JSON 已格式化）
  // [空行]
  // > handler 脚本
  return requestToHttpText(req, parsed.name);
}
