# Impro 空压机 AI 维修副驾（老宋）

纯前端 H5 空压机智能诊断 / 维修助手。支持：

- 知识库文件上传：PDF / Word(.docx) / TXT·MD 自动提取文本入库检索；音频 / 视频可 AI 转写或手动粘贴文本
- 浏览器内 RAG 检索（内置 knowledge.json + 用户上传，IndexedDB 持久化）
- 离线规则引擎（零 Key 可用）与在线 LLM 诊断（混元 / OpenAI 兼容）
- 案例沉淀与审核队列

## 在线预览（GitHub Pages）
https://stevenlau2000.github.io/

## 本地运行
任意静态服务器即可，例如：
    python3 -m http.server 8099
然后浏览器打开 http://localhost:8099
