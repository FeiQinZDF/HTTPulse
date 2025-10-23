/*
 * @Author: feiqin
 * @Date: 2025-10-17 10:28:50
 * @LastEditors: feiqin
 * @LastEditTime: 2025-10-22 10:52:26
 * @Description: 
 */
import { editor, languages } from "monaco-editor/esm/vs/editor/editor.api";

// Register HTTP language
let httpLanguageRegistered = false;
let httpThemesRegistered = false;

// Pre-register HTTP language and themes to avoid flashing
function ensureHttpSetup() {
  if (!httpLanguageRegistered) {
    registerHttpLanguage();
  }
}

// Initialize HTTP support immediately to prevent flashing
export function initializeHttpSupport() {
  ensureHttpSetup();
}

function registerHttpLanguage() {
  try {
    // Check if language already exists
    const existingLanguages = languages.getLanguages();
    const httpExists = existingLanguages.some(lang => lang.id === 'http');
    
    if (!httpExists) {
      // Register the language
      languages.register({ id: 'http' });
    }
  
    // Define the tokenizer for HTTP syntax highlighting
    languages.setMonarchTokensProvider('http', {
      tokenizer: {
        root: [
          // Response handler scripts (lines starting with >)
          [/^>\s*/, 'script.prefix', '@script'],
          
          // Comments - title comments with ###
          [/^###.*$/, 'comment.title'],
          
          // Regular comments with #
          [/^#.*$/, 'comment'],
          
          // HTTP request line: METHOD URL [HTTP/VERSION] - more specific pattern
          [/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)(?=\s)/, 'keyword.http-method', '@method_line'],
          
          // Headers - split into parts to allow variable highlighting in values
          [/^(?!GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)([A-Za-z][A-Za-z0-9-]*)(\s*:\s*)/, 
           ['keyword.http-header', 'punctuation'], '@header_value'],
          
          // Environment variables
          [/\{\{[^}]+\}\}/, 'variable'],
          
          // JSON in root - start of object
          [/\{/, { token: 'delimiter.bracket.json', next: '@json' }],
          
          // JSON in root - start of array
          [/\[/, { token: 'delimiter.array.json', next: '@json' }],
          
          // Empty line or whitespace
          [/^\s*$/, 'whitespace'],
          [/\s+/, 'whitespace'],
          
          // Fallback for other content
          [/./, 'string.body']
        ],
        
        method_line: [
          // Environment variables in URL
          [/\{\{[^}]+\}\}/, 'variable'],
          
          // URL part after method
          [/[^\s\{]+/, 'string.url'],
          
          // Whitespace
          [/\s+/, 'whitespace'],
          
          // HTTP version if present
          [/HTTP\/\d\.\d/, 'keyword.http-version', '@pop'],
          
          // End of line
          [/$/, '', '@pop']
        ],
        
        header_value: [
          // Environment variables in header values
          [/\{\{[^}]+\}\}/, 'variable'],
          
          // Regular header value content
          [/[^\n\{]+/, 'string.http-header-value'],
          
          // End of line - return to root
          [/$/, '', '@pop']
        ],
        
        script: [
          // Response handler scripts - JavaScript/TypeScript syntax
          [/\{\{[^}]+\}\}/, 'variable'],
          
          // Keywords
          [/\b(client|global|set|get|response|body|headers|status|let|const|var|function|return|if|else|for|while)\b/, 'keyword.script'],
          
          // Strings
          [/"([^"\\]|\\.)*"/, 'string.script'],
          [/'([^'\\]|\\.)*'/, 'string.script'],
          
          // Functions
          [/\b[a-zA-Z_]\w*(?=\s*\()/, 'function.script'],
          
          // Properties (after dot)
          [/\.[a-zA-Z_]\w*/, 'property.script'],
          
          // Numbers
          [/\b\d+(\.\d+)?\b/, 'number.script'],
          
          // Operators and punctuation
          [/[{}\[\]().,;]/, 'delimiter.script'],
          
          // Other script content
          [/[^\n]+/, 'script.content'],
          
          // End of line - return to root
          [/$/, '', '@pop']
        ],
        
        json: [
          // Response handler script at start of line - exit JSON and enter script
          [/^>\s*/, { token: 'script.prefix', next: '@popall', nextEmbedded: '@script' }],
          
          // Environment variables in JSON (must come before strings)
          [/\{\{[^}]+\}\}/, 'variable'],
          
          // JSON keys (quoted strings followed by colon) - must come before regular strings
          [/"([^"\\]|\\.)*"(?=\s*:)/, 'key.json'],
          
          // JSON strings
          [/"([^"\\]|\\.)*"/, 'string.json'],
          
          // JSON keywords
          [/\b(true|false|null)\b/, 'keyword.json'],
          
          // Numbers
          [/-?\d*\.\d+([eE][\-+]?\d+)?/, 'number.float.json'],
          [/-?\d+/, 'number.json'],
          
          // Nested JSON structures
          [/\{/, 'delimiter.bracket.json'],
          [/\}/, { token: 'delimiter.bracket.json', next: '@pop' }],
          [/\[/, 'delimiter.array.json'],
          [/\]/, { token: 'delimiter.array.json', next: '@pop' }],
          
          // JSON punctuation
          [/,/, 'delimiter.comma.json'],
          [/:/, 'delimiter.colon.json'],
          
          // Whitespace (including empty lines) - stay in JSON mode
          [/\s+/, 'whitespace']
        ]
      }
    });

    // Always register themes to ensure consistency
    registerHttpThemes();
    
    httpLanguageRegistered = true;
  } catch (error) {
    console.warn('Failed to register HTTP language:', error);
    httpLanguageRegistered = true; // Prevent retries
  }
}

