# ISSUE-001: 主工作区改为两大栏可拖拽布局

## 背景
当前主界面采用固定网格布局：
- 左列：Connection + Send + Response
- 右列：Frame List + Frame Detail

在中等宽度窗口下，Send 侧内容容易拥挤，且用户无法按个人习惯调整左右列宽。

## 目标
将主工作区改为**外层双栏可拖拽布局**：
- 左栏：Connection / Send / Response
- 右栏：Frame List / Frame Detail
- 支持左右拖拽调整两栏宽度
- 小屏（<1320）自动回退为上下堆叠布局

## 实施方案
1. 在 `frontend/src/App.tsx` 引入 `react-resizable-panels` 的 `Group/Panel/Separator`。
2. 桌面端使用外层横向拖拽分栏，默认比例 56/44。
3. 设定 `minSize`：左栏 35%，右栏 30%。
4. 小屏回退到原有上下堆叠布局。
5. 在 `frontend/src/App.css` 增加外层拖拽分隔条样式，并保留左右栏内部网格结构。

## 验收标准
- 左右两栏可拖拽且流畅。
- FrameList 选择行为与 FrameDetail 折叠行为不受影响。
- 1280/1440 宽度下 Send 区与 Frame 区均无横向滚动。
- 小屏回退时无遮挡和布局错位。

## 执行状态
- [x] 建立 issue 记录
- [x] 实施代码改造
- [x] 运行 `npx tsc --noEmit`
- [x] 运行 `npm run build`
