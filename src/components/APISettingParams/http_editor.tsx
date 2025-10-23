import { defineComponent, onMounted, onBeforeUnmount, ref, PropType, watch, nextTick } from "vue";
import { useMessage } from "naive-ui";
import { css } from "@linaria/core";
import { editor, languages, Range } from "monaco-editor/esm/vs/editor/editor.api";
import { createEditor, initializeHttpSupport } from "../../helpers/editor";
import { useSettingStore } from "../../stores/setting";
import { showError } from "../../helpers/util";
import { HTTPRequest } from "../../commands/http_request";
import { useEnvironmentsStore } from "../../stores/environments";
export const ENVRegexp = /\{\{([\S\s]+?)\}\}/g;

const httpEditorClass = css`
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
  
  .editor-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
`;

export default defineComponent({
  name: "HttpEditor",
  props: {
    content: {
      type: String,
      default: "",
    },
    onUpdate: {
      type: Function as PropType<(content: string) => void>,
      required: true,
    },
  },
  setup(props) {
    const settingStore = useSettingStore();
    const message = useMessage();
    const environmentsStore = useEnvironmentsStore();
    const editorContainer = ref<HTMLElement>();
    let editorIns: editor.IStandaloneCodeEditor | null = null;
    let isEditing = false;
    let isApplyingExternal = false;
    
    // Initialize HTTP support immediately to prevent theme flashing
    initializeHttpSupport();

    onMounted(() => {
      if (!editorContainer.value) {
        return;
      }
      
      // Ensure HTTP themes are fully registered before creating editor
      initializeHttpSupport();

      editorIns = createEditor({
        dom: editorContainer.value,
        isDark: settingStore.isDark,
        language: 'http',
      });
      
      // Set editor options with correct theme immediately
      const currentTheme = settingStore.isDark ? 'http-dark' : 'http-light';
      
      editorIns.updateOptions({
        theme: currentTheme,
        wordWrap: "on",
        minimap: {
          enabled: false,
        },
        scrollBeyondLastLine: false,
        scrollbar: {
          alwaysConsumeMouseWheel: false,
          vertical: 'visible',
          horizontal: 'visible',
          verticalScrollbarSize: 4,
          horizontalScrollbarSize: 4,
          verticalSliderSize: 2,
          horizontalSliderSize: 2,
          useShadows: false,
          arrowSize: 0,
        },
      });

      editorIns.setValue(props.content);
      
      // Apply theme with a simple retry, without reading back internal options (to satisfy TS types)
      const applyTheme = (attempt = 0) => {
        if (!editorIns || attempt > 3) return; // Max 3 attempts
        const finalTheme = settingStore.isDark ? 'http-dark' : 'http-light';
        try {
          editorIns.updateOptions({ theme: finalTheme } as any);
        } catch (error) {
          console.warn(`[HttpEditor] Theme application attempt ${attempt + 1} failed:`, error);
        } finally {
          if (attempt < 3) {
            setTimeout(() => applyTheme(attempt + 1), 30);
          }
        }
      };
      
      // Start theme application after minimal delay
      setTimeout(() => applyTheme(), 20);

      editorIns.onDidChangeModelContent(() => {
        if (!editorIns) return;
        if (isApplyingExternal) return; // 忽略程序化更新引发的回调，避免回路与抖动
        props.onUpdate(editorIns.getValue());
      });
      
      editorIns.onDidFocusEditorText(() => {
        isEditing = true;
      });
      
      editorIns.onDidBlurEditorText(() => {
        isEditing = false;
      });
    });

    // Watch for content prop changes
    watch(
      () => props.content,
      (newContent, oldContent) => {
        if (!editorIns) return;
        
        // 如果内容没有变化，不更新
        if (newContent === oldContent) return;
        
        const oldText = editorIns.getValue();
        // 如果编辑器当前值和新内容相同，不更新
        if (oldText === newContent) return;
        
        // 如果正在编辑，不覆盖用户的输入
        if (isEditing) {
          return;
        }

        const tryReplaceOnlyRequestLine = () => {
          try {
            const findRequestLineIndex = (text: string) => {
              const lines = (text || "").split("\n");
              for (let i = 0; i < lines.length; i++) {
                const t = lines[i].trim();
                if (!t) continue; // 跳过空行
                if (t.startsWith("#")) continue; // 跳过注释/标题
                return i; // 第一条非空非注释行：请求行
              }
              return -1;
            };

            const oldIdx = findRequestLineIndex(oldText);
            const newIdx = findRequestLineIndex(newContent || "");
            if (oldIdx === -1 || newIdx === -1) return false;

            const oldLines = oldText.split("\n");
            const newLines = (newContent || "").split("\n");
            const oldTail = oldLines.slice(oldIdx + 1).join("\n");
            const newTail = newLines.slice(newIdx + 1).join("\n");
            // 仅当除请求行外的其他内容完全一致时，才做最小替换
            if (oldTail !== newTail) return false;

            if (!editorIns) return false;
            const model = editorIns.getModel();
            if (!model) return false;
            const lineNumber = oldIdx + 1; // Monaco 行号从 1 开始
            const range = new Range(
              lineNumber,
              1,
              lineNumber,
              model.getLineMaxColumn(lineNumber)
            );
            // 仅替换请求行，锚定“最后一行”的相对位置，避免视口抖动
            const prevScrollTop = editorIns.getScrollTop();
            const prevAnchorLine = model.getLineCount();
            const prevAnchorTopPx = editorIns.getTopForLineNumber(prevAnchorLine) - prevScrollTop;

            // 使用 model.applyEdits，避免 executeEdits 可能引发的视口调整
            isApplyingExternal = true;
            model.applyEdits([
              { range, text: newLines[newIdx] || "" }
            ]);
            isApplyingExternal = false;

            // 恢复锚定相对位置
            const nextModel = editorIns.getModel();
            const nextAnchorLine = nextModel?.getLineCount() || prevAnchorLine;
            const nextTopForAnchor = editorIns.getTopForLineNumber(nextAnchorLine);
            editorIns.setScrollTop(nextTopForAnchor - prevAnchorTopPx);
            return true;
          } catch {
            return false;
          }
        };

        // 优先尝试仅替换请求行，避免整文重绘导致末行跳动
        const replaced = tryReplaceOnlyRequestLine();
        if (replaced) return;

        // 回退：整文替换，锚定“最后一行”的相对位置，尽量避免抖动
        isApplyingExternal = true;
        const model = editorIns.getModel();
        const prevScrollTop = editorIns.getScrollTop();
        const prevAnchorLine = model?.getLineCount() || 1;
        const prevAnchorTopPx = editorIns.getTopForLineNumber(prevAnchorLine) - prevScrollTop;

        editorIns.setValue(newContent || "");

        const nextModel = editorIns.getModel();
        const nextAnchorLine = nextModel?.getLineCount() || prevAnchorLine;
        const nextTopForAnchor = editorIns.getTopForLineNumber(nextAnchorLine);
        editorIns.setScrollTop(nextTopForAnchor - prevAnchorTopPx);
        isApplyingExternal = false;
      }
    );

    // Watch for theme changes
    watch(
      () => settingStore.isDark,
      (isDark) => {
        if (!editorIns) return;
        
        
        // Determine the correct theme for HTTP language
        const newTheme = isDark ? 'http-dark' : 'http-light';
        
        try {
          // Force Monaco Editor to update theme
          editorIns.updateOptions({
            theme: newTheme
          });
          
        } catch (error) {
          console.warn('[HttpEditor] Failed to update theme:', error);
          // Fallback to default themes
          const fallbackTheme = isDark ? 'vs-dark' : 'vs';
          editorIns.updateOptions({
            theme: fallbackTheme
          });
        }
      },
      { immediate: false } // Don't trigger on initial setup
    );

    onBeforeUnmount(() => {
      if (editorIns) {
        editorIns.dispose();
        editorIns = null;
      }
    });

    const replaceEnvVariables = (text: string): string => {
      // 使用新环境系统替换变量
      return environmentsStore.replaceVariables(text);
    };

    const parseHttpRequest = (text: string): HTTPRequest | null => {
      try {
        const lines = text.split("\n");
        let currentLine = 0;

        // 跳过空行和注释
        while (
          currentLine < lines.length &&
          (lines[currentLine].trim() === "" ||
            lines[currentLine].trim().startsWith("#"))
        ) {
          currentLine++;
        }

        if (currentLine >= lines.length) {
          return null;
        }

        // 解析请求行 (METHOD URL)
        const requestLine = lines[currentLine].trim();
        const requestParts = requestLine.split(/\s+/);
        if (requestParts.length < 2) {
          throw new Error("Invalid request line format");
        }

        const method = requestParts[0];
        const url = requestParts[1];
        currentLine++;

        // 解析headers
        const headers: Array<{ key: string; value: string; enabled: boolean }> =
          [];
        while (
          currentLine < lines.length &&
          lines[currentLine].trim() !== ""
        ) {
          const line = lines[currentLine].trim();
          const colonIndex = line.indexOf(":");
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            headers.push({ key, value, enabled: true });
          }
          currentLine++;
        }

        // 跳过空行
        while (currentLine < lines.length && lines[currentLine].trim() === "") {
          currentLine++;
        }

        // 剩余部分是body
        const body =
          currentLine < lines.length
            ? lines.slice(currentLine).join("\n")
            : "";

        return {
          method,
          url,
          uri: url,
          headers,
          body,
          contentType:
            headers.find(
              (h) => h.key.toLowerCase() === "content-type",
            )?.value || "application/json",
          query: [],
          auth: [],
        };
      } catch (err) {
        console.error("Parse HTTP request failed:", err);
        return null;
      }
    };

    return {
      editorContainer,
      parseHttpRequest,
      replaceEnvVariables,
    };
  },
  render() {
    return (
      <div class={httpEditorClass}>
        <div class="editor-container" ref="editorContainer"></div>
      </div>
    );
  },
});