function registerHttpThemes() {
  try {
    
    // Define theme colors for HTTP syntax
    editor.defineTheme('http-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // HTTP method highlighting - orange/red (POST/GET preferred color)
      { token: 'keyword.http-method', foreground: 'ff8c69', fontStyle: 'bold' },
      
      // URL highlighting - cyan/blue 
      { token: 'string.url', foreground: '4fc3f7' },
      
      // HTTP headers - yellow/gold
      { token: 'keyword.http-header', foreground: 'ffb74d' },
      
      // Header values - green
      { token: 'string.http-header-value', foreground: '81c784' },
      
      // Comments - regular comments
      { token: 'comment', foreground: '757575', fontStyle: 'italic' },
      
      // Comment titles (###) - yellow/gold for consistency with headers
      { token: 'comment.title', foreground: 'ffcc69', fontStyle: 'bold' },
      
      // Environment variables - pink/magenta
      { token: 'variable', foreground: 'f48fb1', fontStyle: 'bold' },
      
      // JSON keys - cyan
      { token: 'key.json', foreground: '4fc3f7' },
      
      // JSON strings - light green
      { token: 'string.json', foreground: 'a5d6a7' },
      
      // JSON body content
      { token: 'string.body', foreground: 'e0e0e0' },
      
      // JSON numbers - yellow
      { token: 'number.json', foreground: 'fff59d' },
      { token: 'number.float.json', foreground: 'fff59d' },
      
      // JSON keywords - orange
      { token: 'keyword.json', foreground: 'ffab91' },
      
      // JSON delimiters
      { token: 'delimiter.bracket.json', foreground: 'ffcc80' },
      { token: 'delimiter.array.json', foreground: 'ffcc80' },
      { token: 'delimiter.comma.json', foreground: 'bdbdbd' },
      { token: 'delimiter.colon.json', foreground: 'bdbdbd' },
      
      // Response handler scripts
      { token: 'script.prefix', foreground: '9575cd', fontStyle: 'bold' },
      { token: 'script.content', foreground: 'b39ddb' },
      { token: 'keyword.script', foreground: 'ce93d8', fontStyle: 'bold' },
      { token: 'string.script', foreground: 'c5e1a5' },
      { token: 'function.script', foreground: '80deea' },
      { token: 'property.script', foreground: '90caf9' },
      { token: 'number.script', foreground: 'fff59d' },
      { token: 'delimiter.script', foreground: 'b39ddb' },
      
      // Punctuation
      { token: 'punctuation', foreground: 'e0e0e0' },
      
      // Delimiters
      { token: 'delimiter.bracket', foreground: 'ffcc02' },
      { token: 'delimiter.array', foreground: 'ffcc02' },
      { token: 'delimiter.comma', foreground: 'e0e0e0' },
      { token: 'delimiter.colon', foreground: 'e0e0e0' }
    ],
    colors: {}
  });
  
  editor.defineTheme('http-light', {
    base: 'vs',
    inherit: true,
    rules: [
      // HTTP method highlighting - bright red/orange
      { token: 'keyword.http-method', foreground: 'e65100', fontStyle: 'bold' },
      
      // URL highlighting - blue
      { token: 'string.url', foreground: '1976d2' },
      
      // HTTP headers - orange
      { token: 'keyword.http-header', foreground: 'f57c00' },
      
      // Header values - green
      { token: 'string.http-header-value', foreground: '388e3c' },
      
      // Comments - gray
      { token: 'comment', foreground: '616161', fontStyle: 'italic' },
      
      // Comment titles (###) - darker orange for visibility
      { token: 'comment.title', foreground: 'f57c00', fontStyle: 'bold' },
      
      // Environment variables - purple
      { token: 'variable', foreground: '8e24aa', fontStyle: 'bold' },
      
      // JSON keys - blue
      { token: 'key.json', foreground: '1976d2' },
      
      // JSON strings - green
      { token: 'string.json', foreground: '66bb6a' },
      
      // JSON body content
      { token: 'string.body', foreground: '424242' },
      
      // JSON numbers - amber
      { token: 'number.json', foreground: 'ffa726' },
      { token: 'number.float.json', foreground: 'ffa726' },
      
      // JSON keywords - red
      { token: 'keyword.json', foreground: 'ef5350' },
      
      // JSON delimiters
      { token: 'delimiter.bracket.json', foreground: 'ff9800' },
      { token: 'delimiter.array.json', foreground: 'ff9800' },
      { token: 'delimiter.comma.json', foreground: '757575' },
      { token: 'delimiter.colon.json', foreground: '757575' },
      
      // Response handler scripts
      { token: 'script.prefix', foreground: '5e35b1', fontStyle: 'bold' },
      { token: 'script.content', foreground: '7e57c2' },
      { token: 'keyword.script', foreground: '9c27b0', fontStyle: 'bold' },
      { token: 'string.script', foreground: '7cb342' },
      { token: 'function.script', foreground: '0288d1' },
      { token: 'property.script', foreground: '1976d2' },
      { token: 'number.script', foreground: 'ffa726' },
      { token: 'delimiter.script', foreground: '7e57c2' },
      
      // Punctuation
      { token: 'punctuation', foreground: '424242' },
      
      // Delimiters
      { token: 'delimiter.bracket', foreground: 'f57f17' },
      { token: 'delimiter.array', foreground: 'f57f17' },
      { token: 'delimiter.comma', foreground: '424242' },
      { token: 'delimiter.colon', foreground: '424242' }
    ],
    colors: {}
  });
    
  } catch (error) {
    console.warn('Failed to register HTTP themes:', error);
  }
}

