import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcssVite from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";

/**
 * Mock 接口定义（与 vite-plugin-mock 的 MockMethod 兼容）
 * 保持原有 mock 文件的类型导入无需修改
 */
interface MockMethod {
  url: string;
  method?: "get" | "post" | "put" | "delete" | "patch";
  response?: ((opt: {
    body: Record<string, unknown>;
    query: Record<string, unknown>;
    headers: Record<string, unknown>;
    url: Record<string, unknown>;
  }) => unknown) | unknown;
}

/**
 * 自定义 Mock 插件
 *
 * 替代 vite-plugin-mock（与 Vite 8.x 不兼容），
 * 使用 Vite 原生 configureServer 中间件拦截 /api/* 请求。
 */
function createMockPlugin(mockPath: string) {
  /* 使用绝对路径，避免 Vite 8 编译后相对路径漂移到 .vite-temp/ 目录 */
  const projectRoot = fileURLToPath(new URL(".", import.meta.url));

  return {
    name: "vite-native-mock",
    async configureServer(server: { middlewares: Connect.Server }) {
      /* 动态加载所有 mock 模块（使用绝对路径） */
      const mockModules: MockMethod[] = [];
      try {
        const { default: userMocks } = await import(
          `file://${projectRoot}${mockPath}/user.ts`
        );
        const { default: taskMocks } = await import(
          `file://${projectRoot}${mockPath}/task.ts`
        );
        mockModules.push(...(Array.isArray(userMocks) ? userMocks : [userMocks]));
        mockModules.push(...(Array.isArray(taskMocks) ? taskMocks : [taskMocks]));
        console.log(`[mock] ✅ 已加载 ${mockModules.length} 个 Mock 接口`);
      } catch (e) {
        console.error("[mock] ❌ Mock 模块加载失败:", e);
        return;
      }

      /* 注册中间件：拦截所有 /api/ 开头的请求 */
      server.middlewares.use(
        async (
          req: IncomingMessage & { body?: Record<string, unknown> },
          res: ServerResponse,
          next: () => void,
        ) => {
          const reqUrl = req.url?.split("?")[0] ?? ""; /* 去掉查询参数 */

          /* 只处理 /api/ 路径的请求 */
          if (!reqUrl.startsWith("/api/")) {
            return next();
          }

          /* 在已注册的 mock 中查找匹配项 */
          const reqMethod = (req.method ?? "get").toLowerCase();
          const matched = mockModules.find((m) => {
            const mMethod = (m.method ?? "get").toLowerCase();
            return m.url === reqUrl && mMethod === reqMethod;
          });

          if (!matched?.response) {
            return next();
          }

          console.log(`[mock] 🎭 ${reqMethod.toUpperCase()} ${reqUrl}`);

          try {
            /* 解析 POST/PUT 请求体 */
            let body: Record<string, unknown> = {};
            if (["post", "put", "patch"].includes(reqMethod)) {
              body = await new Promise<Record<string, unknown>>((resolve) => {
                const chunks: Buffer[] = [];
                req.on("data", (chunk: Buffer) => chunks.push(chunk));
                req.on("end", () => {
                  try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString()));
                  } catch {
                    resolve({});
                  }
                });
              });
            }

            /* 调用 mock 的 response 函数，透传真实请求头（含 Authorization） */
            const result =
              typeof matched.response === "function"
                ? await matched.response({
                    body,
                    query: {},
                    headers: req.headers as Record<string, unknown>,
                    url: {},
                  })
                : matched.response;

            /* 返回 JSON 响应 */
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH",
              "Access-Control-Allow-Headers": "Content-Type,Authorization",
            });
            res.end(JSON.stringify(result));
          } catch (err) {
            console.error(`[mock] ❌ 处理 ${reqUrl} 异常:`, err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ code: 500, data: null, message: "Mock 内部错误" }));
          }
        },
      );
    },
  };
}

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5177,
    strictPort: true, /* 端口被占用时直接报错，不自动递增到 5178/5179 */
    cors: true,
    hmr: false,
  },

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    vue(),
    tailwindcssVite(),
    createMockPlugin("src/mock"),
  ],
});
