# 绳网风格论坛（Inter-Knot）

这是一个以《绝区零》绳网为灵感的轻量论坛/讨论社区，基于 SvelteKit + PocketBase 构建，尝试还原“线索串联与话题聚合”的社区氛围。

## 功能概览
- 帖子发布、编辑与浏览
- 评论/回复、点赞、关注与阅读统计
- 举报与审核流程（AI 初审 + 人工复核队列）
- 邀请码机制与合规声明页
- 系统消息与个人记录页

## 技术栈
- 前端：SvelteKit + TypeScript
- 后端：PocketBase
- API：SvelteKit server routes

## 本地运行（开发）
1. 复制环境变量：`cp webapp/.env.example webapp/.env`
2. 启动 PocketBase：下载 PocketBase 后放到 `server/pocketbase` 并运行 `cd server && ./pocketbase serve --http=0.0.0.0:8090`
3. 初始化集合：`cd webapp && node scripts/setup_collections.mjs`
4. 启动前端：`cd webapp && npm install && npm run dev`

## PocketBase 集合结构
- 默认方式：运行 `cd webapp && node scripts/setup_collections.mjs`，脚本会创建或更新集合结构。
- 可选方式：在 PocketBase 管理后台导出/导入集合结构 JSON（不含数据），用于环境迁移。
- 可选方式：执行 `cd server && ./pocketbase migrate collections` 生成 `server/pb_migrations` 迁移文件（如需提交，请从 `.gitignore` 移除该路径）。

## 致谢
- 感谢 [blacktunes/interknot](https://github.com/blacktunes/interknot) 的概念与视觉氛围启发
- 感谢 [share121/inter-knot](https://github.com/share121/inter-knot) 的实现参考与灵感

## 说明
本项目为爱好者非商业作品，与米哈游及《绝区零》官方无关，欢迎反馈与交流。

## 许可证
MIT License
