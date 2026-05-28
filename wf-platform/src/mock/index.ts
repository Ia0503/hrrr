/**
 * Mock 入口文件（生产环境注入）
 * 
 * 本文件由 vite-plugin-mock 的 injectCode 配置引用，
 * 用于在生产构建时注入 Mock 数据拦截逻辑。
 * 
 * 注意：
 *   - 当前项目 prodEnabled: false，生产环境不启用 Mock
 *   - 此文件作为预留入口，未来如需生产 Mock 可启用
 *   - 真实后端上线后应删除此文件及 vite.config.ts 中的 injectCode
 */

import { createProdMockServer } from "vite-plugin-mock/es/createProdMockServer";

/** 导入所有 Mock 模块 */
import userMocks from "./user";
import taskMocks from "./task";

/** 合并所有 Mock 接口定义 */
const mockModules = [...userMocks, ...taskMocks];

/**
 * 初始化生产环境 Mock 服务
 * 
 * 调用 vite-plugin-mock 提供的 createProdMockServer 函数，
 * 将 Mock 接口注册到 XHR/Fetch 拦截层。
 * 
 * @example
 * ```ts
 * // 在 vite.config.ts 的 injectCode 中引用：
 * import { setupProdMockServer } from './mock/index';
 * setupProdMockServer();
 * ```
 */
export function setupProdMockServer(): void {
  createProdMockServer(mockModules);
  console.log("[mock] 🎭 生产环境 Mock 服务已启动");
}