export function createEditor(params: {
  isDark: boolean;
  readonly?: boolean;
  dom: HTMLElement;
  language?: string;  // 语言模式：json, plaintext, http 等
}) {
  // Register HTTP language if needed BEFORE creating editor
  if (params.language === 'http') {
    ensureHttpSetup();
  }
  
  // Determine theme based on language and dark mode
  let theme: string;
  if (params.language === 'http') {
    theme = params.isDark ? 'http-dark' : 'http-light';
  } else {
    theme = params.isDark ? 'vs-dark' : 'vs';
  }
  
  // * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light.
  const e = editor.create(params.dom, {
    readOnly: params.readonly || false,
    language: params.language || "json",
    theme: theme,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
  });
  e.updateOptions({
    fontSize: 14,
    lineNumbersMinChars: 4,
    wordWrap: "on",
    scrollbar: {
      alwaysConsumeMouseWheel: false, // This helps reduce wheel event warnings
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 4,
      horizontalScrollbarSize: 4,
      verticalSliderSize: 2,
      horizontalSliderSize: 2,
      useShadows: false,
      arrowSize: 0,
    },
    // Additional options to reduce event listener warnings
    mouseWheelZoom: false,
  });
  return e;
}

// 替换内容
export function replaceContent(
  editor: editor.IStandaloneCodeEditor | null,
  content: string,
) {
  if (!editor) {
    return;
  }
  editor.setValue(content || "");
}
