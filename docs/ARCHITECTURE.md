# 代码架构指南

> 在添加新功能前请先阅读此文件

---

## 📁 目录结构

```
src/
├── main.ts          # 仅负责：初始化、组装系统、运行主循环
├── types/           # TypeScript 类型定义（模块化）
│   ├── audio.ts     # 音频接口
│   ├── world.ts     # 世界/区块/天气类型
│   ├── player.ts    # 玩家/控制/手部类型
│   ├── shader.ts    # 着色器 uniform 类型
│   ├── app.ts       # 应用配置
│   └── index.ts     # 统一导出
├── audio/           # 音效系统
│   ├── AudioController.ts # 高层音频控制器（业务逻辑）
│   └── AudioEngine.ts     # 底层 WebAudio 引擎
├── config/          # 配置常量
│   ├── audio.ts     # 音频参数配置
│   ├── constants.ts # 集中管理的游戏常量（性能、机制阈值等）
│   ├── physics.ts   # 物理/玩家参数配置
│   └── index.ts     # 统一导出
├── core/            # 核心初始化与逐帧更新辅助模块
│   ├── CableAudioUpdater.ts  # 根据玩家与线缆的距离更新音频
│   ├── PostProcessing.ts     # 后处理效果（Dither、Pixelation）
│   ├── SceneSetup.ts         # 场景与相机初始化
│   └── ShaderUniformUpdater.ts # 每帧同步着色器 uniform
├── player/          # 玩家相关（控制、手部、道具、机制）
│   ├── Controls.ts       # 玩家移动与输入控制
│   ├── FlowerProp.ts     # 手持花朵道具及其状态/动画
│   ├── GazeMechanic.ts   # 注视机制（检测玩家看向 Sky Eye）
│   ├── HandsModel.ts     # 玩家手部模型管理
│   ├── OverrideMechanic.ts # “Override”机制逻辑（Shift 键触发）
│   └── PlayerManager.ts  # 玩家系统总管（整合 Controls, Hands, Gaze, Override）
├── shaders/         # 着色器
│   └── DitherShader.ts   # 1-bit 抖动着色器定义
├── stats/           # 游戏统计与快照系统
│   ├── RunStatsCollector.ts     # 收集本轮游戏的数据（注视时间、移动等）
│   ├── SnapshotOverlay.ts       # 生成并在日落时显示的统计快照 UI
│   └── StateSnapshotGenerator.ts # 将统计数据转化为视觉快照的逻辑
├── ui/              # 用户界面与HUD
│   └── HUD.ts            # 抬头显示器（坐标、状态调试信息）
├── world/           # 世界系统（区块、建筑、天气、昼夜...）
│   ├── BuildingFactory.ts # 程序化建筑生成
│   ├── CableSystem.ts     # 程序化电缆生成与动画
│   ├── ChunkAnimator.ts   # 区块动画逻辑（建筑、植物、雾气）
│   ├── ChunkManager.ts    # 无限世界区块管理系统
│   ├── DayNightCycle.ts   # 昼夜循环控制
│   ├── FloorTile.ts       # 地面瓦片与网格生成
│   ├── FloraFactory.ts    # 程序化植物生成
│   ├── RiftMechanic.ts    # 裂缝机制（坠落、重生、音频）
│   ├── RoomConfig.ts      # 不同“心智房间”的配置（Info Overflow, Forced Alignment 等）
│   ├── SharedAssets.ts    # 共享材质与几何体资源
│   ├── SkyEye.ts          # 空中“Sky Eye”对象的行为与视觉
│   └── WeatherSystem.ts   # 天气系统（雨、雪、故障效果）
└── utils/           # 工具函数
    ├── dispose.ts          # Three.js 资源释放工具（几何体、材质、纹理）
    ├── hash.ts             # 字符串哈希工具
    └── ScreenshotManager.ts # 截图功能管理

styles/
└── main.css         # 全局样式
```

---

## ✅ 新功能开发规则

### 1. 每个系统一个文件
- ❌ 不要在 `main.ts` 中写业务逻辑
- ✅ 创建独立模块，如 `WeatherSystem.ts`

### 2. 类的基本结构
```typescript
export class NewSystem {
    private state: SomeType;
    
    constructor() {
        // 初始化状态
    }

    update(delta: number, context: SomeContext): void {
        // 每帧更新逻辑
        // context 包含需要的外部依赖
    }
}
```

### 3. main.ts 只做三件事
```typescript
// 1. 导入系统
import { NewSystem } from './world/NewSystem';

// 2. 在 constructor() 中实例化
this.newSystem = new NewSystem();

// 3. 在 animate() 中更新
this.newSystem.update(delta, { /* 依赖 */ });
```

### 4. 类型定义
- 共享接口和类型放在 `types.ts`
- 模块私有类型可以放在模块文件内

---

## 📂 放置位置

| 功能类型 | 目录 | 示例 |
|----------|------|------|
| 核心初始化 | `core/` | SceneSetup, PostProcessing |
| 环境效果 | `world/` | WeatherSystem, DayNightCycle, SkyEye |
| 玩家相关 | `player/` | Controls, HandsModel, FlowerProp |
| 玩家机制 | `player/` | GazeMechanic, OverrideMechanic |
| 统计/快照 | `stats/` | RunStatsCollector, SnapshotOverlay |
| UI/HUD | `ui/` | HUD |
| 渲染效果 | `shaders/` | DitherShader |
| 音效 | `audio/` | AudioEngine, AudioController |
| 工具 | `utils/` | hash, dispose, ScreenshotManager |
| 样式 | `styles/` | main.css |

---

## 🔄 重构信号

如果发现以下情况，应该重构：
- `main.ts` 超过 300 行 ✅ *（当前约 280 行，已提取 PlayerManager 和 RiftMechanic）*
- 同一功能的代码分散在多处
- 需要复制粘贴代码

---

## 📝 当前状态

- **语言**: TypeScript
- **构建工具**: Vite
- **测试**: Vitest (`npm test`)
- **主要依赖**: Three.js

### 测试覆盖

| 目录 | 测试文件 | 状态 |
|------|----------|------|
| `utils/` | `hash.test.ts` | ✅ |
| `stats/` | `RunStatsCollector.test.ts` | ✅ |
| `stats/` | `StateSnapshotGenerator.test.ts` | ✅ |
| `player/` | `GazeMechanic.test.ts` | ✅ (27 测试用例) |

*最后更新: 2025-12-23*

